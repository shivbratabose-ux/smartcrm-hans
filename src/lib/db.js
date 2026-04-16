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

// ── Field mapping: JS camelCase ↔ DB snake_case ──
const toSnake = (obj) => {
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
    // soft delete
    isDeleted:"is_deleted", deletedAt:"deleted_at", deletedBy:"deleted_by",
  };
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = map[k] || k;
    out[key] = v;
  }
  return out;
};

const toCamel = (obj) => {
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
    // soft delete
    is_deleted:"isDeleted", deleted_at:"deletedAt", deleted_by:"deletedBy",
  };
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = map[k] || k;
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
  return (data || []).map(toCamel);
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

/**
 * Insert a record
 */
export async function insertRecord(module, record) {
  if (!isSupabaseConfigured) return { data: record, error: null };

  const table = TABLE_MAP[module];
  if (!table) return { data: null, error: "Unknown module" };

  const snaked = toSnake(record);
  // Remove undefined/null keys
  Object.keys(snaked).forEach(k => snaked[k] === undefined && delete snaked[k]);

  const { data, error } = await supabase.from(table).insert(snaked).select().single();
  if (error) dbLog('error', `[DB] insert ${module}:`, error);
  return { data: data ? toCamel(data) : record, error };
}

/**
 * Update a record by id
 */
export async function updateRecord(module, id, updates) {
  if (!isSupabaseConfigured) return { data: updates, error: null };

  const table = TABLE_MAP[module];
  if (!table) return { data: null, error: "Unknown module" };

  const snaked = toSnake(updates);
  Object.keys(snaked).forEach(k => snaked[k] === undefined && delete snaked[k]);

  const { data, error } = await supabase.from(table).update(snaked).eq("id", id).select().single();
  if (error) dbLog('error', `[DB] update ${module}:`, error);
  return { data: data ? toCamel(data) : updates, error };
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
  return (data || []).map(toCamel);
}

/**
 * Batch upsert (for seed data migration)
 */
export async function batchUpsert(module, records) {
  if (!isSupabaseConfigured) return { error: null };

  const table = TABLE_MAP[module];
  if (!table) return { error: "Unknown module" };

  const snaked = records.map(toSnake);
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
        record: newRow ? toCamel(newRow) : null,
        oldRecord: oldRow ? toCamel(oldRow) : null,
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
