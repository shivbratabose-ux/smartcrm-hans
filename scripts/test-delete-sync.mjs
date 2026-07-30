// ═══════════════════════════════════════════════════════════════════
// test-delete-sync.mjs — models the deleted-record lifecycle to verify
// that an admin's soft-delete converges to every other user's client.
// ───────────────────────────────────────────────────────────────────
// Mirrors the exact algorithms in src/SmartCRM.jsx:
//   • mergeOnLoad (cloud+local reconciliation on reload)
//   • pushRecords recovery + ownership gate
//   • the outbound diff-sync ownership gate (canWriteRec)
//   • the realtime UPDATE handler (shallow-merge of the new row)
// so we can reason about convergence without a live DB / browser.
// ═══════════════════════════════════════════════════════════════════

let pass = 0, fail = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : `  → got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
  ok ? pass++ : fail++;
};

// ── Ownership gate (copied from SmartCRM.jsx canWriteRec) ──
const OWNER_FIELD = { opps: "owner" };
const canWriteRec = (scope, module, rec) => {
  if (scope.global) return true;
  const f = OWNER_FIELD[module];
  const owner = f ? rec?.[f] : null;
  return !owner || scope.ids.has(owner);
};

// ── mergeOnLoad (pure model of the reconciliation) ──
// Returns { merged, toInsert }. `retryInsert` gates recovery. `scope` gates
// which local-only records we actually attempt to push (the fix from PR #203).
function mergeOnLoad(module, cloud, local, scope, retryInsert = true) {
  const cloudArr = Array.isArray(cloud) ? cloud : [];
  local = Array.isArray(local) ? local : [];
  if (cloudArr.length === 0 && local.length === 0) return { merged: [], toInsert: [] };

  const scopeFilter = (rows) => scope.global ? rows : rows.filter(r => {
    const owner = OWNER_FIELD[module] ? r?.[OWNER_FIELD[module]] : null;
    return !owner || scope.ids.has(owner);
  });

  if (cloudArr.length === 0) {
    const toInsert = retryInsert ? scopeFilter(local.filter(r => r && !r.isDeleted && !r._syncedAt)) : [];
    return { merged: local, toInsert };
  }
  const cloudStamped = cloudArr.map(r => (r && !r._syncedAt) ? { ...r, _syncedAt: "now" } : r);
  const cloudIds = new Set(cloudStamped.map(r => r.id));
  const localOnly = local.filter(r => r.id && !cloudIds.has(r.id));
  const keepSoftDeleted = localOnly.filter(r => r.isDeleted);
  const retryCandidates = localOnly.filter(r => !r.isDeleted);
  const merged = [...cloudStamped, ...keepSoftDeleted, ...retryCandidates];
  return { merged, toInsert: retryInsert ? scopeFilter(retryCandidates) : [] };
}

// Model an insertRecord against a cloud that already has the id (as deleted):
// Postgres returns a duplicate-key error → the client drops the local ghost.
function simulateRecovery(merged, toInsert, cloud) {
  const cloudById = new Map(cloud.map(r => [r.id, r]));
  let out = [...merged];
  for (const rec of toInsert) {
    if (cloudById.has(rec.id)) {
      // duplicate key → drop local copy to converge with cloud
      out = out.filter(r => r.id !== rec.id);
    }
    // (a clean insert would just stamp _syncedAt; irrelevant to visibility)
  }
  return out;
}

const visible = (rows, scope) => rows.filter(o => !o.isDeleted && (scope.global || (o.owner && scope.ids.has(o.owner))));

// Scopes
const admin = { global: true, ids: new Set(["admin"]) };
const rep   = { global: false, ids: new Set(["rep"]) };   // owns "rep" records only

console.log("Deleted-opportunity convergence");

// The opp, owned by the rep, after admin soft-deletes it in the cloud.
const X_live    = { id: "X", owner: "rep", stage: "Prospect", isDeleted: false, _syncedAt: "t0" };
const X_deleted = { id: "X", owner: "rep", stage: "Prospect", isDeleted: true, deletedBy: "admin", _syncedAt: "t1" };

// ── Scenario 1: reads are company-wide (opps_read USING true) — the fix.
//    Cloud returns the DELETED X; rep still holds the live copy locally. ──
{
  const cloud = [X_deleted];
  const localRep = [X_live];
  const { merged } = mergeOnLoad("opps", cloud, localRep, rep);
  const vis = visible(merged, rep);
  check("company-wide read: rep's reload hides the deleted opp", vis.length, 0);
  check("company-wide read: local copy is now marked deleted", merged.find(r => r.id === "X").isDeleted, true);
}

// ── Scenario 2: reads hide deleted (opps_read = NOT is_deleted) but the
//    module still returns OTHER live opps. Cloud omits the deleted X, so
//    rep's live copy looks local-only → recovery insert → duplicate key →
//    dropped. Converges, after the round-trip. ──
{
  const otherLive = { id: "Y", owner: "rep", stage: "Won", isDeleted: false, _syncedAt: "t0" };
  const cloud = [otherLive];           // deleted X hidden from the rep's SELECT
  const cloudReal = [otherLive, X_deleted]; // X DOES exist in the table (deleted)
  const localRep = [X_live, otherLive];
  const { merged, toInsert } = mergeOnLoad("opps", cloud, localRep, rep);
  check("read-hides-deleted: X flagged for recovery insert", toInsert.map(r => r.id), ["X"]);
  const afterRecovery = simulateRecovery(merged, toInsert, cloudReal);
  check("read-hides-deleted: X dropped after duplicate-key → converges", visible(afterRecovery, rep).some(o => o.id === "X"), false);
}

// ── Scenario 2b (BUG): reads hide deleted AND the module's cloud result is
//    EMPTY for this user (its only rows are deleted). The empty-cloud branch
//    only pushes NEVER-synced local rows, so a previously-synced record that
//    is now missing is neither reconciled nor dropped — the stale, live copy
//    persists forever. This is the convergence hole; it only bites when
//    reads hide deleted rows (i.e. company-wide-read was NOT applied). ──
{
  const cloud = [];                    // module returns nothing (only row was deleted+hidden)
  const localRep = [X_live];           // rep still holds the synced live copy
  const { merged, toInsert } = mergeOnLoad("opps", cloud, localRep, rep);
  check("empty-module gap: nothing pushed (X already _syncedAt)", toInsert.length, 0);
  check("empty-module gap: stale deleted opp STAYS visible", visible(merged, rep).length, 1);
}

// ── Scenario 3: realtime UPDATE delivers the delete live (no reload). ──
{
  const localRep = [X_live];
  // realtime handler: shallow-merge the new row
  const applied = localRep.map(r => r.id === "X" ? { ...r, ...X_deleted, _syncedAt: "rt" } : r);
  check("realtime: live delete hides the opp for the rep", visible(applied, rep).length, 0);
}

// ── Scenario 4: RESURRECTION race — rep edits X in the window before they
//    learn it's deleted. Their outbound diff-sync would push is_deleted=false. ──
{
  const scope = rep;
  const prevX = X_live;                                   // rep's baseline (not yet deleted)
  const editedX = { ...X_live, stage: "Qualified" };      // rep edits the still-visible opp
  const changed = JSON.stringify(prevX) !== JSON.stringify(editedX);
  const wouldPush = changed && canWriteRec(scope, "opps", editedX);
  check("resurrection: rep's edit WOULD push (is_deleted=false) — the gap", wouldPush, true);
  check("resurrection: pushed payload re-opens the opp", editedX.isDeleted, false);
}

// ── Scenario 5: proposed safeguard — treat cloud is_deleted=true as
//    authoritative: block any outbound write that would un-delete a record
//    the cloud/local already knows is deleted. ──
{
  const knownDeleted = new Set(["X"]);   // ids the client has seen deleted
  const editedX = { id: "X", owner: "rep", stage: "Qualified", isDeleted: false };
  const safeguarded = editedX.isDeleted || !knownDeleted.has(editedX.id);
  check("safeguard: un-delete of a known-deleted record is blocked", safeguarded, false);
}

console.log(`\n${fail === 0 ? "✅" : "❌"} ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
