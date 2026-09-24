// ═══════════════════════════════════════════════════════════════════
// Which contacts belong to the account / lead / deal a call is about?
// ═══════════════════════════════════════════════════════════════════
// Shared by Quick Log and the Log Call modal so picking a record narrows
// the Contacts list to that record's people instead of the whole company
// address book. Pure — scripts/test-related-contacts.mjs runs this code.
//
// A contact is related when:
//   account  its accountId is the account
//   lead     it's in lead.contactIds, it lists the lead in linkedLeadIds,
//            it has the lead's email or phone, or it belongs to the lead's
//            account (lead.accountId)
//   deal     it's the primary / a secondary contact, it lists the deal in
//            linkedOpps, or it belongs to the deal's account
// Several picks → the union (an account plus one of its deals, say).

const emailKey = (s) => String(s || "").trim().toLowerCase();
const phoneKey = (s) => { const d = String(s || "").replace(/\D/g, ""); return d.length >= 7 ? d.slice(-10) : ""; };

/**
 * @param {Array}  contacts
 * @param {object} sel  { account, lead, opp } — records (or null); a lead may
 *                      be a stub { id, contactIds } when only ids are known
 * @returns {{ scoped: boolean, contacts: Array, reason: string }}
 *   scoped=false when nothing is picked (caller shows everyone).
 */
export function relatedContacts(contacts = [], { account = null, lead = null, opp = null } = {}) {
  const live = (contacts || []).filter(c => c && !c.isDeleted);
  if (!account && !lead && !opp) return { scoped: false, contacts: live, reason: "" };

  const accountIds = new Set([account?.id, lead?.accountId, opp?.accountId].filter(Boolean));
  const ids = new Set([
    ...(lead?.contactIds || []),
    opp?.primaryContactId, ...(opp?.secondaryContactIds || []),
  ].filter(Boolean));
  const leadEmail = emailKey(lead?.email), leadPhone = phoneKey(lead?.phone);

  const out = live.filter(c =>
    ids.has(c.id)
    || (c.accountId && accountIds.has(c.accountId))
    || (lead?.id && (c.linkedLeadIds || []).includes(lead.id))
    || (opp?.id && (c.linkedOpps || []).includes(opp.id))
    || (leadEmail && [c.email, c.alternateEmail].some(e => emailKey(e) === leadEmail))
    || (leadPhone && [c.phone, c.alternatePhone].some(p => phoneKey(p) === leadPhone))
  );

  const what = [account && "account", lead && "lead", opp && "deal"].filter(Boolean).join(" / ");
  return { scoped: true, contacts: out, reason: what };
}
