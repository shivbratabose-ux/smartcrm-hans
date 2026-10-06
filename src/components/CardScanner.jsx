// ═══════════════════════════════════════════════════════════════════
// CardScanner — photograph a visiting card, turn it into a contact
// ═══════════════════════════════════════════════════════════════════
// Opened from the Quick Log (+) button → "Scan visiting card".
//   1. Take / choose a photo (phones open the rear camera). It is shrunk
//      to ≤1600px JPEG, sent to the ai-claude "businessCard" feature, and
//      discarded — only the extracted text is kept.
//   2. Review the fields (editable) and see what the CRM already has:
//      contacts, accounts, leads and open deals (utils/cardMatch.js).
//   3. Choose: update the existing contact · add to an account (and deal)
//      · add to a lead · save as a contact only · create a new lead.
// Nothing is written until Save. Edits to leads / deals the user can't
// edit are recorded on the new contact only (RLS would reject the rest).
import { useMemo, useRef, useState } from "react";
import { Camera, Image as ImageIcon, Check, Loader2, Building2, User, TrendingUp, UserPlus, AlertTriangle, PenLine, RotateCcw } from "lucide-react";
import { Modal, TypeaheadSelect } from "./shared";
import { aiBusinessCard, compressImage, isAiFeatureOn } from "../utils/ai";
import { matchCard, cardToContactFields, mergeCardIntoContact, nextContactRef } from "../utils/cardMatch";
import { uid, today, canEditRecord } from "../utils/helpers";
import { notify } from "../utils/toast";

const EMPTY_CARD = {
  name: "", designation: "", department: "", company: "", emails: [], phones: [], website: "",
  address: { line: "", city: "", state: "", pincode: "", country: "" }, linkedin: "", otherText: "",
  confidence: "", notes: "",
};

const STRENGTH_UI = {
  strong: { label: "Exact match", col: "#15803D", bg: "#F0FDF4" },
  medium: { label: "Likely", col: "#B45309", bg: "#FFFBEB" },
  weak: { label: "Possible", col: "#64748B", bg: "var(--s2)" },
};

function Field({ label, children, wide }) {
  return <div className="form-group" style={wide ? { gridColumn: "1 / -1" } : undefined}><label>{label}</label>{children}</div>;
}

export default function CardScanner({ onClose, accounts = [], contacts = [], leads = [], opps = [], setContacts, setLeads, setOpps, currentUser, orgUsers = [], aiConfig, onCreateLead }) {
  const [step, setStep] = useState("capture");          // capture | reading | review
  const [photo, setPhoto] = useState(null);             // { previewUrl }
  const [card, setCard] = useState(EMPTY_CARD);
  const [error, setError] = useState("");
  const [choice, setChoice] = useState(null);           // null = follow the suggestion
  const [target, setTarget] = useState({ contactId: "", accountId: "", oppId: "", leadId: "" });
  const camRef = useRef(null), galleryRef = useRef(null);
  const aiOn = isAiFeatureOn(aiConfig, "businessCard");

  // ── 1. Photo → AI ─────────────────────────────────────────────────
  const onPick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";                                  // allow retaking the same file
    if (!file) return;
    setError("");
    try {
      const img = await compressImage(file);
      setPhoto({ previewUrl: img.previewUrl });
      setStep("reading");
      const res = await aiBusinessCard(img);
      if (!res.ok) { setError(res.error || "Couldn't read the card."); setStep("capture"); return; }
      setCard({ ...EMPTY_CARD, ...res.result, address: { ...EMPTY_CARD.address, ...(res.result?.address || {}) } });
      setChoice(null);
      setStep("review");
    } catch (err) {
      setError(err?.message || "Couldn't open that photo.");
      setStep("capture");
    }
  };
  const typeInstead = () => { setCard(EMPTY_CARD); setPhoto(null); setChoice(null); setStep("review"); };

  // ── 2. Matching (live as fields are corrected) ─────────────────────
  const matches = useMemo(() => matchCard(card, { accounts, contacts, leads, opps }), [card, accounts, contacts, leads, opps]);
  const action = choice || matches.suggestion;
  const fields = useMemo(() => cardToContactFields(card), [card]);

  // Default targets follow the best match unless the user picked one.
  const tContact = target.contactId || matches.contacts[0]?.record.id || "";
  const tAccount = target.accountId || matches.accounts.find(m => m.strength !== "weak")?.record.id || matches.accounts[0]?.record.id || "";
  const tLead = target.leadId || matches.leads[0]?.record.id || "";
  const accountOpps = useMemo(() => opps.filter(o => !o.isDeleted && o.accountId === tAccount && !["Won", "Lost"].includes(o.stage)), [opps, tAccount]);

  const canEdit = (recordType, rec) => !!rec && canEditRecord({
    ownerId: recordType === "lead" ? rec.assignedTo : rec.owner, currentUser, orgUsers, recordType, recordId: rec.id, commLogs: [],
  });
  const byId = (arr, id) => arr.find(r => r.id === id);

  // ── Card field editing helpers ──
  const set = (k, v) => setCard(c => ({ ...c, [k]: v }));
  const setAddr = (k, v) => setCard(c => ({ ...c, address: { ...c.address, [k]: v } }));
  const setListAt = (k, i, v) => setCard(c => { const arr = [...(c[k] || [])]; arr[i] = v; return { ...c, [k]: arr.filter((x, j) => j <= i || x) }; });
  const email = (i) => card.emails?.[i] || "";
  const phone = (i) => card.phones?.[i]?.number || "";
  const setPhone = (i, number) => setListAt("phones", i, { type: card.phones?.[i]?.type || (i === 0 ? "mobile" : "office"), number });

  // ── 3. Save ────────────────────────────────────────────────────────
  const newContact = (extra = {}) => ({
    ...fields,
    id: `c_${uid()}`, contactId: nextContactRef(contacts),
    accountId: "", primary: false, departments: [], products: [], branches: [], countries: [], linkedOpps: [],
    owner: currentUser, createdBy: currentUser || "", createdDate: today,
    ...extra,
  });

  const save = () => {
    if (action !== "new-lead" && !fields.name) { notify.error("Add the person's name first."); return; }
    if (action === "update-contact") {
      const c = byId(contacts, tContact);
      if (!c) return;
      const { patch, added } = mergeCardIntoContact(c, fields);
      if (!added.length) { notify.info(`${c.name} already has everything on this card.`); onClose(); return; }
      setContacts(p => p.map(x => x.id === c.id ? { ...x, ...patch } : x));
      notify.success(`Updated ${c.name}: added ${added.join(", ")}.`);
      onClose(); return;
    }
    if (action === "add-to-account") {
      const acc = byId(accounts, tAccount);
      if (!acc) { notify.error("Pick the account."); return; }
      const opp = target.oppId ? byId(opps, target.oppId) : null;
      const c = newContact({ accountId: acc.id, linkedOpps: opp ? [opp.id] : [] });
      setContacts(p => [...p, c]);
      if (opp && canEdit("opp", opp)) {
        setOpps(p => p.map(o => o.id !== opp.id ? o : o.primaryContactId
          ? { ...o, secondaryContactIds: [...new Set([...(o.secondaryContactIds || []), c.id])] }
          : { ...o, primaryContactId: c.id }));
      }
      notify.success(`${c.name} added to ${acc.name}${opp ? ` and linked to ${opp.title || "the deal"}` : ""}.`);
      onClose(); return;
    }
    if (action === "add-to-lead") {
      const lead = byId(leads, tLead);
      if (!lead) { notify.error("Pick the lead."); return; }
      const c = newContact({ accountId: lead.accountId || "", linkedLeadIds: [lead.id] });
      setContacts(p => [...p, c]);
      if (canEdit("lead", lead)) setLeads(p => p.map(l => l.id === lead.id ? { ...l, contactIds: [...new Set([...(l.contactIds || []), c.id])] } : l));
      notify.success(`${c.name} added to lead ${lead.company || lead.leadId}.`);
      onClose(); return;
    }
    if (action === "contact-only") {
      const c = newContact();
      setContacts(p => [...p, c]);
      notify.success(`${c.name} saved to Contacts.`);
      onClose(); return;
    }
    // new-lead: hand the details to the Add Lead form (it has the required
    // lead fields — source, product, next call — that a card can't supply).
    onCreateLead?.({
      company: (card.company || "").toUpperCase(), contact: fields.name, designation: fields.designation,
      email: fields.email, phone: fields.phone, city: fields.city, state: fields.state, country: fields.country,
      website: card.website || "", source: "", notes: card.otherText || "",
    });
    onClose();
  };

  // ── Options available for this card ──
  const options = [
    matches.contacts.length > 0 && { key: "update-contact", icon: <User size={15}/>, label: "Update the existing contact", sub: "Fills in only what's missing — nothing is overwritten." },
    { key: "add-to-account", icon: <Building2 size={15}/>, label: "Add as a contact to an account", sub: "Optionally link them to an open deal." },
    { key: "add-to-lead", icon: <TrendingUp size={15}/>, label: "Add as a contact to a lead" },
    { key: "contact-only", icon: <User size={15}/>, label: "Save as a contact only", sub: "No account yet — link it later." },
    { key: "new-lead", icon: <UserPlus size={15}/>, label: "Create a new lead", sub: "Opens the Add Lead form with these details." },
  ].filter(Boolean);

  const saveLabel = { "update-contact": "Update contact", "add-to-account": "Add to account", "add-to-lead": "Add to lead", "contact-only": "Save contact", "new-lead": "Continue to new lead" }[action];
  const matchCount = matches.contacts.length + matches.accounts.length + matches.leads.length + matches.opps.length;

  const MatchRow = ({ m, title, sub }) => {
    const ui = STRENGTH_UI[m.strength];
    return (
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "7px 0", borderTop: "1px solid var(--border)" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{title}</div>
          <div style={{ fontSize: 11.5, color: "var(--text3)" }}>{[sub, m.reasons.join(" · ")].filter(Boolean).join(" — ")}</div>
        </div>
        <span style={{ fontSize: 10.5, fontWeight: 700, padding: "2px 7px", borderRadius: 6, background: ui.bg, color: ui.col, whiteSpace: "nowrap" }}>{ui.label}</span>
      </div>
    );
  };
  const accName = (id) => byId(accounts, id)?.name || "";

  return (
    <Modal title="Scan visiting card" onClose={onClose} lg
      footer={step === "review" ? <>
        <button className="btn btn-sec" onClick={() => { setStep("capture"); setError(""); }}><RotateCcw size={14}/>Rescan</button>
        <button className="btn btn-primary" onClick={save}><Check size={14}/>{saveLabel}</button>
      </> : <button className="btn btn-sec" onClick={onClose}>Cancel</button>}>

      {/* Hidden pickers: capture="environment" opens the rear camera on phones. */}
      <input ref={camRef} type="file" accept="image/*" capture="environment" onChange={onPick} style={{ display: "none" }}/>
      <input ref={galleryRef} type="file" accept="image/*" onChange={onPick} style={{ display: "none" }}/>

      {step === "capture" && (
        <div>
          {!aiOn && (
            <div style={{ fontSize: 12.5, padding: "10px 12px", borderRadius: 8, background: "#FFFBEB", color: "#92400E", marginBottom: 12 }}>
              Card reading is switched off. An admin can enable “Visiting Card Scanner” in AI Settings — or type the details below.
            </div>
          )}
          {error && <div style={{ fontSize: 12.5, padding: "10px 12px", borderRadius: 8, background: "#FEF2F2", color: "#B91C1C", marginBottom: 12 }}>{error}</div>}
          <div style={{ display: "grid", gap: 10 }}>
            <button className="btn btn-primary" disabled={!aiOn} onClick={() => camRef.current?.click()} style={{ justifyContent: "center", padding: "16px 14px", fontSize: 15 }}>
              <Camera size={18}/>Take a photo of the card
            </button>
            <button className="btn btn-sec" disabled={!aiOn} onClick={() => galleryRef.current?.click()} style={{ justifyContent: "center", padding: "14px" }}>
              <ImageIcon size={17}/>Choose from gallery
            </button>
            <button className="btn btn-sec" onClick={typeInstead} style={{ justifyContent: "center", padding: "12px" }}>
              <PenLine size={16}/>Type the details instead
            </button>
          </div>
          <div style={{ fontSize: 11.5, color: "var(--text3)", marginTop: 12, lineHeight: 1.5 }}>
            Lay the card flat in good light and fill the frame. The photo is read by AI to pull out the text and is not stored.
          </div>
        </div>
      )}

      {step === "reading" && (
        <div style={{ textAlign: "center", padding: "20px 0" }}>
          {photo && <img src={photo.previewUrl} alt="Card" style={{ maxWidth: "100%", maxHeight: 220, borderRadius: 10, border: "1px solid var(--border)" }}/>}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 14, fontSize: 14, color: "var(--text2)" }}>
            <Loader2 size={18} className="spin"/>Reading the card…
          </div>
        </div>
      )}

      {step === "review" && (
        <div>
          {photo && <img src={photo.previewUrl} alt="Scanned card" style={{ display: "block", maxWidth: "100%", maxHeight: 150, borderRadius: 8, border: "1px solid var(--border)", marginBottom: 10 }}/>}
          {(card.confidence === "low" || card.confidence === "medium" || card.notes) && (
            <div style={{ display: "flex", gap: 8, fontSize: 12.5, padding: "8px 12px", borderRadius: 8, background: card.confidence === "low" ? "#FEF2F2" : "#FFFBEB", color: card.confidence === "low" ? "#B91C1C" : "#92400E", marginBottom: 10 }}>
              <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }}/>
              <span>{card.confidence === "low" ? "The photo was hard to read — check every field or rescan. " : card.confidence === "medium" ? "Some details were hard to read — please check. " : ""}{card.notes}</span>
            </div>
          )}

          {/* Extracted details — editable; matching updates as you type. */}
          <div className="form-row">
            <Field label="Name *"><input value={card.name} onChange={e => set("name", e.target.value)} placeholder="Person's name"/></Field>
            <Field label="Designation"><input value={card.designation} onChange={e => set("designation", e.target.value)}/></Field>
          </div>
          <div className="form-row">
            <Field label="Company"><input value={card.company} onChange={e => set("company", e.target.value)}/></Field>
            <Field label="Website"><input value={card.website} onChange={e => set("website", e.target.value)} inputMode="url"/></Field>
          </div>
          <div className="form-row">
            <Field label="Phone"><input value={phone(0)} onChange={e => setPhone(0, e.target.value)} inputMode="tel"/></Field>
            <Field label="Alternate phone"><input value={phone(1)} onChange={e => setPhone(1, e.target.value)} inputMode="tel"/></Field>
          </div>
          <div className="form-row">
            <Field label="Email"><input value={email(0)} onChange={e => setListAt("emails", 0, e.target.value)} inputMode="email" autoCapitalize="none"/></Field>
            <Field label="Alternate email"><input value={email(1)} onChange={e => setListAt("emails", 1, e.target.value)} inputMode="email" autoCapitalize="none"/></Field>
          </div>
          <div className="form-row three">
            <Field label="City"><input value={card.address.city} onChange={e => setAddr("city", e.target.value)}/></Field>
            <Field label="State"><input value={card.address.state} onChange={e => setAddr("state", e.target.value)}/></Field>
            <Field label="Pincode"><input value={card.address.pincode} onChange={e => setAddr("pincode", e.target.value)} inputMode="numeric"/></Field>
          </div>

          {/* What the CRM already has */}
          <div style={{ marginTop: 6, padding: "10px 12px", border: "1px solid var(--border)", borderRadius: 10, background: "var(--s2)" }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", color: "var(--text3)", marginBottom: 2 }}>
              Already in SmartCRM {matchCount ? `· ${matchCount}` : ""}
            </div>
            {matchCount === 0 && <div style={{ fontSize: 13, color: "var(--text2)", padding: "6px 0" }}>No match found — this looks like a new contact.</div>}
            {matches.contacts.map(m => <MatchRow key={"c" + m.record.id} m={m} title={`Contact: ${m.record.name}`} sub={accName(m.record.accountId)}/>)}
            {matches.accounts.map(m => <MatchRow key={"a" + m.record.id} m={m} title={`Account: ${m.record.name}`} sub={m.record.accountNo}/>)}
            {matches.leads.map(m => <MatchRow key={"l" + m.record.id} m={m} title={`Lead: ${m.record.company || m.record.leadId}`} sub={[m.record.leadId, m.record.stage].filter(Boolean).join(" · ")}/>)}
            {matches.opps.map(m => <MatchRow key={"o" + m.record.id} m={m} title={`Deal: ${m.record.title || m.record.oppNo}`} sub={m.record.stage}/>)}
          </div>

          {/* What to do */}
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", color: "var(--text3)", margin: "14px 0 6px" }}>What should we do?</div>
          <div style={{ display: "grid", gap: 6 }}>
            {options.map(o => (
              <label key={o.key} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "10px 12px", borderRadius: 10, cursor: "pointer",
                border: `1.5px solid ${action === o.key ? "var(--brand)" : "var(--border)"}`, background: action === o.key ? "var(--brand-bg)" : "var(--surface)" }}>
                <input type="radio" name="card-action" checked={action === o.key} onChange={() => setChoice(o.key)} style={{ marginTop: 3, accentColor: "var(--brand)" }}/>
                <span style={{ flex: 1 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13.5, fontWeight: 600 }}>{o.icon}{o.label}
                    {o.key === matches.suggestion && <span style={{ fontSize: 10, fontWeight: 700, color: "var(--brand)", background: "white", border: "1px solid var(--brand)", padding: "0 6px", borderRadius: 6 }}>Suggested</span>}
                  </span>
                  {o.sub && <span style={{ display: "block", fontSize: 11.5, color: "var(--text3)", marginTop: 1 }}>{o.sub}</span>}
                </span>
              </label>
            ))}
          </div>

          {/* Targets for the chosen action */}
          {action === "update-contact" && (() => {
            const c = byId(contacts, tContact);
            const { added } = c ? mergeCardIntoContact(c, fields) : { added: [] };
            const editable = canEdit("contact", c);
            return (
              <div style={{ marginTop: 10 }}>
                <Field label="Contact">
                  <select value={tContact} onChange={e => setTarget(t => ({ ...t, contactId: e.target.value }))}>
                    {matches.contacts.map(m => <option key={m.record.id} value={m.record.id}>{m.record.name}{m.record.accountId ? ` — ${accName(m.record.accountId)}` : ""}</option>)}
                  </select>
                </Field>
                <div style={{ fontSize: 12, color: editable ? "var(--text2)" : "#B91C1C" }}>
                  {!editable ? "You can't edit this contact — ask its owner, or choose another option."
                    : added.length ? `Will add: ${added.join(", ")}.` : "Nothing new on this card — the contact is already complete."}
                </div>
              </div>
            );
          })()}
          {action === "add-to-account" && (
            <div className="form-row" style={{ marginTop: 10 }}>
              <Field label="Account">
                <TypeaheadSelect value={tAccount} onChange={id => setTarget(t => ({ ...t, accountId: id, oppId: "" }))}
                  options={accounts.filter(a => !a.isDeleted).map(a => ({ value: a.id, label: a.name, sub: a.accountNo || a.city || "" }))}
                  placeholder="Search accounts…"/>
              </Field>
              <Field label="Also add to deal (optional)">
                <select value={target.oppId} onChange={e => setTarget(t => ({ ...t, oppId: e.target.value }))} disabled={!accountOpps.length}>
                  <option value="">{accountOpps.length ? "— No deal —" : "No open deals at this account"}</option>
                  {accountOpps.map(o => <option key={o.id} value={o.id}>{o.title || o.oppNo} · {o.stage}</option>)}
                </select>
              </Field>
            </div>
          )}
          {action === "add-to-lead" && (
            <div style={{ marginTop: 10 }}>
              <Field label="Lead">
                <TypeaheadSelect value={tLead} onChange={id => setTarget(t => ({ ...t, leadId: id }))}
                  options={leads.filter(l => !l.isDeleted).map(l => ({ value: l.id, label: l.company || l.leadId, sub: [l.leadId, l.contact].filter(Boolean).join(" · ") }))}
                  placeholder="Search leads…"/>
              </Field>
            </div>
          )}
          {["add-to-account", "add-to-lead", "contact-only"].includes(action) && matches.contacts.some(m => m.strength === "strong") && (
            <div style={{ fontSize: 12, color: "#B45309", marginTop: 8 }}>
              Heads up: {matches.contacts[0].record.name} already exists with this {matches.contacts[0].reasons.join(" and ").toLowerCase().replace(/same /g, "")}. Saving creates a second contact.
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
