import { useState, useMemo } from "react";
import { Upload, Download, Check, AlertCircle, RefreshCw, ArrowUpCircle, PlusCircle, Info, Loader } from "lucide-react";
import { UPLOAD_TYPES } from '../data/constants';
import { uid } from '../utils/helpers';
import { notify } from '../utils/toast';
import { Empty, PageTip } from './shared';

// ─── Product + Module CSV format ─────────────────────────────────────────────
// Encoding accepted in the `productSelection` column:
//   "iCAFFE[eSanchit Filing|OCR Engine]; WiseCargo[None]; WiseDox"
//
// Rules:
//   - Multiple product lines separated by ";"
//   - Modules per product wrapped in [ ... ], pipe-separated
//   - "[None]" → noAddons:true (explicit no-modules acknowledgement)
//   - Bare product name (no brackets) → all modules unset & noAddons false
//     (caller will need to pick at least one module before saving — but for
//     bulk import we accept it and treat as a soft selection)
//   - Both product names AND product IDs accepted (case-insensitive)
//   - Both module names AND module IDs accepted (case-insensitive)
//
// Returns { value: [...], errors: [...] }. value is the parsed productSelection
// array; errors is a list of unmatched product/module names so the row can be
// rejected with an actionable message.
export function parseProductSelectionCSV(raw, catalog) {
  if (!raw || !String(raw).trim()) return { value: [], errors: [] };
  const errors = [];
  const value = [];
  const seenProducts = new Set();
  const segments = String(raw).split(/;|\n/).map(s => s.trim()).filter(Boolean);
  for (const seg of segments) {
    // Match "Product[Mod1|Mod2]" or just "Product"
    const m = seg.match(/^([^[]+?)(?:\[([^\]]*)\])?$/);
    if (!m) { errors.push(`Unparseable product segment: "${seg}"`); continue; }
    const prodName = m[1].trim();
    const modBlock = (m[2] || "").trim();
    const product = (catalog || []).find(p =>
      p.id?.toLowerCase() === prodName.toLowerCase() ||
      p.name?.toLowerCase() === prodName.toLowerCase()
    );
    if (!product) { errors.push(`Unknown product "${prodName}" — not in Masters > Product Catalogue`); continue; }
    if (seenProducts.has(product.id)) { errors.push(`Duplicate product line for "${product.name}"`); continue; }
    seenProducts.add(product.id);
    // Empty bracket "[]" → soft selection (no modules picked, noAddons false)
    if (!modBlock) { value.push({ productId: product.id, moduleIds: [], noAddons: false }); continue; }
    if (modBlock.toLowerCase() === "none") { value.push({ productId: product.id, moduleIds: [], noAddons: true }); continue; }
    const tokens = modBlock.split("|").map(s => s.trim()).filter(Boolean);
    const moduleIds = [];
    for (const tok of tokens) {
      const mod = (product.modules || []).find(mm =>
        mm.id?.toLowerCase() === tok.toLowerCase() ||
        mm.name?.toLowerCase() === tok.toLowerCase()
      );
      if (!mod) { errors.push(`Unknown module "${tok}" for product "${product.name}"`); continue; }
      if (!moduleIds.includes(mod.id)) moduleIds.push(mod.id);
    }
    value.push({ productId: product.id, moduleIds, noAddons: false });
  }
  return { value, errors };
}

// ─── Schemas ─────────────────────────────────────────────────────────────────
// refKey   → field used to match an EXISTING record (UPDATE path)
// uniqueKey→ field used for within-file duplicate detection
// If a row's refKey value matches an existing record, it becomes an UPDATE.
// If no match, it becomes a fresh INSERT.

const SCHEMAS = {
  Leads: {
    refKey:    "leadId",   // e.g. #FL-2026-001  — leave blank for new leads
    uniqueKey: "email",
    mandatory: ["company","email","product","source","stage"],
    optional:  [
      "leadId","contactName","phone","designation","vertical","region",
      "assignedTo","notes","nextCall","score","temperature",
      "noOfUsers","businessType","budgetRange","nextStep","objections",
      "country","state","city","companyWebsite","alternatePhone","alternateEmail",
      "linkedInUrl","annualRevenue","campaignName","referredBy","expectedCloseDate",
      "proposalSent","demoScheduled","competitorName","lastContactDate",
      "productSelection",
    ],
    sample: [
      "leadId,company,contactName,email,phone,product,productSelection,vertical,region,source,stage,country,state,score,expectedCloseDate,estimatedValue,campaignName,assignedTo",
      "#FL-2026-001,Acme Corp,John Doe,john@acme.com,+91-98765-00001,iCAFFE,iCAFFE[eSanchit Filing|OCR Engine]; WiseCargo[None],CHA,South Asia,Inside Sales,MQL,India,Maharashtra,50,2026-06-30,500000,,",
      ",Beta Logistics,Jane Roe,jane@beta.com,+91-98765-00002,WiseCargo,WiseCargo[AWB Management],Forwarder,South Asia,Referral,MQL,India,Delhi,60,2026-07-15,200000,Q1 Campaign,",
    ].join("\n"),
    validate: (row) => {
      const e = [];
      if (!row.company?.trim())  e.push("Company required");
      if (!row.email?.trim())    e.push("Email required");
      if (!row.product?.trim())  e.push("Product required");
      if (!row.source?.trim())   e.push("Source required");
      if (!row.stage?.trim())    e.push("Stage required");
      return e;
    },
  },

  Customers: {
    refKey:    "accountNo",  // e.g. ACC-2026-001 — leave blank for new accounts
    uniqueKey: "name",
    mandatory: ["name","type","country"],
    optional:  [
      "accountNo","city","address","website","segment","status",
      "hierarchyLevel","parentId","products","productSelection","arrRevenue","potential","owner",
      "state","pincode","legalName","pan","gstin","cin","taxTreatment","tdsApplicable","poMandatory",
      "billingAddress","billingCity","billingState","billingPincode","billingCountry",
      "primaryContact","primaryEmail","primaryPhone",
      "billingContactName","billingContactEmail","financeContactEmail",
      "paymentTerms","creditDays","currency","billingFrequency",
      "entityType","groupCode","territory",
    ],
    // Headers match Accounts export exactly — export CSV → edit in Excel → re-upload to UPDATE
    sample: [
      "accountNo,name,type,country,city,state,pincode,address,legalName,pan,gstin,taxTreatment,website,segment,status,entityType,groupCode,paymentTerms,currency,billingFrequency,products,productSelection,arrRevenue,potential,owner",
      "ACC-2026-001,Acme Airlines,Airline,India,Mumbai,Maharashtra,400069,Andheri East Mumbai 400069,Acme Airlines Pvt Ltd,AAAAA1234A,27AAAAA1234A1Z5,Domestic,acme.com,Enterprise,Active,Head Office,GRP-ACM,Net 30,INR,Annual,iCAFFE;WiseCargo,iCAFFE[eSanchit Filing|OCR Engine]; WiseCargo[AWB Management|DG Handling],10,50,",
      "ACC-2026-002,Delta Freight,Freight Forwarder,UAE,Dubai,,,,,,,Export,betafreight.ae,Mid-Market,Active,Head Office,,Net 45,AED,Quarterly,WiseTrax,WiseTrax[None],5,20,",
      ",Beta Logistics,Customs Broker,India,Delhi,Delhi,110001,,Beta Logistics Pvt Ltd,BBBBB5678B,,Domestic,beta.in,SMB,Prospect,Head Office,,Net 30,INR,Annual,iCAFFE,iCAFFE[eSanchit Filing],0,15,",
    ].join("\n"),
    validate: (row) => {
      const e = [];
      if (!row.name?.trim())    e.push("Name required");
      if (!row.type?.trim())    e.push("Type required");
      if (!row.country?.trim()) e.push("Country required");
      return e;
    },
  },

  Contacts: {
    refKey:    "contactId",  // e.g. CON-001
    uniqueKey: "email",
    mandatory: ["name","email"],
    optional:  [
      "contactId","phone","designation","role","department",
      "accountId","accountName","products","primary","countries","branches",
      "city","state","country","pincode","alternateEmail","alternatePhone",
      "linkedInUrl","decisionLevel","influence","category",
      "preferredContactMode","doNotContact","lastContactDate","source",
    ],
    sample: [
      "contactId,name,email,phone,designation,role,department,accountId,city,state,country,decisionLevel,influence,category,preferredContactMode,linkedInUrl",
      "CON-001,Jane Smith,jane@acme.com,+91-98765-00002,VP Operations,Decision Maker/HOD,Operations,ACC-2026-001,Mumbai,Maharashtra,India,VP-Director,High,Champion,Email,linkedin.com/in/janesmith",
      ",Mark Lee,mark@acme.com,+91-98765-00003,IT Manager,End User,IT,ACC-2026-001,Mumbai,Maharashtra,India,Manager,Medium,Neutral,Phone,",
    ].join("\n"),
    validate: (row) => {
      const e = [];
      if (!row.name?.trim())  e.push("Name required");
      if (!row.email?.trim()) e.push("Email required");
      return e;
    },
  },

  Collections: {
    refKey:    "invoiceNo",  // e.g. INV-2026-100  — also uniqueKey
    uniqueKey: "invoiceNo",
    mandatory: ["invoiceNo","accountId","invoiceDate","dueDate","billedAmount"],
    optional:  [
      "collectedAmount","pendingAmount","status","paymentMode",
      "paymentDate","remarks","owner",
      "invoiceType","product","currency","gstAmount","tdsAmount","netPayable",
      "billPeriodFrom","billPeriodTo","agingBucket","followUpDate","chequeRef","approvedBy",
    ],
    sample: [
      "invoiceNo,accountId,invoiceDate,dueDate,billedAmount,gstAmount,tdsAmount,netPayable,collectedAmount,pendingAmount,status,currency,paymentMode,paymentDate,chequeRef,remarks",
      "INV-2026-100,ACC-2026-001,2026-04-01,2026-05-01,500000,90000,0,590000,0,590000,Current,INR,NEFT,,,Full payment due",
      "INV-2026-099,ACC-2026-001,2026-03-01,2026-04-01,200000,36000,20000,216000,216000,0,Paid,INR,NEFT,2026-03-28,UTR-123456,",
    ].join("\n"),
    validate: (row) => {
      const e = [];
      if (!row.invoiceNo?.trim())    e.push("Invoice No. required");
      if (!row.accountId?.trim())    e.push("Account ID required");
      if (!row.invoiceDate?.trim())  e.push("Invoice date required");
      if (!row.dueDate?.trim())      e.push("Due date required");
      if (!row.billedAmount?.trim()) e.push("Billed amount required");
      return e;
    },
  },

  "Support Tickets": {
    refKey:    "ticketNo",   // e.g. TKT-2026-001 — leave blank for new tickets
    uniqueKey: "title",
    mandatory: ["title","accountId","product","priority"],
    optional:  [
      "ticketNo","type","description","assigned","status","sla",
      "category","subCategory","created","resolved",
      "reportedBy","reportedDate","resolvedDate","affectedModule",
      "severity","environment","workaround","internalNotes","revisitDate","tags",
    ],
    sample: [
      "ticketNo,title,accountId,product,type,category,priority,severity,description,reportedBy,reportedDate,environment,affectedModule,assigned,status,resolvedDate",
      "TKT-2026-001,Login issue on portal,ACC-2026-001,WiseCargo,Bug / Glitch,Technical,High,Critical,Users unable to login,John Smith,2026-04-01,Production,Auth Module,,Open,",
      ",Data export failing,ACC-2026-001,iCAFFE,Feature Request,Functional,Medium,Medium,Export button throws error,Jane Roe,2026-04-05,Production,Reports,,Open,",
    ].join("\n"),
    validate: (row) => {
      const e = [];
      if (!row.title?.trim())     e.push("Title required");
      if (!row.accountId?.trim()) e.push("Account ID required");
      if (!row.product?.trim())   e.push("Product required");
      if (!row.priority?.trim())  e.push("Priority required");
      return e;
    },
  },

  Contracts: {
    refKey:    "contractNo", // e.g. CTR-2026-001 — leave blank for new contracts
    uniqueKey: "title",
    mandatory: ["title","accountId","product","status","value"],
    optional:  [
      "contractNo","productSelection","startDate","endDate","billTerm","billType",
      "poNumber","owner","terms","notes","oppId",
      "renewalType","paymentTerms","currency","billingFrequency","invoiceGenBasis",
      "griApplicable","griPercentage","noOfUsers","noOfBranches","serviceStartDate",
      "commercialModel","autoRenewal","warrantyMonths","goLiveDate","territory",
    ],
    sample: [
      "contractNo,title,accountId,product,productSelection,status,value,startDate,endDate,serviceStartDate,commercialModel,billingFrequency,paymentTerms,currency,noOfUsers,noOfBranches,renewalType,autoRenewal,griApplicable,griPercentage,goLiveDate,territory",
      "CTR-2026-001,WiseCargo License — Acme,ACC-2026-001,WiseCargo,WiseCargo[AWB Management|DG Handling|Cargo Terminal Ops],Active,200000,2026-01-01,2026-12-31,2026-02-01,Annual SaaS,Annual,Net 30,INR,50,3,Manual,No,No,0,2026-02-15,South Asia",
      ",iCAFFE Starter — Beta,ACC-2026-002,iCAFFE,iCAFFE[eSanchit Filing],Draft,50000,2026-06-01,2027-05-31,,,Annual,Net 30,INR,10,1,Manual,No,No,0,,",
    ].join("\n"),
    validate: (row) => {
      const e = [];
      if (!row.title?.trim())     e.push("Title required");
      if (!row.accountId?.trim()) e.push("Account ID required");
      if (!row.product?.trim())   e.push("Product required");
      if (!row.status?.trim())    e.push("Status required");
      if (!row.value?.trim())     e.push("Value required");
      return e;
    },
  },

  Invoices: {
    refKey:    "invoiceNo",
    uniqueKey: "invoiceNo",
    mandatory: ["invoiceNo","accountId","invoiceDate","dueDate","billedAmount","product"],
    optional:  [
      "accountNo","contractNo","invoiceType","billPeriodFrom","billPeriodTo",
      "description","gstRate","gstAmount","tdsRate","tdsAmount","netPayable",
      "currency","paymentTerms","status","paymentDate","paymentRef","paymentMode",
      "collectedAmount","pendingAmount","agingBucket","remarks","owner",
    ],
    sample: [
      "invoiceNo,accountId,accountNo,contractNo,invoiceType,billPeriodFrom,billPeriodTo,invoiceDate,dueDate,product,billedAmount,gstRate,gstAmount,tdsRate,tdsAmount,netPayable,currency,status,paymentMode,paymentDate,collectedAmount,pendingAmount,remarks",
      "INV-2026-001,ACC-2026-001,ACC-2026-001,CTR-2026-001,Tax Invoice,2026-04-01,2026-04-30,2026-04-01,2026-05-01,iCAFFE,100000,18,18000,10,10000,108000,INR,Sent,NEFT,,0,108000,Q1 annual invoice",
      "INV-2026-002,ACC-2026-002,,CTR-2026-002,Tax Invoice,2026-04-01,2026-04-30,2026-04-05,2026-05-05,WiseCargo,50000,18,9000,0,0,59000,INR,Paid,NEFT,2026-04-20,59000,0,Paid on time",
    ].join("\n"),
    validate: (row) => {
      const e = [];
      if (!row.invoiceNo?.trim())    e.push("Invoice No. required");
      if (!row.accountId?.trim())    e.push("Account ID required");
      if (!row.invoiceDate?.trim())  e.push("Invoice date required");
      if (!row.dueDate?.trim())      e.push("Due date required");
      if (!row.billedAmount?.trim()) e.push("Billed amount required");
      if (!row.product?.trim())      e.push("Product required");
      return e;
    },
  },

  Pipeline: {
    refKey:    "oppNo",       // e.g. OPP-2026-001 — leave blank for new deals
    uniqueKey: "title",
    mandatory: ["title","accountId","stage","value","closeDate"],
    optional:  [
      "oppNo","products","productSelection","probability","source","country","lob","owner",
      "hierarchyLevel","dealSize","forecastCat","currency","competitors",
      "lossReason","nextStep","decisionDate","budget","territory",
      "campaignSource","notes","createdDate",
    ],
    sample: [
      "oppNo,title,accountId,stage,value,probability,closeDate,source,country,lob,products,productSelection,dealSize,forecastCat,currency,nextStep,decisionDate,owner",
      "OPP-2026-001,iCAFFE License — Acme,ACC-2026-001,Proposal,15,60,2026-06-30,Inside Sales,India,CHA,iCAFFE,iCAFFE[eSanchit Filing|OCR Engine],Medium,Commit,INR,Send proposal,2026-05-15,",
      "OPP-2026-002,WiseCargo — Delta Freight,ACC-2026-002,Demo,25,45,2026-07-31,Referral,UAE,Freight Forwarder,WiseCargo,WiseCargo[AWB Management|DG Handling],Large,Pipeline,USD,Schedule demo,2026-06-01,",
      ",WiseTrax Messaging — Beta,ACC-2026-003,Qualified,8,25,2026-08-31,Inside Sales,India,Airline,WiseTrax,WiseTrax[Type-B Gateway],Small,Pipeline,INR,Initial call done,,",
    ].join("\n"),
    validate: (row) => {
      const e = [];
      if (!row.title?.trim())     e.push("Title required");
      if (!row.accountId?.trim()) e.push("Account ID required");
      if (!row.stage?.trim())     e.push("Stage required");
      if (!row.value?.trim())     e.push("Value required");
      if (!row.closeDate?.trim()) e.push("Close date required");
      return e;
    },
  },
};

// ─── CSV parser ──────────────────────────────────────────────────────────────
function parseCSVLine(line) {
  const vals = [];
  let cur = "", inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (ch === ',' && !inQ) {
      vals.push(cur.trim()); cur = "";
    } else {
      cur += ch;
    }
  }
  vals.push(cur.trim());
  return vals;
}

function parseCSV(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l);
  if (lines.length < 2) return { headers: [], rows: [] };
  const headers = parseCSVLine(lines[0]).map(h => h.trim());
  const rows = lines.slice(1).map((line, idx) => {
    const vals = parseCSVLine(line);
    const obj = {};
    headers.forEach((h, i) => { obj[h] = vals[i] ?? ""; });
    obj._row = idx + 2;
    return obj;
  });
  return { headers, rows };
}

// ─── Component ───────────────────────────────────────────────────────────────
function BulkUpload({ onUpload, existingData = {}, catalog = [] }) {
  const [type, setType]       = useState("Leads");
  const [fileData, setFileData] = useState(null);
  const [results, setResults]   = useState(null);
  const [parsing, setParsing]   = useState(false);
  const [processing, setProcessing] = useState(null); // { current, total, label }

  const schema = SCHEMAS[type];

  // Existing records for the currently selected type
  const existing = useMemo(() => {
    const map = {
      Leads:            existingData.leads        || [],
      Customers:        existingData.accounts     || [],
      Contacts:         existingData.contacts     || [],
      Collections:      existingData.collections  || [],
      "Support Tickets":existingData.tickets      || [],
      Contracts:        existingData.contracts    || [],
      Invoices:         existingData.invoices     || [],
      Pipeline:         existingData.opps         || [],
    };
    return map[type] || [];
  }, [type, existingData]);

  // Build a lookup: refKey value → existing record
  const existingByRef = useMemo(() => {
    const m = {};
    const refField = {
      Leads:            "leadId",
      Customers:        "accountNo",
      Contacts:         "contactId",
      Collections:      "invoiceNo",
      "Support Tickets":"ticketNo",
      Contracts:        "contractNo",
      Invoices:         "invoiceNo",
      Pipeline:         "oppNo",
    }[type];
    existing.forEach(r => {
      const v = r[refField];
      if (v) m[String(v).toLowerCase().trim()] = r;
    });
    return m;
  }, [existing, type]);

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setParsing(true);
    setResults(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = parseCSV(ev.target.result);
        setFileData(parsed);
        if (parsed.rows.length === 0) {
          notify.error("No data rows found in file. Check that row 1 contains headers and data starts on row 2.");
        } else {
          notify.info(`Loaded ${parsed.rows.length} rows from ${file.name}. Click Validate Data to check.`);
        }
      } catch (err) {
        notify.error(`Couldn't parse CSV: ${err?.message || "invalid format"}.`);
      } finally {
        setParsing(false);
      }
    };
    reader.onerror = () => {
      notify.error(`Failed to read ${file.name}: ${reader.error?.message || "file unreadable"}.`);
      setParsing(false);
    };
    reader.readAsText(file);
  };

  const validate = () => {
    if (!fileData?.rows.length) return;

    const seenInFile = new Set();
    const validated = fileData.rows.map(row => {
      const errs = [...schema.validate(row)];

      // Mandatory check
      schema.mandatory.forEach(f => {
        if (!row[f]?.trim()) {
          if (!errs.find(e => e.toLowerCase().includes(f.toLowerCase()))) {
            errs.push(`${f} is required`);
          }
        }
      });

      // Within-file duplicate on uniqueKey
      const uKey = row[schema.uniqueKey]?.toLowerCase().trim();
      if (uKey && seenInFile.has(uKey)) errs.push(`Duplicate ${schema.uniqueKey} in file: "${row[schema.uniqueKey]}"`);
      if (uKey) seenInFile.add(uKey);

      // Match against existing records via refKey
      const refVal = row[schema.refKey]?.trim();
      const matched = refVal ? existingByRef[refVal.toLowerCase()] : null;
      const mode = matched ? "update" : "insert";

      // Validate productSelection (if present) against live Masters catalog
      let parsedSelection = null;
      if (row.productSelection?.trim()) {
        const parsed = parseProductSelectionCSV(row.productSelection, catalog);
        if (parsed.errors.length > 0) errs.push(...parsed.errors);
        parsedSelection = parsed.value;
      }

      return { ...row, _errors: errs, _valid: errs.length === 0, _mode: mode, _matchedId: matched?.id || null, _productSelection: parsedSelection };
    });

    setResults(validated);
  };

  const doUpload = async () => {
    if (!results) return;
    const valid = results.filter(r => r._valid);
    if (valid.length === 0) return;

    setProcessing({ current: 0, total: valid.length, label: "Preparing records…" });
    // Yield a frame so the spinner can paint before the heavy map below
    await new Promise(r => setTimeout(r, 0));

    const records = valid.map(r => {
      const clean = { ...r };
      // Replace the raw productSelection STRING with the parsed ARRAY so the
      // handler stores it in the same shape as the live picker produces.
      // Also keep the legacy `products` field synced for filters/exports.
      if (r._productSelection) {
        clean.productSelection = r._productSelection;
        const productIds = r._productSelection.map(e => e.productId);
        if (productIds.length > 0) clean.products = productIds;
      } else if (clean.productSelection !== undefined) {
        // Empty cell — strip it so we don't overwrite an existing array with ""
        delete clean.productSelection;
      }
      // Remove internal tracking fields
      delete clean._row; delete clean._errors; delete clean._valid;
      delete clean._mode; delete clean._matchedId; delete clean._productSelection;

      if (r._mode === "update") {
        // Preserve the existing internal id so SmartCRM can match and merge
        clean.id = r._matchedId;
      } else {
        // New record — assign a fresh internal id
        clean.id = `bulk_${uid()}`;
      }
      clean._bulkMode = r._mode; // pass mode hint to handler
      return clean;
    });

    setProcessing({ current: valid.length, total: valid.length, label: `Importing ${valid.length} ${type.toLowerCase()}…` });
    await new Promise(r => setTimeout(r, 0));

    try {
      onUpload(type, records);
      const insertN = records.filter(r => r._bulkMode === "insert").length;
      const updateN = records.filter(r => r._bulkMode === "update").length;
      const parts = [];
      if (insertN) parts.push(`${insertN} new`);
      if (updateN) parts.push(`${updateN} updated`);
      notify.success(`${type}: ${parts.join(", ") || valid.length + " records"} imported.`);
      setResults(null);
      setFileData(null);
    } catch (err) {
      notify.error(`Import failed: ${err?.message || "unknown error"}.`);
    } finally {
      setProcessing(null);
    }
  };

  const downloadSample = () => {
    const blob = new Blob(["\uFEFF" + schema.sample], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = `sample_${type.toLowerCase().replace(/\s+/g, "_")}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  const validCount   = results?.filter(r => r._valid).length  || 0;
  const errorCount   = results?.filter(r => !r._valid).length || 0;
  const updateCount  = results?.filter(r => r._valid && r._mode === "update").length || 0;
  const insertCount  = results?.filter(r => r._valid && r._mode === "insert").length || 0;

  return (
    <div>
      <PageTip
        id="bulkupload-tip-v2"
        title="Bulk Upload tip:"
        text={`Download the sample CSV for exact column headers. To UPDATE an existing record, include its reference ID (e.g. ${schema.refKey}) in the first column. Leave it blank for new records. Accounts can be referenced by Account No. (ACC-YYYY-NNN) in accountId fields.`}
      />

      <div className="pg-head">
        <div>
          <div className="pg-title">Bulk Upload</div>
          <div className="pg-sub">Import or update records from a CSV file</div>
        </div>
      </div>

      {/* Type selector */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text3)", marginBottom: 10 }}>SELECT MODULE</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {UPLOAD_TYPES.map(t => (
            <button key={t}
              className={`btn btn-sm ${type === t ? "btn-primary" : "btn-sec"}`}
              onClick={() => { setType(t); setFileData(null); setResults(null); }}>
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Schema info */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>{type} — Column Reference</div>
          <button className="btn btn-sec btn-sm" onClick={downloadSample}><Download size={13} />Download Sample CSV</button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--red)", marginBottom: 4 }}>MANDATORY</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {schema.mandatory.map(f => (
                <span key={f} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, background: "var(--red-bg)", color: "var(--red-t)", fontWeight: 600 }}>{f}</span>
              ))}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text3)", marginBottom: 4 }}>OPTIONAL</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {schema.optional.map(f => (
                <span key={f} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, background: "var(--s3)", color: "var(--text2)" }}>{f}</span>
              ))}
            </div>
          </div>
        </div>

        <div style={{ fontSize: 11, padding: "8px 12px", borderRadius: 6, background: "var(--brand-bg)", color: "var(--brand)", display: "flex", gap: 8, alignItems: "flex-start" }}>
          <Info size={13} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>
            <strong>Reference ID:</strong> <code style={{ fontSize: 11 }}>{schema.refKey}</code> — include to UPDATE an existing record.
            Leave blank to INSERT a new one. &nbsp;·&nbsp;
            <strong>Duplicate key (within file):</strong> <code style={{ fontSize: 11 }}>{schema.uniqueKey}</code>
          </span>
        </div>

        {existing.length > 0 && (
          <div style={{ fontSize: 11, marginTop: 6, color: "var(--text3)" }}>
            {existing.length} existing {type.toLowerCase()} records loaded — ref IDs matched against these.
          </div>
        )}

        {schema.optional.includes("productSelection") && (
          <div style={{ fontSize: 11, marginTop: 8, padding: "8px 12px", borderRadius: 6, background: "#F0F9FF", color: "#075985", border: "1px solid #BAE6FD" }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>productSelection format (validated against Masters &gt; Product Catalogue):</div>
            <div style={{ fontFamily: "monospace", fontSize: 11, marginBottom: 4 }}>
              iCAFFE[eSanchit Filing|OCR Engine]; WiseCargo[None]; WiseDox[Doc Repository]
            </div>
            <div style={{ fontSize: 11, opacity: 0.9 }}>
              · Multiple products separated by <code>;</code> &nbsp;·&nbsp; Modules per product wrapped in <code>[ ]</code>, pipe-separated
              &nbsp;·&nbsp; Use <code>[None]</code> when no add-ons apply &nbsp;·&nbsp; Product/module names matched case-insensitively
              against current Masters. Unknown names are rejected with a row error.
            </div>
            {catalog.length > 0 && (
              <details style={{ marginTop: 6 }}>
                <summary style={{ cursor: "pointer", fontWeight: 600 }}>Available products ({catalog.length})</summary>
                <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }}>
                  {catalog.map(p => (
                    <div key={p.id} style={{ fontSize: 11 }}>
                      <strong>{p.name}</strong>
                      {p.modules?.length > 0 && (
                        <span style={{ color: "var(--text3)" }}>
                          {" — "}{p.modules.map(m => m.name).join(", ")}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        )}
      </div>

      {/* File drop zone */}
      <div className="card" style={{ marginBottom: 16, textAlign: "center", padding: 28, border: "2px dashed var(--border)" }}>
        {parsing ? (
          <Loader size={30} style={{ color: "var(--brand)", marginBottom: 8, animation: "spin 0.8s linear infinite" }} />
        ) : (
          <Upload size={30} style={{ color: "var(--text3)", marginBottom: 8 }} />
        )}
        <div style={{ fontSize: 13, marginBottom: 10 }}>
          {parsing
            ? <span style={{ color: "var(--brand)", fontWeight: 700 }}>Reading file…</span>
            : fileData
              ? <span style={{ color: "var(--green)", fontWeight: 700 }}>{fileData.rows.length} rows loaded · {fileData.headers.length} columns detected</span>
              : "Drop a CSV file or click to browse"}
        </div>
        <input type="file" accept=".csv,.txt" onChange={handleFile} disabled={parsing || !!processing} style={{ marginBottom: 8 }} />
        {fileData && !results && !parsing && (
          <div style={{ marginTop: 10 }}>
            <button className="btn btn-primary" onClick={validate}><Check size={14} />Validate Data</button>
          </div>
        )}
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>

      {/* Import progress overlay */}
      {processing && (
        <div className="card" style={{ marginBottom: 16, padding: 18, display: "flex", alignItems: "center", gap: 14, background: "var(--brand-bg)", border: "1px solid var(--brand)" }}>
          <Loader size={20} style={{ color: "var(--brand)", animation: "spin 0.8s linear infinite", flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--brand)" }}>{processing.label}</div>
            <div style={{ marginTop: 6, height: 6, background: "rgba(0,0,0,0.08)", borderRadius: 3, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${Math.round((processing.current / Math.max(processing.total, 1)) * 100)}%`, background: "var(--brand)", transition: "width 200ms ease" }} />
            </div>
            <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 4 }}>{processing.current} of {processing.total}</div>
          </div>
        </div>
      )}

      {/* Validation results */}
      {results && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
              <span style={{ fontSize: 14, fontWeight: 700 }}>Validation Results</span>
              {insertCount > 0 && (
                <span style={{ fontSize: 12, color: "var(--green)", fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
                  <PlusCircle size={13} />{insertCount} new
                </span>
              )}
              {updateCount > 0 && (
                <span style={{ fontSize: 12, color: "var(--brand)", fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
                  <ArrowUpCircle size={13} />{updateCount} update
                </span>
              )}
              {errorCount > 0 && (
                <span style={{ fontSize: 12, color: "var(--red)", fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
                  <AlertCircle size={13} />{errorCount} error{errorCount !== 1 ? "s" : ""}
                </span>
              )}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-sec btn-sm" onClick={() => { setResults(null); setFileData(null); }}>
                <RefreshCw size={13} />Reset
              </button>
              {validCount > 0 && (
                <button className="btn btn-primary btn-sm" onClick={doUpload} disabled={!!processing}>
                  {processing
                    ? <><Loader size={13} style={{ animation: "spin 0.8s linear infinite" }} />Importing…</>
                    : <><Upload size={13} />Apply {validCount} Records</>}
                </button>
              )}
            </div>
          </div>

          <div style={{ maxHeight: 420, overflow: "auto" }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th style={{ width: 40 }}>Row</th>
                  <th style={{ width: 80 }}>Action</th>
                  {fileData.headers.slice(0, 5).map(h => <th key={h}>{h}</th>)}
                  <th>Errors</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => (
                  <tr key={i} style={{ background: r._valid ? "transparent" : "var(--red-bg)" }}>
                    <td style={{ fontSize: 11, color: "var(--text3)" }}>{r._row}</td>
                    <td>
                      {r._valid ? (
                        r._mode === "update"
                          ? <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4, background: "var(--brand-bg)", color: "var(--brand)" }}>UPDATE</span>
                          : <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4, background: "#f0fdf4", color: "#16a34a" }}>NEW</span>
                      ) : (
                        <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4, background: "var(--red-bg)", color: "var(--red-t)" }}>ERROR</span>
                      )}
                    </td>
                    {fileData.headers.slice(0, 5).map(h => (
                      <td key={h} style={{ fontSize: 11, maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {r[h]?.substring(0, 40)}
                      </td>
                    ))}
                    <td style={{ fontSize: 11, color: "var(--red)" }}>
                      {r._errors.join("; ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Info cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
        <div className="card">
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text3)", marginBottom: 6 }}>FILE FORMAT</div>
          <ul style={{ fontSize: 12, color: "var(--text2)", margin: 0, paddingLeft: 16, lineHeight: 1.9 }}>
            <li>CSV (comma-separated)</li>
            <li>UTF-8 encoding recommended</li>
            <li>Row 1 must be column headers</li>
            <li>Max 5 000 rows per upload</li>
            <li>Fields with commas → wrap in quotes</li>
          </ul>
        </div>
        <div className="card">
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text3)", marginBottom: 6 }}>INSERT vs UPDATE</div>
          <ul style={{ fontSize: 12, color: "var(--text2)", margin: 0, paddingLeft: 16, lineHeight: 1.9 }}>
            <li><strong>Leave ref ID blank</strong> → new record</li>
            <li><strong>Provide ref ID</strong> → updates existing</li>
            <li>Matched fields overwrite current values</li>
            <li>Un-mapped fields are preserved</li>
            <li>Accounts: use Account No. in accountId</li>
          </ul>
        </div>
        <div className="card">
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text3)", marginBottom: 6 }}>REFERENCE IDs</div>
          <ul style={{ fontSize: 12, color: "var(--text2)", margin: 0, paddingLeft: 16, lineHeight: 1.9 }}>
            <li>Leads → <code>leadId</code> (#FL-2026-001)</li>
            <li>Customers → <code>accountNo</code> (ACC-2026-001)</li>
            <li>Contacts → <code>contactId</code> (CON-001)</li>
            <li>Collections → <code>invoiceNo</code></li>
            <li>Tickets → <code>ticketNo</code> (TKT-2026-001)</li>
            <li>Contracts → <code>contractNo</code> (CTR-2026-001)</li>
            <li>Invoices → <code>invoiceNo</code> (INV-2026-001)</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

export default BulkUpload;
