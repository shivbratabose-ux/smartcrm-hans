// Verifies which contacts Quick Log / Log Call show for a picked record.
// Run: node scripts/test-related-contacts.mjs
import { relatedContacts } from "../src/utils/relatedContacts.js";

let pass = 0, fail = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : `\n      expected ${JSON.stringify(want)} got ${JSON.stringify(got)}`}`);
};
const ids = (r) => r.contacts.map(c => c.id).sort();

const contacts = [
  { id: "c1", name: "Ravi", accountId: "a1", email: "ravi@acme.in" },
  { id: "c2", name: "Anil", accountId: "a1" },
  { id: "c3", name: "Meera", accountId: "a2", phone: "022 4455 6677" },
  { id: "c4", name: "Walk-in", email: "OPS@brussels-airport.be" },            // no account, matches lead email
  { id: "c5", name: "Linked", linkedLeadIds: ["l1"] },                        // linked from the contact side
  { id: "c6", name: "Deal side", linkedOpps: ["o1"] },
  { id: "c7", name: "Gone", accountId: "a1", isDeleted: true },
  { id: "c8", name: "Unrelated", accountId: "a9" },
];

check("nothing picked → not scoped, everyone (minus deleted)", [relatedContacts(contacts, {}).scoped, ids(relatedContacts(contacts, {}))], [false, ["c1", "c2", "c3", "c4", "c5", "c6", "c8"]]);
check("account → its contacts only", ids(relatedContacts(contacts, { account: { id: "a1" } })), ["c1", "c2"]);
check("deleted contacts never shown", ids(relatedContacts(contacts, { account: { id: "a1" } })).includes("c7"), false);

const lead = { id: "l1", company: "BRUSSELS AIRPORT COMPANY", email: "ops@brussels-airport.be", contactIds: ["c3"] };
check("lead → contactIds + linkedLeadIds + same email", ids(relatedContacts(contacts, { lead })), ["c3", "c4", "c5"]);
check("lead with an account also brings the account's contacts", ids(relatedContacts(contacts, { lead: { id: "lx", accountId: "a1" } })), ["c1", "c2"]);
check("lead matched by phone in another format", ids(relatedContacts(contacts, { lead: { id: "ly", phone: "+91-22-44556677" } })), ["c3"]);
check("lead stub (ids only) from the Log Call prefill", ids(relatedContacts(contacts, { lead: { id: "l1", contactIds: ["c1"] } })), ["c1", "c5"]);

const opp = { id: "o1", accountId: "a2", primaryContactId: "c1", secondaryContactIds: ["c2"] };
check("deal → primary + secondary + linkedOpps + its account", ids(relatedContacts(contacts, { opp })), ["c1", "c2", "c3", "c6"]);
check("several picks → union", ids(relatedContacts(contacts, { account: { id: "a2" }, lead: { id: "l1" } })), ["c3", "c5"]);
check("picked record with no contacts → scoped, empty", [relatedContacts(contacts, { lead: { id: "l9", company: "New Co" } }).scoped, relatedContacts(contacts, { lead: { id: "l9" } }).contacts.length], [true, 0]);
check("reason names what was picked", relatedContacts(contacts, { account: { id: "a1" }, opp }).reason, "account / deal");

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
