// ═══════════════════════════════════════════════════════════════════
// check-rls-role-parity.mjs — guards the bug class where a role is
// added to the JS permission layer but not to the SQL write policies.
// ───────────────────────────────────────────────────────────────────
// That is exactly how vp_sales_mkt ended up able to SEE everything and
// SAVE almost nothing: add_vp_sales_mkt_to_rls_v1.sql updated every read
// policy and no write policy, while helpers.jsx canRoleWrite() returns
// true for every GLOBAL_ROLES member. The client showed the buttons, the
// database refused the write, and the row vanished on reload.
//
// Static analysis only — it reads supabase/*.sql and src/utils/helpers.jsx.
// It cannot see which migrations were actually applied, so it asks a
// deliberately weak question per policy NAME: does ANY definition of this
// policy grant the role? A "no" means no migration ever fixed it.
// ═══════════════════════════════════════════════════════════════════

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// Roles the client treats as global writers (helpers.jsx GLOBAL_ROLES).
// Read from source so the two can't drift apart silently.
const helpers = readFileSync(join(root, "src/utils/helpers.jsx"), "utf8");
const globalRoles = (/export const GLOBAL_ROLES = \[([^\]]*)\]/.exec(helpers)?.[1] || "")
  .split(",").map(s => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean);

// Write policies that intentionally exclude a global role, with the reason.
// Keep this list short and justified — it is the "we meant that" register.
const INTENTIONAL = {
  contacts_delete:    "vp_sales_mkt — deletion is admin/md/director only, matching canDelete in SmartCRM.jsx",
  projects_delete:    "vp_sales_mkt — same canDelete parity",
  updates_delete:     "vp_sales_mkt — same canDelete parity",
  users_admin_delete: "vp_sales_mkt — the VP administers users but the client never offers user deletion",
};

// ── Collect every policy definition across the migration files ──────
const policies = new Map(); // name → { cmds:Set, roleSets:[string[]], files:Set }
// A policy someone explicitly DROPped without re-creating it is retired, and
// its old role list no longer means anything. This is order-independent: a
// migration that drops-then-creates (the idempotent pattern used everywhere
// here) does not count as retiring.
const retired = new Set();

for (const file of readdirSync(join(root, "supabase")).filter(f => f.endsWith(".sql"))) {
  const sql = readFileSync(join(root, "supabase", file), "utf8");
  const created = new Set([...sql.matchAll(/CREATE POLICY\s+"([^"]+)"/gi)].map(m => m[1]));
  for (const m of sql.matchAll(/DROP POLICY\s+(?:IF EXISTS\s+)?"([^"]+)"/gi)) {
    if (!created.has(m[1])) retired.add(m[1]);
  }
  // CREATE POLICY "name" ON table FOR CMD … up to the next statement.
  const re = /CREATE POLICY\s+"([^"]+)"\s+ON\s+[\w.]+\s*(?:FOR\s+(\w+))?([\s\S]*?);/gi;
  for (const m of sql.matchAll(re)) {
    const [, name, cmd = "ALL", body] = m;
    const entry = policies.get(name) || { cmds: new Set(), roleSets: [], files: new Set() };
    entry.cmds.add(cmd.toUpperCase());
    entry.files.add(file);
    for (const rm of body.matchAll(/get_crm_role\(\)\s+IN\s*\(([^)]*)\)/gi)) {
      entry.roleSets.push(rm[1].split(",").map(s => s.trim().replace(/^'|'$/g, "")).filter(Boolean));
    }
    policies.set(name, entry);
  }
}

// ── Report ──────────────────────────────────────────────────────────
let problems = 0, checked = 0, exempt = 0;
console.log(`\nRLS role parity — GLOBAL_ROLES = [${globalRoles.join(", ")}]\n`);

for (const [name, p] of [...policies].sort()) {
  // Only write paths matter; SELECT was covered by add_vp_sales_mkt_to_rls_v1.
  if ([...p.cmds].every(c => c === "SELECT")) continue;
  if (retired.has(name)) continue;                       // dropped, never re-created
  // Only allow-list policies can exclude a role. Deny-lists (NOT IN) let
  // everything else through and are fine by construction.
  if (p.roleSets.length === 0) continue;
  // A manager-shaped allow-list is the pattern at risk.
  if (!p.roleSets.some(set => set.includes("line_mgr") || set.includes("director"))) continue;

  checked++;
  const missing = globalRoles.filter(role =>
    role !== "admin" && !p.roleSets.some(set => set.includes(role)));

  if (missing.length === 0) continue;
  if (INTENTIONAL[name]) {
    exempt++;
    console.log(`  · ${name} — excludes ${missing.join(", ")} by design (${INTENTIONAL[name]})`);
    continue;
  }
  problems++;
  console.log(`  ✗ ${name} [${[...p.cmds].join("/")}] omits ${missing.join(", ")}`);
  console.log(`      defined in: ${[...p.files].join(", ")}`);
  console.log(`      role sets:  ${p.roleSets.map(s => `(${s.join(",")})`).join(" ")}`);
}

console.log(`\n${problems === 0 ? "✓" : "✗"} ${checked} write policies checked · ${exempt} intentional exclusions · ${problems} unexplained\n`);
if (problems > 0) {
  console.log("A global role can write in the client but not in the database.");
  console.log("Either add it to the policy, or record the reason in INTENTIONAL above.\n");
}
process.exit(problems === 0 ? 0 : 1);
