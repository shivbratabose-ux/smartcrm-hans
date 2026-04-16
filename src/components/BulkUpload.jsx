import { useState, useMemo } from "react";
import { Upload, Download, Check, AlertCircle, RefreshCw, ArrowUpCircle, PlusCircle, Info } from "lucide-react";
import { UPLOAD_TYPES } from '../data/constants';
import { uid } from '../utils/helpers';
import { Empty, PageTip } from './shared';

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
    ],
    sample: [
      "leadId,company,contactName,email,phone,product,vertical,region,source,stage,country,state,score,expectedCloseDate,estimatedValue,campaignName,assignedTo",
      "#FL-2026-001,Acme Corp,John Doe,john@acme.com,+91-98765-00001,iCAFFE,CHA,South Asia,Inside Sales,MQL,India,Maharashtra,50,2026-06-30,500000,,",
      ",Beta Logistics,Jane Roe,jane@beta.com,+91-98765-00002,WiseCargo,Forwarder,South Asia,Referral,MQL,India,Delhi,60,2026-07-15,200000,Q1 Campaign,",
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
      "hierarchyLevel","parentId","products","arrRevenue","potential","owner",
      "state","pincode","legalName","pan","gstin","cin","taxTreatment","tdsApplicable","poMandatory",
      "billingAddress","billingCity","billingState","billingPincode","billingCountry",
      "primaryContact","primaryEmail","primaryPhone",
      "billingContactName","billingContactEmail","financeContactEmail",
      "paymentTerms","creditDays","currency","billingFrequency",
      "entityType","groupCode","territory",
    ],
    // Headers match Accounts export exactly — export CSV → edit in Excel → re-upload to UPDATE
    sample: [
      "accountNo,name,type,country,city,state,pincode,address,legalName,pan,gstin,taxTreatment,website,segment,status,entityType,groupCode,paymentTerms,currency,billingFrequency,products,arrRevenue,potential,owner",
      "ACC-2026-001,Acme Airlines,Airline,India,Mumbai,Maharashtra,400069,Andheri East Mumbai 400069,Acme Airlines Pvt Ltd,AAAAA1234A,27AAAAA1234A1Z5,Domestic,acme.com,Enterprise,Active,Head Office,GRP-ACM,Net 30,INR,Annual,iCAFFE;WiseCargo,10,50,",
      "ACC-2026-002,Delta Freight,Freight Forwarder,UAE,Dubai,,,,,,,Export,betafreight.ae,Mid-Market,Active,Head Office,,Net 45,AED,Quarterly,WiseTrax,5,20,",
      ",Beta Logistics,Customs Broker,India,Delhi,Delhi,110001,,Beta Logistics Pvt Ltd,BBBBB5678B,,Domestic,beta.in,SMB,Prospect,Head Office,,Net 30,INR,Annual,iCAFFE,0,15,",
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
      "contractNo","startDate","endDate","billTerm","billType",
      "poNumber","owner","terms","notes","oppId",
      "renewalType","paymentTerms","currency","billingFrequency","invoiceGenBasis",
      "griApplicable","griPercentage","noOfUsers","noOfBranches","serviceStartDate",
      "commercialModel","autoRenewal","warrantyMonths","goLiveDate","territory",
    ],
    sample: [
      "contractNo,title,accountId,product,status,value,startDate,endDate,serviceStartDate,commercialModel,billingFrequency,paymentTerms,currency,noOfUsers,noOfBranches,renewalType,autoRenewal,griApplicable,griPercentage,goLiveDate,territory",
      "CTR-2026-001,WiseCargo License — Acme,ACC-2026-001,WiseCargo,Active,200000,2026-01-01,2026-12-31,2026-02-01,Annual SaaS,Annual,Net 30,INR,50,3,Manual,No,No,0,2026-02-15,South Asia",
      ",iCAFFE Starter — Beta,ACC-2026-002,iCAFFE,Draft,50000,2026-06-01,2027-05-31,,,Annual,Net 30,INR,10,1,Manual,No,No,0,,",
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
      "oppNo","products","probability","source","country","lob","owner",
      "hierarchyLevel","dealSize","forecastCat","currency","competitors",
      "lossReason","nextStep","decisionDate","budget","territory",
      "campaignSource","notes","createdDate",
    ],
    sample: [
      "oppNo,title,accountId,stage,value,probability,closeDate,source,country,lob,products,dealSize,forecastCat,currency,nextStep,decisionDate,owner",
      "OPP-2026-001,iCAFFE License — Acme,ACC-2026-001,Proposal,15,60,2026-06-30,Inside Sales,India,CHA,iCAFFE,Medium,Commit,INR,Send proposal,2026-05-15,",
      "OPP-2026-002,WiseCargo — Delta Freight,ACC-2026-002,Demo,25,45,2026-07-31,Referral,UAE,Freight Forwarder,WiseCargo,Large,Pipeline,USD,Schedule demo,2026-06-01,",
      ",WiseTrax Messaging — Beta,ACC-2026-003,Qualified,8,25,2026-08-31,Inside Sales,India,Airline,WiseTrax,Small,Pipeline,INR,Initial call done,,",
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
function BulkUpload({ onUpload, existingData = {} }) {
  const [type, setType]       = useState("Leads");
  const [fileData, setFileData] = useState(null);
  const [results, setResults]   = useState(null);

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
    const reader = new FileReader();
    reader.onload = (ev) => {
      setFileData(parseCSV(ev.target.result));
      setResults(null);
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

      return { ...row, _errors: errs, _valid: errs.length === 0, _mode: mode, _matchedId: matched?.id || null };
    });

    setResults(validated);
  };

  const doUpload = () => {
    if (!results) return;
    const valid = results.filter(r => r._valid);

    const records = valid.map(r => {
      const clean = { ...r };
      // Remove internal tracking fields
      delete clean._row; delete clean._errors; delete clean._valid;
      delete clean._mode; delete clean._matchedId;

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

    onUpload(type, records);
    setResults(null);
    setFileData(null);
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
      </div>

      {/* File drop zone */}
      <div className="card" style={{ marginBottom: 16, textAlign: "center", padding: 28, border: "2px dashed var(--border)" }}>
        <Upload size={30} style={{ color: "var(--text3)", marginBottom: 8 }} />
        <div style={{ fontSize: 13, marginBottom: 10 }}>
          {fileData
            ? <span style={{ color: "var(--green)", fontWeight: 700 }}>{fileData.rows.length} rows loaded · {fileData.headers.length} columns detected</span>
            : "Drop a CSV file or click to browse"}
        </div>
        <input type="file" accept=".csv,.txt" onChange={handleFile} style={{ marginBottom: 8 }} />
        {fileData && !results && (
          <div style={{ marginTop: 10 }}>
            <button className="btn btn-primary" onClick={validate}><Check size={14} />Validate Data</button>
          </div>
        )}
      </div>

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
                <button className="btn btn-primary btn-sm" onClick={doUpload}>
                  <Upload size={13} />Apply {validCount} Records
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
