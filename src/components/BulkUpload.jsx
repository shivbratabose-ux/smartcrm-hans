import { useState } from "react";
import { Upload, Download, FileText, Check, AlertCircle, X, RefreshCw } from "lucide-react";
import { UPLOAD_TYPES } from '../data/constants';
import { uid } from '../utils/helpers';
import { Empty, Modal, PageTip } from './shared';

const SCHEMAS = {
  Leads: {
    mandatory: ["company","contact","email","product","vertical","source","stage"],
    optional: ["phone","region","assignedTo","notes","nextCall","score"],
    sample: "company,contact,email,phone,product,vertical,region,source,stage,assignedTo,notes,nextCall,score\nAcme Corp,John Doe,john@acme.com,+91-98765-00001,iCAFFE,CHA,South Asia,Direct Sales,MQL,u1,Initial inquiry,2026-04-01,50",
    uniqueKey: "email",
    validate: (row) => { const errs=[]; if(!row.company) errs.push("Company required"); if(!row.contact) errs.push("Contact required"); if(!row.email) errs.push("Email required"); return errs; },
  },
  Customers: {
    mandatory: ["name","type","country","status"],
    optional: ["city","website","segment","products","owner","arrRevenue","potential"],
    sample: "name,type,country,city,website,segment,products,status,owner,arrRevenue,potential\nAcme Airlines,Airline,India,Mumbai,acme.com,Enterprise,WiseCargo;WiseTrax,Active,u1,10,50",
    uniqueKey: "name",
    validate: (row) => { const errs=[]; if(!row.name) errs.push("Name required"); if(!row.type) errs.push("Type required"); if(!row.country) errs.push("Country required"); return errs; },
  },
  Contacts: {
    mandatory: ["name","email","accountId","role"],
    optional: ["phone","title","department","disposition"],
    sample: "name,email,phone,accountId,role,title,department,disposition\nJane Smith,jane@acme.com,+91-98765-00002,a1,Decision Maker/HOD,VP Operations,Operations,Favourable",
    uniqueKey: "email",
    validate: (row) => { const errs=[]; if(!row.name) errs.push("Name required"); if(!row.email) errs.push("Email required"); return errs; },
  },
  Collections: {
    mandatory: ["invoiceNo","accountId","invoiceDate","dueDate","billedAmount"],
    optional: ["collectedAmount","paymentMode","paymentDate","remarks","owner","status"],
    sample: "invoiceNo,accountId,invoiceDate,dueDate,billedAmount,collectedAmount,paymentMode,paymentDate,remarks,owner,status\nINV-2026-100,a1,2026-04-01,2026-05-01,5,0,,,,u1,Current",
    uniqueKey: "invoiceNo",
    validate: (row) => { const errs=[]; if(!row.invoiceNo) errs.push("Invoice # required"); if(!row.accountId) errs.push("Account ID required"); if(!row.billedAmount) errs.push("Billed amount required"); return errs; },
  },
  "Support Tickets": {
    mandatory: ["title","accountId","product","priority"],
    optional: ["type","description","assigned","category","subCategory","sla"],
    sample: "title,accountId,product,type,priority,description,assigned,category,subCategory,sla\nLogin issue on portal,a1,WiseCargo,Bug / Glitch,High,Users unable to login since morning,u8,sc1,Login / Access,2026-04-02",
    uniqueKey: "title",
    validate: (row) => { const errs=[]; if(!row.title) errs.push("Title required"); if(!row.accountId) errs.push("Account ID required"); return errs; },
  },
  Contracts: {
    mandatory: ["title","accountId","product","status","value"],
    optional: ["startDate","endDate","billTerm","billType","poNumber","owner","terms"],
    sample: "title,accountId,product,status,value,startDate,endDate,billTerm,billType,poNumber,owner,terms\nWiseCargo License,a1,WiseCargo,Active,20,2026-01-01,2026-12-31,Yearly,Renewals,PO-2026-001,u1,Annual licensing",
    uniqueKey: "title",
    validate: (row) => { const errs=[]; if(!row.title) errs.push("Title required"); if(!row.accountId) errs.push("Account ID required"); if(!row.value) errs.push("Value required"); return errs; },
  },
};

function parseCSVLine(line) {
  const vals = [];
  let cur = "", inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i+1] === '"') { cur += '"'; i++; }
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

function BulkUpload({ onUpload }) {
  const [type, setType] = useState("Leads");
  const [fileData, setFileData] = useState(null);
  const [results, setResults] = useState(null);
  const [preview, setPreview] = useState(false);

  const schema = SCHEMAS[type];

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target.result;
      const parsed = parseCSV(text);
      setFileData(parsed);
      setResults(null);
    };
    reader.readAsText(file);
  };

  const validate = () => {
    if (!fileData || !fileData.rows.length) return;
    const validated = fileData.rows.map(row => {
      const errs = schema.validate(row);
      // Check mandatory fields
      schema.mandatory.forEach(f => { if (!row[f]?.trim()) errs.push(`${f} is required`); });
      return { ...row, _errors: errs, _valid: errs.length === 0 };
    });
    // Duplicate check
    const seen = new Set();
    validated.forEach(row => {
      const key = row[schema.uniqueKey];
      if (key && seen.has(key.toLowerCase())) row._errors.push(`Duplicate ${schema.uniqueKey}: ${key}`);
      if (key) seen.add(key.toLowerCase());
    });
    setResults(validated);
  };

  const doUpload = () => {
    if (!results) return;
    const valid = results.filter(r => r._valid);
    const records = valid.map(r => {
      const clean = { ...r };
      delete clean._row; delete clean._errors; delete clean._valid;
      clean.id = `bulk_${uid()}`;
      return clean;
    });
    onUpload(type, records);
    setResults(null); setFileData(null);
  };

  const downloadSample = () => {
    const blob = new Blob(["\uFEFF" + schema.sample], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = `sample_${type.toLowerCase().replace(/\s+/g, "_")}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  const validCount = results ? results.filter(r => r._valid).length : 0;
  const errorCount = results ? results.filter(r => !r._valid).length : 0;

  return (
    <div>
      <PageTip
        id="bulkupload-tip-v1"
        title="Bulk Upload tip:"
        text="Download the template first to get the exact column headers. Save your data as CSV (not XLSX). If any field contains a comma, wrap it in double-quotes. Existing records matched by email or company name will be linked — not duplicated."
      />
      <div className="pg-head">
        <div><div className="pg-title">Bulk Upload</div>
          <div className="pg-sub">Import data from CSV files into CRM modules</div></div>
      </div>

      {/* Upload Type Selection */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text3)", marginBottom: 10 }}>SELECT UPLOAD TYPE</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {UPLOAD_TYPES.map(t => (
            <button key={t} className={`btn btn-sm ${type === t ? "btn-primary" : "btn-sec"}`} onClick={() => { setType(t); setFileData(null); setResults(null); }}>{t}</button>
          ))}
        </div>
      </div>

      {/* Schema Info */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>{type} – Upload Requirements</div>
          <button className="btn btn-sec btn-sm" onClick={downloadSample}><Download size={13} />Download Sample CSV</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--red)", marginBottom: 4 }}>MANDATORY FIELDS</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {schema.mandatory.map(f => <span key={f} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, background: "var(--red-bg)", color: "var(--red-t)", fontWeight: 600 }}>{f}</span>)}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text3)", marginBottom: 4 }}>OPTIONAL FIELDS</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {schema.optional.map(f => <span key={f} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, background: "var(--s3)", color: "var(--text2)" }}>{f}</span>)}
            </div>
          </div>
        </div>
        <div style={{ marginTop: 8, fontSize: 11, color: "var(--text3)" }}>
          <strong>Unique Key:</strong> {schema.uniqueKey} (used for duplicate detection) · <strong>Format:</strong> CSV with UTF-8 encoding
        </div>
      </div>

      {/* File Upload */}
      <div className="card" style={{ marginBottom: 16, textAlign: "center", padding: 30, border: "2px dashed var(--border)" }}>
        <Upload size={32} style={{ color: "var(--text3)", marginBottom: 8 }} />
        <div style={{ fontSize: 13, marginBottom: 8 }}>
          {fileData ? <span style={{ color: "var(--green)", fontWeight: 700 }}>{fileData.rows.length} rows loaded · {fileData.headers.length} columns</span> : "Drop CSV file or click to browse"}
        </div>
        <input type="file" accept=".csv,.txt" onChange={handleFile} style={{ marginBottom: 8 }} />
        {fileData && !results && (
          <div style={{ marginTop: 12 }}>
            <button className="btn btn-primary" onClick={validate}><Check size={14} />Validate Data</button>
          </div>
        )}
      </div>

      {/* Validation Results */}
      {results && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div>
              <span style={{ fontSize: 14, fontWeight: 700 }}>Validation Results</span>
              <span style={{ marginLeft: 12, fontSize: 12, color: "var(--green)", fontWeight: 600 }}>{validCount} valid</span>
              {errorCount > 0 && <span style={{ marginLeft: 8, fontSize: 12, color: "var(--red)", fontWeight: 600 }}>{errorCount} errors</span>}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-sec btn-sm" onClick={() => { setResults(null); setFileData(null); }}><RefreshCw size={13} />Reset</button>
              {validCount > 0 && <button className="btn btn-primary btn-sm" onClick={doUpload}><Upload size={13} />Upload {validCount} Records</button>}
            </div>
          </div>
          <div style={{ maxHeight: 400, overflow: "auto" }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Row</th>
                  <th>Status</th>
                  {fileData.headers.slice(0, 5).map(h => <th key={h}>{h}</th>)}
                  <th>Errors</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => (
                  <tr key={i} style={{ background: r._valid ? "transparent" : "var(--red-bg)" }}>
                    <td style={{ fontSize: 12 }}>{r._row}</td>
                    <td>{r._valid ? <Check size={14} style={{ color: "var(--green)" }} /> : <AlertCircle size={14} style={{ color: "var(--red)" }} />}</td>
                    {fileData.headers.slice(0, 5).map(h => <td key={h} style={{ fontSize: 11 }}>{r[h]?.substring(0, 30)}</td>)}
                    <td style={{ fontSize: 11, color: "var(--red)" }}>{r._errors.join("; ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Info Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
        <div className="card">
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text3)", marginBottom: 6 }}>FILE FORMAT</div>
          <ul style={{ fontSize: 12, color: "var(--text2)", margin: 0, paddingLeft: 16, lineHeight: 1.8 }}>
            <li>CSV or TXT (comma-separated)</li>
            <li>UTF-8 encoding (with BOM)</li>
            <li>First row must be column headers</li>
            <li>Max 5000 rows per upload</li>
          </ul>
        </div>
        <div className="card">
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text3)", marginBottom: 6 }}>DUPLICATE HANDLING</div>
          <ul style={{ fontSize: 12, color: "var(--text2)", margin: 0, paddingLeft: 16, lineHeight: 1.8 }}>
            <li>Checked against unique key field</li>
            <li>Duplicates flagged as errors</li>
            <li>Existing records not overwritten</li>
            <li>Review errors before upload</li>
          </ul>
        </div>
        <div className="card">
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text3)", marginBottom: 6 }}>AFTER UPLOAD</div>
          <ul style={{ fontSize: 12, color: "var(--text2)", margin: 0, paddingLeft: 16, lineHeight: 1.8 }}>
            <li>Records added to CRM immediately</li>
            <li>Available in respective modules</li>
            <li>Error log available for review</li>
            <li>Can re-upload corrected rows</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

export default BulkUpload;
