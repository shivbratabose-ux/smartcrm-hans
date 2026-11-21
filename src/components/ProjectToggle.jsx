// "Run as a project" tick-box on a deal (Pipeline) or lead (Leads).
// Deals of ₹50 lakh or more are always projects; anything smaller is one only
// when someone ticks it here (lib/projects.js).
import { Briefcase } from "lucide-react";
import { fmt } from "../utils/helpers";
import { PROJECT_MIN_LAKH, isProjectSize, linkedProject } from "../lib/projects";

export default function ProjectToggle({ kind = "opp", record, value, projects = [], onToggle }) {
  if (!record || !onToggle) return null;
  const prj = linkedProject(projects, kind, record.id);
  const always = kind === "opp" && isProjectSize(value);
  const on = always || !!prj?.selected;
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", marginBottom: 14, borderRadius: 8,
      border: `1px solid ${on ? "#99F6E4" : "var(--border)"}`, background: on ? "#F0FDFA" : "var(--s2)", cursor: always ? "default" : "pointer" }}
      title={always ? `Deals of ${fmt.lakh(PROJECT_MIN_LAKH)} or more are always run as projects` : "Adds it to the Projects screen to track delivery: phase, progress, milestones and go-live"}>
      <input type="checkbox" checked={on} disabled={always} onChange={(e) => onToggle(kind, record, e.target.checked)} style={{ width: 16, height: 16 }} />
      <Briefcase size={15} style={{ color: on ? "#0F766E" : "var(--text3)", flexShrink: 0 }} />
      <span style={{ fontSize: 12.5, fontWeight: 700, color: on ? "#0F766E" : "var(--text1)" }}>Run as a project</span>
      <span style={{ fontSize: 11.5, color: "var(--text3)" }}>
        {always ? `Always: ${fmt.lakh(PROJECT_MIN_LAKH)} or more`
          : on ? `On the Projects screen${prj?.projectNo ? ` as ${prj.projectNo}` : ""}`
          : `Tick to track its delivery on the Projects screen (deals of ${fmt.lakh(PROJECT_MIN_LAKH)} or more are added automatically)`}
      </span>
    </label>
  );
}
