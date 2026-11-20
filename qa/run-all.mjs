// QA runner: runs every offline test suite in scripts/ and prints a summary.
// Usage: node qa/run-all.mjs [--json out.json]
// smoke-email-agent.mjs is excluded: it calls a live service.
import { spawnSync } from "node:child_process";
import { readdirSync, writeFileSync } from "node:fs";

const suites = readdirSync("scripts")
  .filter((f) => /^(test-.*|acceptance-.*|check-rls-role-parity)\.mjs$/.test(f))
  .sort();
const results = [];
for (const f of suites) {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [`scripts/${f}`], { encoding: "utf8", timeout: 120000 });
  const out = `${r.stdout || ""}${r.stderr || ""}`;
  const fails = (out.match(/^\s*(✗|FAIL|not ok)/gim) || []).length;
  results.push({ suite: f, exit: r.status, ms: Date.now() - t0, failLines: fails, tail: out.trim().split(/\r?\n/).slice(-3).join(" | ").slice(0, 300) });
  console.log(`${r.status === 0 ? "PASS" : "FAIL"}  ${f}  (exit ${r.status}, ${Date.now() - t0} ms)  ${results.at(-1).tail}`);
}
const failed = results.filter((r) => r.exit !== 0);
console.log(`\n${results.length} suites, ${results.length - failed.length} passed, ${failed.length} failed`);
const i = process.argv.indexOf("--json");
if (i > 0) writeFileSync(process.argv[i + 1], JSON.stringify(results, null, 2));
process.exit(failed.length ? 1 : 0);
