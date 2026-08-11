// ═══════════════════════════════════════════════════════════════════
// Fiscal-calendar + pipeline-stage helpers shared by the Targets (ABP)
// dashboard and My Performance. One definition so the two pages can
// never disagree about which quarter a deal books to or what "won"
// means. Mirrored in scripts/test-targets-attainment.mjs — KEEP IN SYNC.
// ═══════════════════════════════════════════════════════════════════

// Fiscal-quarter (India FY, Apr–Mar) key for a date → "YYYY-Q#", where YYYY
// is the FY start year and Q1 = Apr–Jun. Matches the app's "2026-Q1" usage.
//
// Reads the calendar fields straight out of a "YYYY-MM-DD" string rather than
// going through `new Date(...)`, which parses a bare date as UTC midnight —
// west of UTC that booked a deal closing 1 April into the PREVIOUS financial
// year's Q4. Reading the string is also exactly right for a DATE column,
// which stores a calendar day and not an instant.
export function periodOf(dateStr) {
  if (!dateStr) return "";
  let y, mo;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dateStr));
  if (m) {
    y = Number(m[1]); mo = Number(m[2]) - 1;
  } else {
    const d = new Date(dateStr);            // full timestamp or other format
    if (isNaN(d)) return "";
    y = d.getFullYear(); mo = d.getMonth();
  }
  if (mo < 0 || mo > 11) return "";
  const fyStart = mo >= 3 ? y : y - 1;
  const q = Math.floor(((mo - 3 + 12) % 12) / 3) + 1;
  return `${fyStart}-Q${q}`;
}

// FY of a period key: "2026-Q2" → "2026". Periods carry the FY start year.
export const fyOf = (period) => String(period || "").slice(0, 4);

// First calendar day of the fiscal structures containing `todayStr`
// ("YYYY-MM-DD"). String math on ISO dates, consistent with the app's
// string-compare date convention.
export function fiscalRanges(todayStr) {
  const y = Number(todayStr.slice(0, 4));
  const mo = Number(todayStr.slice(5, 7));           // 1-based
  const fyStartYear = mo >= 4 ? y : y - 1;
  // Fiscal quarters: Apr–Jun, Jul–Sep, Oct–Dec, Jan–Mar. The Jan–Mar quarter
  // starts in the same CALENDAR year as today even though its FY started the
  // year before.
  const qStartMonth = mo >= 4 ? Math.floor((mo - 4) / 3) * 3 + 4 : 1;
  const pad = (n) => String(n).padStart(2, "0");
  return {
    monthStart: `${todayStr.slice(0, 8)}01`,
    quarterStart: `${y}-${pad(qStartMonth)}-01`,
    fyStart: `${fyStartYear}-04-01`,
    currentPeriod: periodOf(todayStr),
  };
}

// Stage names meaning "won", whatever Masters currently calls the stage.
// Pipeline resolves the won stage by `kind === "won"` so a rename cannot
// break forecasting; the legacy literals stay because opportunity rows keep
// whatever stage string they were saved with.
export const LEGACY_WON_STAGES = ["Won", "closed_won"];
export const wonStageNames = (masters) => {
  const won = Array.isArray(masters?.stages) ? masters.stages.find(s => s?.kind === "won") : null;
  return new Set([won?.name, ...LEGACY_WON_STAGES].filter(Boolean));
};

// Stages meaning "closed lost" — a deal in neither won nor lost is PIPELINE.
export const lostStageNames = (masters) => {
  const lost = Array.isArray(masters?.stages) ? masters.stages.find(st => st?.kind === "lost") : null;
  return new Set([lost?.name, "Lost", "closed_lost", "Suspended"].filter(Boolean));
};

// A target's product focus matches an item with a products[] array (opps) or
// a single product + productSelection[] (call reports). "All" matches everything.
export const prodMatches = (tProd, arr, single) => {
  if (!tProd || tProd === "All") return true;
  if (Array.isArray(arr) && arr.includes(tProd)) return true;
  return single === tProd;
};
