// Record ids and human document numbers for quotes and contracts.
//
// Ids are random (qt_…, ct_…): they only need to be unique, and a browser can
// guarantee that without seeing anyone else's records. The human numbers people
// read and quote to customers (SQ/M000012/26-27, CT-004) come from the shared
// database counter (allocate_doc_no, supabase/doc_numbers_v1.sql), so two users
// can never be handed the same one. If the database can't be reached, a local
// guess is used and the record is flagged so the number can be checked.
//
// Kept free of React and of the Supabase client import so it is unit-testable:
// the allocator is passed in.
import { formatQuoteNumber, fiscalYearSuffix } from "./pricingEngine.js";

const rand = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
export const newQuoteId = () => `qt_${rand()}`;
export const newContractId = () => `ct_${rand()}`;

const seqOf = (s, re) => { const m = typeof s === "string" && s.match(re); return m ? parseInt(m[1], 10) : 0; };

/** Next quote number, e.g. SQ/M000013/26-27. Returns { quoteNo, provisional }. */
export async function nextQuoteNo(allocate, config, knownQuotes = [], date = new Date()) {
  const fy = fiscalYearSuffix(date);
  const n = await allocate(`quote:${fy}`);
  if (n) return { quoteNo: formatQuoteNumber(n, date, config), provisional: false };
  // Offline fallback: highest number this browser knows about (may collide; flagged).
  const max = knownQuotes.reduce((m, q) => (typeof q.quoteNo === "string" && q.quoteNo.endsWith(fy)
    ? Math.max(m, seqOf(q.quoteNo, /(\d+)\/\d{2}-\d{2}$/)) : m), 0);
  return { quoteNo: formatQuoteNumber(max + 1, date, config), provisional: true };
}

/** Next contract number, e.g. CT-005. Returns { contractNo, provisional }. */
export async function nextContractNo(allocate, knownContracts = []) {
  const n = await allocate("contract");
  if (n) return { contractNo: `CT-${String(n).padStart(3, "0")}`, provisional: false };
  const max = knownContracts.reduce((m, c) => Math.max(m, seqOf(c.contractNo, /^CT-(\d+)$/), seqOf(c.id, /^CT-(\d+)$/)), 0);
  return { contractNo: `CT-${String(max + 1).padStart(3, "0")}`, provisional: true };
}

/** What a revision must NOT inherit from the quote it revises. */
export function revisionOf(q, { id, today }) {
  const needsReapproval = ["Approved", "Pending", "Rejected"].includes(q.approvalStatus);
  return {
    ...q,
    id,
    status: "Draft",
    version: (q.version || 1) + 1,
    createdDate: today, sentDate: "", expiryDate: "",
    isFinal: false,
    supersedesQuoteId: q.id,
    // Approval belongs to the version that was approved, not to its revision.
    approvalStatus: needsReapproval ? "Pending" : (q.approvalStatus || ""),
    approvalRequestedAt: needsReapproval ? new Date().toISOString() : "",
    approvedBy: "", approvedAt: "", rejectedReason: "", approvalNotes: "",
    // Customer-side state stays with the original.
    acceptToken: "", acceptedDate: "", signedQuoteUrl: "", contractId: "",
    emailLog: [], lastReminderAt: "",
    changeLog: [{ id: rand(), at: new Date().toISOString(), by: "", field: "", from: "", to: "created", note: `Revision of ${q.quoteNo || q.id}` }],
    notes: `Revised from ${q.quoteNo || q.id}. ` + (q.notes || ""),
  };
}

/** May this quote go to the customer? Approval states set by either quote screen count. */
export function sendBlockedReason(q, legacyNeedsApproval) {
  if (q.approvalStatus === "Pending") return "awaiting approval";
  if (q.approvalStatus === "Rejected") return "approval was rejected";
  if (legacyNeedsApproval && q.approvalStatus !== "Approved") return "needs approval";
  return "";
}
