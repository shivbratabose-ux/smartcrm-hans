// Verifies visiting-card matching — the same module the scanner uses.
// Run: node scripts/test-card-match.mjs
import {
  normCompany, phoneKey, emailDomain, webDomain, cardDomain,
  matchCard, cardToContactFields, mergeCardIntoContact, nextContactRef,
} from "../src/utils/cardMatch.js";

let pass = 0, fail = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : `\n      expected ${JSON.stringify(want)} got ${JSON.stringify(got)}`}`);
};

console.log("— normalising —");
check("company suffixes ignored", [normCompany("ACME Logistics Pvt. Ltd."), normCompany("acme logistics private limited"), normCompany("The ACME Logistics LLP")], ["acme logistics", "acme logistics", "acme logistics"]);
check("& becomes and", normCompany("Shah & Sons"), "shah and sons");
check("phone: +91 / 0 / spaces → last 10 digits", [phoneKey("+91 98765 43210"), phoneKey("098765-43210"), phoneKey("9876543210")], ["9876543210", "9876543210", "9876543210"]);
check("too-short phone ignored", phoneKey("123"), "");
check("email / web domains", [emailDomain("Ravi@ACMElogistics.in"), webDomain("https://www.acmelogistics.in/contact")], ["acmelogistics.in", "acmelogistics.in"]);
check("free-mail never a company domain", cardDomain({ emails: ["ravi.k@gmail.com"] }), "");
check("website preferred over email", cardDomain({ website: "www.acme.in", emails: ["r@acmegroup.com"] }), "acme.in");

const accounts = [
  { id: "a1", name: "ACME LOGISTICS PVT LTD", website: "acmelogistics.in" },
  { id: "a2", name: "Swift Cargo" },
  { id: "a3", name: "ACME Logistics Worldwide Holdings" },
  { id: "a9", name: "Deleted Co", isDeleted: true },
];
const contacts = [
  { id: "c1", name: "Ravi Kumar", email: "ravi@acmelogistics.in", phone: "+91 98765 43210", accountId: "a1" },
  { id: "c2", name: "Meera Shah", email: "meera@swiftcargo.co.in", phone: "022 4455 6677", accountId: "a2" },
  { id: "c3", name: "Anil Rao", email: "anil@acmelogistics.in", accountId: "a1" },
];
const leads = [
  { id: "l1", company: "Swift Cargo Pvt Ltd", email: "ops@swiftcargo.co.in", phone: "022 4455 6677" },
  { id: "l2", company: "Brand New Freight", email: "hello@brandnew.in" },
];
const opps = [
  { id: "o1", accountId: "a1", stage: "Proposal", primaryContactId: "c3" },
  { id: "o2", accountId: "a1", stage: "Won" },
  { id: "o3", accountId: "a2", stage: "Negotiation", secondaryContactIds: ["c2"] },
];
const db = { accounts, contacts, leads, opps };

console.log("— existing person —");
const m1 = matchCard({ name: "Ravi Kumar", company: "Acme Logistics Private Limited", emails: ["RAVI@acmelogistics.in"], phones: [{ type: "mobile", number: "98765 43210" }] }, db);
check("contact found by email + phone", [m1.contacts[0]?.record.id, m1.contacts[0]?.strength, m1.contacts[0]?.reasons], ["c1", "strong", ["Same email", "Same phone", "Same name at this company"]]);
check("account found by name (suffixes differ)", [m1.accounts[0]?.record.id, m1.accounts[0]?.strength], ["a1", "strong"]);
check("similar-name account listed as weak, after", m1.accounts.map(a => [a.record.id, a.strength]), [["a1", "strong"], ["a3", "weak"]]);
check("open deal at the account, won deal excluded", m1.opps.map(o => o.record.id), ["o1"]);
check("suggest updating the existing contact", m1.suggestion, "update-contact");

console.log("— new person at a known company —");
const m2 = matchCard({ name: "Priya Nair", company: "ACME LOGISTICS", emails: ["priya@acmelogistics.in"], phones: [] }, db);
check("no contact match", m2.contacts.length, 0);
check("account by name + domain", [m2.accounts[0]?.record.id, m2.accounts[0]?.reasons.sort()], ["a1", ["Contacts at @acmelogistics.in", "Same company name", "Website acmelogistics.in"]]);
check("suggest adding to the account", m2.suggestion, "add-to-account");

console.log("— company known only as a lead —");
const m3 = matchCard({ name: "Kiran", company: "Brand New Freight", emails: ["kiran@brandnew.in"], phones: [] }, db);
check("lead by company", [m3.leads[0]?.record.id, m3.leads[0]?.strength], ["l2", "medium"]);
check("suggest adding to the lead", m3.suggestion, "add-to-lead");

console.log("— lead and account both match, deal via contact —");
const m4 = matchCard({ name: "Meera Shah", company: "Swift Cargo", emails: ["meera@swiftcargo.co.in"], phones: [{ type: "office", number: "+91-22-44556677" }] }, db);
check("lead found by phone even with different formatting", m4.leads.map(l => l.record.id), ["l1"]);
check("deal found (account + contact on it)", [m4.opps[0]?.record.id, m4.opps[0]?.reasons], ["o3", ["Open deal at Swift Cargo", "This contact is on the deal"]]);

console.log("— unknown —");
const m5 = matchCard({ name: "Someone", company: "Totally Unknown Co", emails: ["x@gmail.com"], phones: [{ number: "9000000000" }] }, db);
check("nothing matches, suggest new lead", [m5.contacts.length, m5.accounts.length, m5.leads.length, m5.suggestion], [0, 0, 0, "new-lead"]);
check("deleted records never match", matchCard({ company: "Deleted Co" }, db).accounts.length, 0);
check("gmail domain doesn't link unrelated people", matchCard({ name: "A", company: "", emails: ["someone@gmail.com"] }, { ...db, contacts: [...contacts, { id: "c9", name: "B", email: "other@gmail.com", accountId: "a2" }] }).accounts.length, 0);

console.log("— contact fields & merge —");
const f = cardToContactFields({ name: " Ravi Kumar ", designation: "GM Ops", emails: ["Ravi@Acme.in", "ravi.k@gmail.com"],
  phones: [{ type: "office", number: "022 1111 2222" }, { type: "fax", number: "022 3333" }, { type: "mobile", number: "+91 98765 43210" }],
  address: { city: "Mumbai", state: "Maharashtra", pincode: "400001", country: "India" }, linkedin: "in/ravik" });
check("mobile first, fax dropped, emails lowercased", [f.name, f.phone, f.alternatePhone, f.email, f.alternateEmail, f.city, f.source],
  ["Ravi Kumar", "+91 98765 43210", "022 1111 2222", "ravi@acme.in", "ravi.k@gmail.com", "Mumbai", "Visiting card"]);
const mg = mergeCardIntoContact({ name: "Ravi", phone: "+91 90000 00000", email: "ravi@acme.in", designation: "Manager" }, f);
check("merge fills blanks only, keeps existing designation", [mg.patch.designation, mg.patch.city, "phone" in mg.patch], [undefined, "Mumbai", false]);
check("a different mobile goes to the free alternate slot", mg.patch.alternatePhone, "+91 98765 43210");
check("merge reports what it added", mg.added.includes("Alternate phone") && mg.added.includes("City"), true);
check("nothing new → empty patch", mergeCardIntoContact({ ...f }, f).added, []);

console.log("— contact reference —");
check("next CON number", nextContactRef([{ contactId: "CON-007" }, { contactId: "CON-012" }]), "CON-013");
check("timestamp refs ignored", nextContactRef([{ contactId: "CON-004" }, { contactId: "CON-1790000000000" }]), "CON-005");
check("first contact", nextContactRef([]), "CON-001");

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
