// ═══════════════════════════════════════════════════════════════════
// test-pagination.mjs — verifies the paged cloud-read loop in
// src/lib/db.js (fetchAllRows) against a fake PostgREST that enforces
// a `max-rows` cap, exactly like Supabase does.
// ───────────────────────────────────────────────────────────────────
// Mirrors the algorithm in src/lib/db.js#fetchAllRows. db.js can't be
// imported directly from node (it reaches through ./supabase to
// import.meta.env, which only Vite defines), so — same convention as
// test-delete-sync.mjs — the loop is modelled here. KEEP IN SYNC with
// db.js if the paging strategy changes.
//
// What we're protecting against: PostgREST silently truncates any
// response at max-rows and returns no error, so a short read is
// indistinguishable from a complete one. Every case below is a way that
// truncation can sneak back in.
// ═══════════════════════════════════════════════════════════════════

let pass = 0, fail = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : `  → got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
  ok ? pass++ : fail++;
};

// ── Fake PostgREST ────────────────────────────────────────────────
// Serves .range(from, to) over a table, capping every response at
// maxRows the way Supabase's db-max-rows setting does.
//
// `stableSort` models the ORDER BY. With tiebreaker=false it sorts on
// created_at only and shuffles ties on every call — which is what a real
// planner is free to do across separate LIMIT/OFFSET queries.
function makeDb(rows, { maxRows = 1000, tiebreaker = true, failOnPage = -1 } = {}) {
  let pageCalls = 0;
  return {
    pageCalls: () => pageCalls,
    select(from, to) {
      const thisPage = pageCalls++;
      if (thisPage === failOnPage) return { data: null, error: { message: "network blip" } };
      const sorted = [...rows].sort((a, b) => {
        if (a.created_at !== b.created_at) return a.created_at < b.created_at ? 1 : -1;
        if (!tiebreaker) return Math.random() - 0.5;   // unstable tie order
        return a.id < b.id ? 1 : (a.id > b.id ? -1 : 0);
      });
      const want = to - from + 1;
      return { data: sorted.slice(from, from + Math.min(want, maxRows)), error: null };
    },
  };
}

// ── fetchAllRows (model of src/lib/db.js) ─────────────────────────
const PAGE_SIZE = 1000;
const MAX_PAGES = 500;

async function fetchAllRows(db, { pageSize = PAGE_SIZE, maxPages = MAX_PAGES } = {}) {
  const rows = [];
  for (let page = 0; page < maxPages; page++) {
    const from = rows.length;
    const { data, error } = db.select(from, from + pageSize - 1);
    if (error) return { rows: null, error };
    const batch = data || [];
    rows.push(...batch);
    if (batch.length === 0) return { rows, error: null };
  }
  return { rows: null, error: { message: `exceeded ${maxPages} pages — refusing to return a truncated result` } };
}

const mkRows = (n, { sharedTimestamp = false } = {}) =>
  Array.from({ length: n }, (_, i) => ({
    id: `id-${String(i).padStart(6, "0")}`,
    created_at: sharedTimestamp ? "2026-08-08T00:00:00Z" : new Date(1_700_000_000_000 + i * 1000).toISOString(),
  }));

const ids = (rows) => rows.map(r => r.id).sort();

// ── Tests ─────────────────────────────────────────────────────────
console.log("\nPaged cloud reads (fetchAllRows)\n");

{
  // The headline bug: 3k+ accounts against a 1000-row cap. Unpaginated
  // this returned 1000 and the other 2000 got dropped from local cache.
  const rows = mkRows(3000);
  const { rows: got, error } = await fetchAllRows(makeDb(rows));
  check("3000 rows / 1000 cap → all 3000 returned", got?.length, 3000);
  check("3000 rows → no error", error, null);
  check("3000 rows → every id exactly once", ids(got), ids(rows));
}

{
  // Off-by-one around an exact page boundary: the loop must not stop at
  // 2000 just because the page was full, nor double-count the boundary row.
  const rows = mkRows(2000);
  const { rows: got } = await fetchAllRows(makeDb(rows));
  check("exact multiple of page size → all 2000", got?.length, 2000);
  check("exact multiple → no duplicates", new Set(got.map(r => r.id)).size, 2000);
}

{
  const { rows: got, error } = await fetchAllRows(makeDb([]));
  check("empty table → []", got, []);
  check("empty table → no error", error, null);
}

{
  const rows = mkRows(1);
  const { rows: got } = await fetchAllRows(makeDb(rows));
  check("single row → 1 row", got?.length, 1);
}

{
  // The regression that a fixed-page-size assumption reintroduces: if
  // max-rows is configured BELOW our page size, advancing by PAGE_SIZE (or
  // stopping on the first short page) silently truncates. We advance by
  // rows actually returned, so this still completes.
  const rows = mkRows(2500);
  const { rows: got } = await fetchAllRows(makeDb(rows, { maxRows: 400 }));
  check("max-rows(400) below page size → still all 2500", got?.length, 2500);
  check("max-rows below page size → every id exactly once", ids(got), ids(rows));
}

{
  // A mid-pagination failure must NOT return the pages gathered so far —
  // a partial list is precisely the truncation this function prevents.
  const rows = mkRows(3000);
  const { rows: got, error } = await fetchAllRows(makeDb(rows, { failOnPage: 1 }));
  check("error on page 2 → rows discarded (not partial)", got, null);
  check("error on page 2 → error surfaced", error?.message, "network blip");
}

{
  // Bulk uploads write hundreds of rows sharing created_at. Without a
  // tiebreaker the tie order is unstable across the separate queries that
  // make up the paging, so rows get served twice and others never at all.
  const rows = mkRows(2500, { sharedTimestamp: true });
  const { rows: got } = await fetchAllRows(makeDb(rows, { tiebreaker: true }));
  check("identical created_at + tiebreaker → all 2500 exactly once", ids(got), ids(rows));

  const { rows: unstable } = await fetchAllRows(makeDb(rows, { tiebreaker: false }));
  const complete = JSON.stringify(ids(unstable)) === JSON.stringify(ids(rows));
  check("identical created_at WITHOUT tiebreaker → loses/dupes rows (why we sort by id too)", complete, false);
}

{
  // Runaway guard: a table bigger than MAX_PAGES worth of rows must error
  // rather than hand back a quietly-truncated list.
  const rows = mkRows(500);
  const { rows: got, error } = await fetchAllRows(makeDb(rows, { maxRows: 1 }), { pageSize: 1, maxPages: 10 });
  check("page cap exceeded → rows discarded", got, null);
  check("page cap exceeded → error surfaced", /refusing to return a truncated result/.test(error?.message || ""), true);
}

console.log(`\n${fail === 0 ? "✓" : "✗"} ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
