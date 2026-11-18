// Quote Assistant: only what the CRM knows reaches the pricing builder.
// Run: node scripts/test-quote-assistant.mjs
import { cleanDraft, CLOSED, EMPTY_DRAFT } from "../src/lib/quotation/assistantDraft.js";

let pass = 0, fail = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : `\n      expected ${JSON.stringify(want)}\n      got      ${JSON.stringify(got)}`}`);
};

const catalogue = [{ code: "P01", name: "iCAFFE" }, { code: "AS02", name: "OCR add-on" }];
const opps = [{ id: "o1", title: "Blueport – iCAFFE" }];
const ctx = { catalogue, opps, currencies: ["INR", "USD"] };

console.log("\nDraft from the chat");
const r = cleanDraft({
  oppId: "o1", segment: "Enterprise", currency: "USD", hosting: "Hans", billingFrequency: "Quarterly", overallDiscountPct: 5, prepaymentApplicable: true, notes: "MD wants demo first",
  lines: [{ productCode: "p01", qty: 25, months: 12, discountPct: 0, why: "25 users" }, { productCode: "AS02", qty: 1, months: 1, discountPct: 0, why: "" }, { productCode: "ZZ9", qty: 3, months: 12, discountPct: 0, why: "made up" }],
}, ctx);
check("valid values kept", [r.draft.oppId, r.draft.segment, r.draft.currency, r.draft.hosting, r.draft.billingFrequency, r.draft.overallDiscountPct, r.draft.prepaymentApplicable], ["o1", "Enterprise", "USD", "Hans", "Quarterly", 5, true]);
check("codes matched case-insensitively, stored as in the catalogue", r.draft.lines.map((l) => l.productCode), ["P01", "AS02"]);
check("a code not in the price list is dropped and reported", r.dropped, ["ZZ9"]);
check("quantities kept", r.draft.lines.map((l) => [l.qty, l.months]), [[25, 12], [1, 1]]);

console.log("\nAnything the CRM doesn't know is refused");
const bad = cleanDraft({ oppId: "someone-elses", segment: "Galactic", currency: "BTC", hosting: "Cloud", billingFrequency: "Weekly", overallDiscountPct: 150,
  lines: [{ productCode: "P01", qty: -4, months: 999, discountPct: 120 }] }, ctx);
check("unknown opportunity cleared and flagged", [bad.draft.oppId, bad.badOpp], ["", true]);
check("unknown segment / currency / hosting / billing fall back", [bad.draft.segment, bad.draft.currency, bad.draft.hosting, bad.draft.billingFrequency], ["Commercial", "INR", "", "Monthly"]);
check("numbers kept in range", [bad.draft.overallDiscountPct, bad.draft.lines[0].qty, bad.draft.lines[0].months, bad.draft.lines[0].discountPct], [100, 1, 120, 100]);
check("missing pieces → empty draft", cleanDraft(null, ctx).draft, EMPTY_DRAFT);
check("non-numbers → defaults", cleanDraft({ lines: [{ productCode: "P01", qty: "abc", months: null, discountPct: "x" }] }, ctx).draft.lines[0], { productCode: "P01", qty: 1, months: 1, discountPct: 0, why: "" });

console.log("\nOnly open deals are offered");
check("won / lost / closed stages excluded", ["Won", "Lost", "closed_won", "Closed Lost", "Proposal", "Negotiation"].map((s) => CLOSED.test(s)), [true, true, true, true, false, false]);

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
