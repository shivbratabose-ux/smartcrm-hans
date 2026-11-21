// Where Custom Reports are saved.
// Cloud: the saved_reports table (supabase/saved_reports_v1.sql), read and
// written directly. Your own reports, plus colleagues' reports marked
// "Share with team" (read-only for you). Offline / local mode, or before the
// migration is applied: the user's browser, as before.
//
// A report row: { id, name, spec, shared, ownerId, updatedAt }.
// `spec` is the report definition only (no business data).
import { supabase, isSupabaseConfigured } from "./supabase";

const localKey = (u) => `smartcrm_custom_reports_v1:${u || "anon"}`;
function readLocal(u) { try { const v = JSON.parse(localStorage.getItem(localKey(u)) || "[]"); return Array.isArray(v) ? v : []; } catch { return []; } }
function writeLocal(u, list) { try { localStorage.setItem(localKey(u), JSON.stringify(list)); return true; } catch { return false; } }
function clearLocal(u) { try { localStorage.removeItem(localKey(u)); } catch { /* blocked */ } }

const missingTable = (msg) => /does not exist|relation|schema cache|could not find the table/i.test(String(msg || ""));
const SPEC_KEYS = ["source", "columns", "filters", "groupBy", "sort", "chart", "chartValue"];
export const specOf = (r) => Object.fromEntries(SPEC_KEYS.filter(k => r[k] !== undefined).map(k => [k, r[k]]));
const fromRow = (row) => ({ ...(row.spec || {}), id: row.id, name: row.name, shared: !!row.shared, ownerId: row.owner_id, updatedAt: row.updated_at || "" });
// Old browser-saved reports kept the spec flat on the record.
const fromLocal = (r, u) => ({ ...specOf(r), id: r.id, name: r.name || "Untitled report", shared: false, ownerId: u, updatedAt: r.savedAt || "" });

/**
 * Every report this user can open: { reports, cloud, error, moved }.
 * On the first cloud load, reports the user saved in this browser are
 * copied up to the cloud (then cleared locally) so nothing is lost.
 */
export async function loadReports(currentUser) {
  const local = readLocal(currentUser).map(r => fromLocal(r, currentUser));
  if (!isSupabaseConfigured) return { reports: local, cloud: false, error: "", moved: 0 };
  const { data, error } = await supabase.from("saved_reports").select("*").order("name", { ascending: true }).limit(1000);
  if (error) {
    return missingTable(error.message)
      ? { reports: local, cloud: false, error: "", moved: 0 }               // migration not applied yet
      : { reports: local, cloud: false, error: error.message, moved: 0 };
  }
  let reports = (data || []).map(fromRow);
  let moved = 0;
  const toMove = local.filter(r => !reports.some(x => x.id === r.id));
  if (toMove.length) {
    const { error: upErr } = await supabase.from("saved_reports").upsert(
      toMove.map(r => ({ id: r.id, owner_id: currentUser, name: r.name, spec: specOf(r), shared: false })), { onConflict: "id" });
    if (!upErr) { moved = toMove.length; reports = [...reports, ...toMove].sort((a, b) => a.name.localeCompare(b.name)); clearLocal(currentUser); }
  } else if (local.length) {
    clearLocal(currentUser);
  }
  return { reports, cloud: true, error: "", moved };
}

/** Insert or update one of my reports. Returns { error }. */
export async function saveReport(report, currentUser, cloud) {
  if (!cloud) {
    const list = readLocal(currentUser);
    const rec = { ...specOf(report), id: report.id, name: report.name, savedAt: new Date().toISOString() };
    const i = list.findIndex(r => r.id === report.id);
    const next = i >= 0 ? list.map((r, k) => (k === i ? rec : r)) : [...list, rec];
    return { error: writeLocal(currentUser, next) ? "" : "This browser blocks saving." };
  }
  const { error } = await supabase.from("saved_reports").upsert(
    { id: report.id, owner_id: currentUser, name: report.name, spec: specOf(report), shared: !!report.shared }, { onConflict: "id" });
  return { error: error ? error.message : "" };
}

/** Delete one of my reports. Returns { error }. */
export async function deleteReport(id, currentUser, cloud) {
  if (!cloud) return { error: writeLocal(currentUser, readLocal(currentUser).filter(r => r.id !== id)) ? "" : "This browser blocks saving." };
  const { error } = await supabase.from("saved_reports").delete().eq("id", id);
  return { error: error ? error.message : "" };
}
