// ═══════════════════════════════════════════════════════════════════
// printQuote — client-facing print / PDF for engine-built quotes
// ═══════════════════════════════════════════════════════════════════
// Phase E. Opens a clean print window (browser "Save as PDF") for a
// Hans-pricing quote: party block, line items, summary with GST split,
// ALR shown separately, and terms. No external deps. Reads q.hans (the
// engine breakdown stored by HansQuoteBuilder).
// ═══════════════════════════════════════════════════════════════════

import { kycPageHtml } from "./handover.js";
import { companyOf } from "./company.js";
import { quoteDocumentHtml, awaitingApproval } from "./quoteDocument.js";


/**
 * Customer quotation in the approved format (lib/quotation/quoteDocument.js).
 * opts: { config, priceRows, catalog, preparedBy, acceptUrl, logoUrl, extraPagesHtml }
 * The KYC form is always the last page; no accept link while approval is pending.
 */
export function printHansQuote(quote, opts = {}) {
  const pending = awaitingApproval(quote);
  const h = quote.hans || {};
  const party = h.party || {};
  const kyc = kycPageHtml({ ...quote, legalName: quote.legalName || party.name, gstin: quote.gstin || party.gstin, billingAddressSnapshot: quote.billingAddressSnapshot || party.address },
    { acceptUrl: pending ? "" : (opts.acceptUrl || ""), seller: companyOf(opts.config || {}).name });
  const html = quoteDocumentHtml(quote, {
    ...opts,
    acceptUrl: pending ? "" : opts.acceptUrl,
    logoUrl: opts.logoUrl || (typeof window !== "undefined" ? `${window.location.origin}/hans-logo.png` : ""),
    extraPagesHtml: `${opts.extraPagesHtml || ""}${kyc}`,
  });
  const w = window.open("", "_blank", "width=900,height=1000");
  if (!w) { alert("Please allow pop-ups to print/export the quote."); return; }
  w.document.open(); w.document.write(html); w.document.close();
}
