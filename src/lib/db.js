// ═══════════════════════════════════════════════════════════════════
// SmartCRM Data Service Layer
// Abstracts Supabase calls — falls back to localStorage when not configured
// ═══════════════════════════════════════════════════════════════════
import { supabase, isSupabaseConfigured } from "./supabase";
import { loadState, saveState } from "../utils/helpers";

// Only log in development — never expose DB internals to prod console
const dbLog = import.meta.env.DEV
  ? (level, ...args) => console[level](...args)
  : () => {};

// ── Table name mapping (camelCase → snake_case) ──
const TABLE_MAP = {
  accounts:    "accounts",
  contacts:    "contacts",
  leads:       "leads",
  opps:        "opportunities",
  activities:  "activities",
  callReports: "call_reports",
  tickets:     "tickets",
  contracts:   "contracts",
  collections: "collections",
  targets:     "targets",
  quotes:      "quotations",
  commLogs:    "comm_logs",
  events:      "events",
  notes:       "notes",
  files:       "files",
  users:       "users",
};

// ── Per-module field aliases ──
// Some app fields map to differently-named DB columns on a single table.
// The `leads` table only has an `owner` column (not `assigned_to`), and the
// RLS policy keys off `owner`. Without this alias, every lead.assignedTo
// write either fails (column not found) or saves owner=null, making rows
// invisible to non-global roles via RLS — i.e. "I can't see my team's leads".
const MODULE_ALIASES = {
  leads: {
    // `contact` is the legacy primary-contact-name field still used throughout
    // the Leads UI, but the DB column is `contact_name`. Without this alias
    // every lead insert/update threw "Could not find the 'contact' column" —
    // the schema-heal path would strip it, but then the name was never
    // persisted, so reloading from cloud silently dropped the Primary Contact.
    toSnake: { assignedTo: "owner", contact: "contact_name" },
    toCamel: { owner: "assignedTo", contact_name: "contact" },
  },
};

// ── DB columns typed as DATE/TIMESTAMP ──
// Postgres rejects empty strings for these types ("invalid input syntax for
// type date"). The BLANK_* templates initialize every date field as "", so
// without coercion the first insert/update always fails. Coerce "" → null
// before the write hits Supabase. List is in *snake_case* (post-toSnake).
const DATE_COLUMNS = new Set([
  // Bare `date` column is used by activities, comm_logs, events tables —
  // BLANK_ACT/BLANK_COMM_LOG/BLANK_EVENT all init `date:""`, so editing a
  // record with a blank date would still throw the empty-string error.
  "date", "time",
  "close_date", "call_date", "next_call_date", "invoice_date", "due_date",
  "created_date", "start_date", "end_date", "join_date", "sent_date",
  "expiry_date", "next_call", "call_time", "followup_due", "converted_date",
  "expected_close_date", "last_contact_date", "payment_date", "renewal_date",
  "service_start_date", "go_live_date", "accepted_date", "decision_date",
  "reported_date", "resolved_date", "revisit_date", "approval_requested_at",
  "approved_at", "last_reminder_at", "temp_password_expires_at",
  "renewal_notified_at", "loss_closed_at", "deleted_at", "created_at",
  "updated_at", "uploaded_at",
  // Opp / Contract / Collection (add_missing_opp_contract_collection_fields_v1.sql)
  "follow_up_date", "bill_period_from", "bill_period_to",
]);

// ── Field mapping: JS camelCase ↔ DB snake_case ──
const toSnake = (obj, module) => {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return obj;
  const map = {
    accountId:"account_id", accountNo:"account_no", contactId:"contact_id",
    arrRevenue:"arr_revenue", parentId:"parent_id", hierarchyLevel:"hierarchy_level",
    hierarchyPath:"hierarchy_path", createdDate:"created_date", closeDate:"close_date",
    primaryContactId:"primary_contact_id", secondaryContactIds:"secondary_contact_ids",
    leadId:"lead_id", oppId:"opp_id", callDate:"call_date", callType:"call_type",
    marketingPerson:"marketing_person", leadName:"lead_name", nextCallDate:"next_call_date",
    leadStage:"lead_stage", invoiceNo:"invoice_no", invoiceDate:"invoice_date",
    dueDate:"due_date", billedAmount:"billed_amount", collectedAmount:"collected_amount",
    pendingAmount:"pending_amount", paymentMode:"payment_mode", nextCall:"next_call",
    contactName:"contact_name", noOfUsers:"no_of_users", businessType:"business_type",
    staffSize:"staff_size", monthlyVolume:"monthly_volume", currentSoftware:"current_software",
    swAge:"sw_age", swSatisfaction:"sw_satisfaction", painPoints:"pain_points",
    budgetRange:"budget_range", decisionMaker:"decision_maker", decisionTimeline:"decision_timeline",
    evaluatingOthers:"evaluating_others", nextStep:"next_step", startDate:"start_date",
    endDate:"end_date", userId:"user_id", targetValue:"target_value", achievedValue:"achieved_value",
    targetDeals:"target_deals", achievedDeals:"achieved_deals", targetCalls:"target_calls",
    achievedCalls:"achieved_calls", quoteNo:"quote_no", taxType:"tax_type", taxRate:"tax_rate",
    taxAmount:"tax_amount", createdAt:"created_at", updatedAt:"updated_at",
    sentDate:"sent_date", expiryDate:"expiry_date", recordType:"record_type",
    recordId:"record_id", linkedTo:"linked_to", linkedOpps:"linked_opps",
    endTime:"end_time", authUserId:"auth_user_id", branchId:"branch_id",
    deptId:"dept_id", joinDate:"join_date", avatarUrl:"avatar_url",
    reportsTo:"reports_to", dottedTo:"dotted_to",
    mustChangePassword:"must_change_password", tempPasswordExpiresAt:"temp_password_expires_at",
    // Lead fields
    assignedTo:"assigned_to", contactIds:"contact_ids", contactRoles:"contact_roles",
    additionalProducts:"additional_products", estimatedValue:"estimated_value",
    stageHistory:"stage_history", convertedOppId:"converted_opp_id",
    convertedOppIds:"converted_opp_ids", convertedOppRefId:"converted_opp_ref_id",
    convertedDate:"converted_date", qualificationChecklist:"qualification_checklist",
    // Opportunity fields
    sourceLeadIds:"source_lead_ids", forecastCategory:"forecast_category", dealSize:"deal_size",
    // Contact fields
    linkedLeadIds:"linked_lead_ids",
    // Lead address/team
    salesTeam:"sales_team",
    // General / activity fields
    callTime:"call_time", nextStepDesc:"next_step_desc", participantIds:"participant_ids",
    keepLeadOpen:"keep_lead_open", followupTitle:"followup_title",
    followupAssign:"followup_assign", followupDue:"followup_due",
    taskType:"task_type", taskStatus:"task_status",
    // Lead marketing / extra contact / pipeline fields
    // (columns added by supabase/add_missing_lead_fields_v1.sql)
    companyWebsite:"company_website", alternatePhone:"alternate_phone",
    alternateEmail:"alternate_email", linkedInUrl:"linked_in_url",
    annualRevenue:"annual_revenue", campaignName:"campaign_name",
    referredBy:"referred_by", expectedCloseDate:"expected_close_date",
    proposalSent:"proposal_sent", demoScheduled:"demo_scheduled",
    competitorName:"competitor_name", lastContactDate:"last_contact_date",
    productSelection:"product_selection",
    // Opportunity fields (added by add_missing_opp_contract_collection_fields_v1.sql)
    oppNo:"opp_no", forecastCat:"forecast_cat", lossReason:"loss_reason",
    lossReasonSecondary:"loss_reason_secondary", lostToCompetitor:"lost_to_competitor",
    lossImpactAreas:"loss_impact_areas", lossMgmtFeedback:"loss_mgmt_feedback",
    lossImprovementNotes:"loss_improvement_notes", lossClosedAt:"loss_closed_at",
    upsellFlag:"upsell_flag", crossSellNotes:"cross_sell_notes",
    decisionDate:"decision_date", campaignSource:"campaign_source",
    // Contract fields (added by add_missing_opp_contract_collection_fields_v1.sql)
    contractNo:"contract_no", billTerm:"bill_term", billType:"bill_type",
    approvalStage:"approval_stage", docType:"doc_type", poNumber:"po_number",
    renewalDate:"renewal_date", renewalType:"renewal_type",
    paymentTerms:"payment_terms", billingFrequency:"billing_frequency",
    invoiceGenBasis:"invoice_gen_basis", griApplicable:"gri_applicable",
    griPercentage:"gri_percentage", noOfBranches:"no_of_branches",
    serviceStartDate:"service_start_date", commercialModel:"commercial_model",
    autoRenewal:"auto_renewal", warrantyMonths:"warranty_months",
    goLiveDate:"go_live_date", signedDocUrl:"signed_doc_url",
    eulaUrl:"eula_url", onboardingNotes:"onboarding_notes",
    renewalNotifiedAt:"renewal_notified_at",
    // Collection fields (added by add_missing_opp_contract_collection_fields_v1.sql)
    contractId:"contract_id", invoiceType:"invoice_type",
    gstAmount:"gst_amount", tdsAmount:"tds_amount", netPayable:"net_payable",
    billPeriodFrom:"bill_period_from", billPeriodTo:"bill_period_to",
    paymentDate:"payment_date", agingBucket:"aging_bucket",
    followUpDate:"follow_up_date", chequeRef:"cheque_ref",
    approvedBy:"approved_by",
    // Quotation fields (added by add_missing_quotation_fields_v1.sql)
    isFinal:"is_final", quoteFileUrl:"quote_file_url",
    approvalNotes:"approval_notes", supersedesQuoteId:"supersedes_quote_id",
    approvalStatus:"approval_status", approvalRequestedAt:"approval_requested_at",
    approvedAt:"approved_at", rejectedReason:"rejected_reason",
    acceptedDate:"accepted_date", signedQuoteUrl:"signed_quote_url",
    emailLog:"email_log", lastReminderAt:"last_reminder_at",
    changeLog:"change_log", exchangeRate:"exchange_rate",
    legalName:"legal_name", billingAddressSnapshot:"billing_address_snapshot",
    shippingAddressSnapshot:"shipping_address_snapshot",
    taxTreatment:"tax_treatment", poMandatory:"po_mandatory",
    creditDays:"credit_days", billingContactName:"billing_contact_name",
    billingContactEmail:"billing_contact_email",
    financeContactEmail:"finance_contact_email",
    sourceLeadId:"source_lead_id", preparedBy:"prepared_by",
    salesEngineer:"sales_engineer", coverLetter:"cover_letter",
    // soft delete
    isDeleted:"is_deleted", deletedAt:"deleted_at", deletedBy:"deleted_by",
  };
  const alias = MODULE_ALIASES[module]?.toSnake || {};
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    // Skip transient app-only fields (e.g. _warnings, _valid, _mode, _matchedId
    // from BulkUpload) — they don't exist in the DB schema and would cause
    // "Could not find the 'X' column" errors on upsert.
    if (k.startsWith("_")) continue;
    const key = alias[k] || map[k] || k;
    // Coerce empty strings → null for date/timestamp columns so Postgres
    // doesn't reject "invalid input syntax for type date".
    out[key] = (v === "" && DATE_COLUMNS.has(key)) ? null : v;
  }
  return out;
};

const toCamel = (obj, module) => {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return obj;
  const map = {
    account_id:"accountId", account_no:"accountNo", contact_id:"contactId",
    arr_revenue:"arrRevenue", parent_id:"parentId", hierarchy_level:"hierarchyLevel",
    hierarchy_path:"hierarchyPath", created_date:"createdDate", close_date:"closeDate",
    primary_contact_id:"primaryContactId", secondary_contact_ids:"secondaryContactIds",
    lead_id:"leadId", opp_id:"oppId", call_date:"callDate", call_type:"callType",
    marketing_person:"marketingPerson", lead_name:"leadName", next_call_date:"nextCallDate",
    lead_stage:"leadStage", invoice_no:"invoiceNo", invoice_date:"invoiceDate",
    due_date:"dueDate", billed_amount:"billedAmount", collected_amount:"collectedAmount",
    pending_amount:"pendingAmount", payment_mode:"paymentMode", next_call:"nextCall",
    contact_name:"contactName", no_of_users:"noOfUsers", business_type:"businessType",
    staff_size:"staffSize", monthly_volume:"monthlyVolume", current_software:"currentSoftware",
    sw_age:"swAge", sw_satisfaction:"swSatisfaction", pain_points:"painPoints",
    budget_range:"budgetRange", decision_maker:"decisionMaker", decision_timeline:"decisionTimeline",
    evaluating_others:"evaluatingOthers", next_step:"nextStep", start_date:"startDate",
    end_date:"endDate", user_id:"userId", target_value:"targetValue", achieved_value:"achievedValue",
    target_deals:"targetDeals", achieved_deals:"achievedDeals", target_calls:"targetCalls",
    achieved_calls:"achievedCalls", quote_no:"quoteNo", tax_type:"taxType", tax_rate:"taxRate",
    tax_amount:"taxAmount", created_at:"createdAt", updated_at:"updatedAt",
    sent_date:"sentDate", expiry_date:"expiryDate", record_type:"recordType",
    record_id:"recordId", linked_to:"linkedTo", linked_opps:"linkedOpps",
    end_time:"endTime", auth_user_id:"authUserId", branch_id:"branchId",
    dept_id:"deptId", join_date:"joinDate", avatar_url:"avatarUrl",
    reports_to:"reportsTo", dotted_to:"dottedTo",
    must_change_password:"mustChangePassword", temp_password_expires_at:"tempPasswordExpiresAt",
    // Lead fields
    assigned_to:"assignedTo", contact_ids:"contactIds", contact_roles:"contactRoles",
    additional_products:"additionalProducts", estimated_value:"estimatedValue",
    stage_history:"stageHistory", converted_opp_id:"convertedOppId",
    converted_opp_ids:"convertedOppIds", converted_opp_ref_id:"convertedOppRefId",
    converted_date:"convertedDate", qualification_checklist:"qualificationChecklist",
    // Opportunity fields
    source_lead_ids:"sourceLeadIds", forecast_category:"forecastCategory", deal_size:"dealSize",
    // Contact fields
    linked_lead_ids:"linkedLeadIds",
    // Lead address/team
    sales_team:"salesTeam",
    // General / activity fields
    call_time:"callTime", next_step_desc:"nextStepDesc", participant_ids:"participantIds",
    keep_lead_open:"keepLeadOpen", followup_title:"followupTitle",
    followup_assign:"followupAssign", followup_due:"followupDue",
    task_type:"taskType", task_status:"taskStatus",
    // Lead marketing / extra contact / pipeline fields
    company_website:"companyWebsite", alternate_phone:"alternatePhone",
    alternate_email:"alternateEmail", linked_in_url:"linkedInUrl",
    annual_revenue:"annualRevenue", campaign_name:"campaignName",
    referred_by:"referredBy", expected_close_date:"expectedCloseDate",
    proposal_sent:"proposalSent", demo_scheduled:"demoScheduled",
    competitor_name:"competitorName", last_contact_date:"lastContactDate",
    product_selection:"productSelection",
    // Opportunity fields
    opp_no:"oppNo", forecast_cat:"forecastCat", loss_reason:"lossReason",
    loss_reason_secondary:"lossReasonSecondary", lost_to_competitor:"lostToCompetitor",
    loss_impact_areas:"lossImpactAreas", loss_mgmt_feedback:"lossMgmtFeedback",
    loss_improvement_notes:"lossImprovementNotes", loss_closed_at:"lossClosedAt",
    upsell_flag:"upsellFlag", cross_sell_notes:"crossSellNotes",
    decision_date:"decisionDate", campaign_source:"campaignSource",
    // Contract fields
    contract_no:"contractNo", bill_term:"billTerm", bill_type:"billType",
    approval_stage:"approvalStage", doc_type:"docType", po_number:"poNumber",
    renewal_date:"renewalDate", renewal_type:"renewalType",
    payment_terms:"paymentTerms", billing_frequency:"billingFrequency",
    invoice_gen_basis:"invoiceGenBasis", gri_applicable:"griApplicable",
    gri_percentage:"griPercentage", no_of_branches:"noOfBranches",
    service_start_date:"serviceStartDate", commercial_model:"commercialModel",
    auto_renewal:"autoRenewal", warranty_months:"warrantyMonths",
    go_live_date:"goLiveDate", signed_doc_url:"signedDocUrl",
    eula_url:"eulaUrl", onboarding_notes:"onboardingNotes",
    renewal_notified_at:"renewalNotifiedAt",
    // Collection fields
    contract_id:"contractId", invoice_type:"invoiceType",
    gst_amount:"gstAmount", tds_amount:"tdsAmount", net_payable:"netPayable",
    bill_period_from:"billPeriodFrom", bill_period_to:"billPeriodTo",
    payment_date:"paymentDate", aging_bucket:"agingBucket",
    follow_up_date:"followUpDate", cheque_ref:"chequeRef",
    approved_by:"approvedBy",
    // Quotation fields (added by add_missing_quotation_fields_v1.sql)
    is_final:"isFinal", quote_file_url:"quoteFileUrl",
    approval_notes:"approvalNotes", supersedes_quote_id:"supersedesQuoteId",
    approval_status:"approvalStatus", approval_requested_at:"approvalRequestedAt",
    approved_at:"approvedAt", rejected_reason:"rejectedReason",
    accepted_date:"acceptedDate", signed_quote_url:"signedQuoteUrl",
    email_log:"emailLog", last_reminder_at:"lastReminderAt",
    change_log:"changeLog", exchange_rate:"exchangeRate",
    legal_name:"legalName", billing_address_snapshot:"billingAddressSnapshot",
    shipping_address_snapshot:"shippingAddressSnapshot",
    tax_treatment:"taxTreatment", po_mandatory:"poMandatory",
    credit_days:"creditDays", billing_contact_name:"billingContactName",
    billing_contact_email:"billingContactEmail",
    finance_contact_email:"financeContactEmail",
    source_lead_id:"sourceLeadId", prepared_by:"preparedBy",
    sales_engineer:"salesEngineer", cover_letter:"coverLetter",
    // soft delete
    is_deleted:"isDeleted", deleted_at:"deletedAt", deleted_by:"deletedBy",
  };
  const alias = MODULE_ALIASES[module]?.toCamel || {};
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = alias[k] || map[k] || k;
    out[key] = v;
  }
  return out;
};

// ═══════════════════════════════════════════════════════════════════
// DATABASE OPERATIONS
// ═══════════════════════════════════════════════════════════════════

/**
 * Load all data for a module from Supabase (or localStorage fallback)
 */
export async function loadAll(module) {
  if (!isSupabaseConfigured) return null; // fall back to localStorage in SmartCRM

  const table = TABLE_MAP[module];
  if (!table) return null;

  // files table uses uploaded_at instead of created_at
  const orderCol = table === "files" ? "uploaded_at" : "created_at";
  const { data, error } = await supabase.from(table).select("*").eq("is_deleted", false).order(orderCol, { ascending: false });
  if (error) { dbLog('error', `[DB] loadAll ${module}:`, error); return null; }
  return (data || []).map(r => toCamel(r, module));
}

/**
 * Load all CRM data at once (initial app load)
 */
export async function loadAllData() {
  if (!isSupabaseConfigured) return loadState(); // localStorage fallback

  const modules = Object.keys(TABLE_MAP);
  const results = {};
  const promises = modules.map(async (mod) => {
    const data = await loadAll(mod);
    if (data) results[mod] = data;
  });
  await Promise.all(promises);
  return Object.keys(results).length > 0 ? results : null;
}

// In-memory cache of "column X does not exist on table Y" results, learned at
// runtime from PostgREST schema-cache errors. We use this to pre-strip those
// columns on subsequent writes so we don't re-trigger the same error every
// time. Resets on page reload (which is fine — schema can have changed).
const UNKNOWN_COLUMNS = {}; // { [tableName]: Set<columnName> }

const COLUMN_NOT_FOUND_RE = /Could not find the '([^']+)' column/i;

function pruneKnownUnknowns(table, snaked) {
  const set = UNKNOWN_COLUMNS[table];
  if (!set || set.size === 0) return snaked;
  const out = {};
  for (const [k, v] of Object.entries(snaked)) if (!set.has(k)) out[k] = v;
  return out;
}

// Try a write; if PostgREST rejects with "column X not found", remember it,
// strip it, and retry. Caps at MAX_RETRIES so a truly broken schema can't
// loop forever.
async function writeWithSchemaHeal(table, snaked, runOp) {
  // 30 retries covers tables whose app-side BLANK_* template has drifted well
  // ahead of the migrated schema (e.g. `leads` carries ~20 UI-only fields that
  // were never added to supabase/schema.sql). Each retry strips exactly one
  // unknown column, so 5 was not enough — the heal would give up mid-strip,
  // the insert would fail, and the user would see "leads are not updating".
  const MAX_RETRIES = 30;
  let payload = pruneKnownUnknowns(table, snaked);
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const { data, error } = await runOp(payload);
    if (!error) return { data, error: null };
    const m = COLUMN_NOT_FOUND_RE.exec(error.message || "");
    if (!m || attempt === MAX_RETRIES) return { data: null, error };
    const badCol = m[1];
    if (!(table in UNKNOWN_COLUMNS)) UNKNOWN_COLUMNS[table] = new Set();
    UNKNOWN_COLUMNS[table].add(badCol);
    if (!(badCol in payload)) return { data: null, error }; // can't strip; bail
    const { [badCol]: _drop, ...rest } = payload;
    payload = rest;
  }
  return { data: null, error: { message: "writeWithSchemaHeal: unreachable" } };
}

/**
 * Insert a record
 */
export async function insertRecord(module, record) {
  if (!isSupabaseConfigured) return { data: record, error: null };

  const table = TABLE_MAP[module];
  if (!table) return { data: null, error: "Unknown module" };

  const snaked = toSnake(record, module);
  // Remove undefined/null keys
  Object.keys(snaked).forEach(k => snaked[k] === undefined && delete snaked[k]);

  // .maybeSingle() so a post-insert RLS visibility miss (row written, but
  // RLS filter hides it from the caller) returns {data:null,error:null}
  // instead of "Cannot coerce the result to a single JSON object". The
  // insert itself still succeeded; we just can't read the row back.
  const { data, error } = await writeWithSchemaHeal(table, snaked,
    payload => supabase.from(table).insert(payload).select().maybeSingle());
  if (error) dbLog('error', `[DB] insert ${module}:`, error);
  return { data: data ? toCamel(data, module) : record, error };
}

/**
 * Update a record by id
 */
export async function updateRecord(module, id, updates) {
  if (!isSupabaseConfigured) return { data: updates, error: null };

  const table = TABLE_MAP[module];
  if (!table) return { data: null, error: "Unknown module" };

  const snaked = toSnake(updates, module);
  Object.keys(snaked).forEach(k => snaked[k] === undefined && delete snaked[k]);

  // .maybeSingle() so "update matched 0 rows" or "RLS hides the post-update
  // row from caller" returns {data:null,error:null} instead of the PostgREST
  // "Cannot coerce the result to a single JSON object" error. Users were
  // seeing sync-failed toasts on every contact/lead edit even though the
  // write landed, because RLS filters the returned row post-update.
  const { data, error } = await writeWithSchemaHeal(table, snaked,
    payload => supabase.from(table).update(payload).eq("id", id).select().maybeSingle());
  if (error) dbLog('error', `[DB] update ${module}:`, error);
  return { data: data ? toCamel(data, module) : updates, error };
}

/**
 * Soft-delete a record (sets is_deleted=true + logs audit).
 * Hard DELETEs that bypass the app are also intercepted by the DB trigger.
 */
export async function deleteRecord(module, id, userId) {
  if (!isSupabaseConfigured) return { error: null };
  const table = TABLE_MAP[module];
  if (!table) return { error: "Unknown module" };
  const { error } = await supabase.from(table).update({
    is_deleted: true,
    deleted_at: new Date().toISOString(),
    deleted_by: userId || null,
  }).eq("id", id);
  if (error) { dbLog('error', `[DB] softDelete ${module}:`, error); return { error }; }
  await logAudit(userId, "DELETE", table, id, null, { is_deleted: true });
  return { error: null };
}

/**
 * Restore a soft-deleted record (admin only — enforced by RLS + caller check).
 */
export async function restoreRecord(module, id, userId) {
  if (!isSupabaseConfigured) return { error: null };
  const table = TABLE_MAP[module];
  if (!table) return { error: "Unknown module" };
  const { error } = await supabase.from(table).update({
    is_deleted: false,
    deleted_at: null,
    deleted_by: null,
  }).eq("id", id);
  if (error) { dbLog('error', `[DB] restore ${module}:`, error); return { error }; }
  await logAudit(userId, "RESTORE", table, id, { is_deleted: true }, { is_deleted: false });
  return { error: null };
}

/**
 * Load soft-deleted records for a module (admin panel).
 */
export async function loadDeleted(module) {
  if (!isSupabaseConfigured) return [];
  const table = TABLE_MAP[module];
  if (!table) return [];
  const { data, error } = await supabase.from(table).select("*").eq("is_deleted", true).order("deleted_at", { ascending: false });
  if (error) { dbLog('error', `[DB] loadDeleted ${module}:`, error); return []; }
  return (data || []).map(r => toCamel(r, module));
}

/**
 * Batch upsert (for seed data migration)
 */
export async function batchUpsert(module, records) {
  if (!isSupabaseConfigured) return { error: null };

  const table = TABLE_MAP[module];
  if (!table) return { error: "Unknown module" };

  const snaked = records.map(r => toSnake(r, module));
  const { error } = await supabase.from(table).upsert(snaked, { onConflict: "id" });
  if (error) dbLog('error', `[DB] batchUpsert ${module}:`, error);
  return { error };
}

// ═══════════════════════════════════════════════════════════════════
// AUTHENTICATION
// ═══════════════════════════════════════════════════════════════════

/**
 * Sign in with email + password
 */
export async function signIn(email, password) {
  if (!isSupabaseConfigured) return { user: null, error: "Supabase not configured" };

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { user: null, error: error.message };

  // Get CRM user profile — must exist and be active
  const { data: profile } = await supabase
    .from("users")
    .select("*")
    .eq("auth_user_id", data.user.id)
    .single();

  if (!profile) {
    await supabase.auth.signOut();
    return { user: null, error: "No CRM profile found. Contact your administrator." };
  }
  if (!profile.active) {
    await supabase.auth.signOut();
    return { user: null, error: "Your account has been deactivated. Contact your administrator." };
  }
  return { user: toCamel(profile), session: data.session, error: null };
}

/**
 * Sign out
 */
export async function signOut() {
  if (!isSupabaseConfigured) return;
  await supabase.auth.signOut();
}

/**
 * Get current session
 */
export async function getSession() {
  if (!isSupabaseConfigured) return null;
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;

  const { data: profile } = await supabase
    .from("users")
    .select("*")
    .eq("auth_user_id", session.user.id)
    .single();

  // No profile or deactivated — kill the session immediately
  if (!profile || !profile.active) {
    await supabase.auth.signOut();
    return null;
  }
  return toCamel(profile);
}

/**
 * Create a new user (admin only)
 */
export async function createUser(email, password, profileData) {
  if (!isSupabaseConfigured) return { error: "Supabase not configured" };

  // Note: In production, use Supabase Edge Function for admin user creation
  // This uses the admin API which requires service_role key
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { name: profileData.name } }
  });
  if (authError) return { error: authError.message };

  // Create CRM user profile
  const profile = toSnake({ ...profileData, authUserId: authData.user.id });
  const { error: profileError } = await supabase.from("users").insert(profile);
  if (profileError) return { error: profileError.message };

  return { user: authData.user, error: null };
}

/**
 * Change password
 */
export async function changePassword(newPassword) {
  if (!isSupabaseConfigured) return { error: "Supabase not configured" };
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  return { error: error?.message || null };
}

/**
 * Update user profile (admin only — used for role, reportsTo, branch/dept changes)
 * Pass any subset of camelCase fields; they are converted to snake_case for the DB.
 */
export async function updateUserProfile(userId, patch) {
  if (!isSupabaseConfigured) return { error: "Supabase not configured" };
  if (!userId) return { error: "Missing userId" };
  // Whitelist of editable columns
  const allowed = ["name", "email", "initials", "role", "lob", "branchId", "deptId",
                   "country", "active", "joinDate", "avatarUrl", "reportsTo", "dottedTo"];
  const clean = {};
  Object.keys(patch || {}).forEach(k => { if (allowed.includes(k)) clean[k] = patch[k]; });
  if (Object.keys(clean).length === 0) return { error: null };
  const snake = toSnake({ ...clean, updatedAt: new Date().toISOString() });
  const { error } = await supabase.from("users").update(snake).eq("id", userId);
  return { error: error?.message || null };
}

// ═══════════════════════════════════════════════════════════════════
// REALTIME SUBSCRIPTIONS
// ═══════════════════════════════════════════════════════════════════

/**
 * Subscribe to realtime changes on a table
 * Returns unsubscribe function
 */
export function subscribeToChanges(module, callback) {
  if (!isSupabaseConfigured) return () => {};

  const table = TABLE_MAP[module];
  if (!table) return () => {};

  const channel = supabase
    .channel(`${table}_changes`)
    .on("postgres_changes", { event: "*", schema: "public", table }, (payload) => {
      const { eventType, new: newRow, old: oldRow } = payload;
      callback({
        type: eventType, // INSERT, UPDATE, DELETE
        record: newRow ? toCamel(newRow, module) : null,
        oldRecord: oldRow ? toCamel(oldRow, module) : null,
      });
    })
    .subscribe();

  return () => supabase.removeChannel(channel);
}

/**
 * Subscribe to all key tables at once
 * Returns single unsubscribe function
 */
export function subscribeToAll(handlers) {
  if (!isSupabaseConfigured) return () => {};

  const unsubscribers = [];
  for (const [module, handler] of Object.entries(handlers)) {
    unsubscribers.push(subscribeToChanges(module, handler));
  }
  return () => unsubscribers.forEach(fn => fn());
}

// ═══════════════════════════════════════════════════════════════════
// AUDIT LOG
// ═══════════════════════════════════════════════════════════════════

export async function logAudit(userId, action, tableName, recordId, oldData, newData) {
  if (!isSupabaseConfigured) return;
  await supabase.from("audit_log").insert({
    user_id: userId,
    action,
    table_name: tableName,
    record_id: recordId,
    old_data: oldData,
    new_data: newData,
  });
}

// ═══════════════════════════════════════════════════════════════════
// SEED DATA MIGRATION
// ═══════════════════════════════════════════════════════════════════

/**
 * Migrate seed data to Supabase (run once)
 * Call from admin panel or console: window.__seedSupabase()
 */
export async function seedSupabase(seedData) {
  if (!isSupabaseConfigured) return { error: "Supabase not configured" };

  const order = ["accounts","contacts","leads","opps","activities","callReports",
    "tickets","contracts","collections","targets","quotes","commLogs","events","notes","files"];

  for (const mod of order) {
    if (seedData[mod]?.length) {
      dbLog('log', `[Seed] Upserting ${mod}: ${seedData[mod].length} records`);
      const { error } = await batchUpsert(mod, seedData[mod]);
      if (error) dbLog('error', `[Seed] Failed ${mod}:`, error);
    }
  }
  dbLog('log', "[Seed] Complete!");
  return { error: null };
}

// Export config status
export { isSupabaseConfigured };
