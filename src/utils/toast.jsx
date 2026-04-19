// ─── Lightweight toast system ────────────────────────────────────────────────
// Event-bus pattern: any module can call `notify(...)` without importing
// React context. A single <ToastContainer/> mounted at the app root listens
// for the CustomEvent and renders the stack.
//
// Usage:
//   import { notify } from "./utils/toast";
//   notify.error("Couldn't save changes");
//   notify.success("Lead created");
//   notify.info("Importing 200 rows…");

import { useEffect, useState } from "react";
import { CheckCircle, AlertCircle, Info, X } from "lucide-react";

const EVT = "smartcrm:toast";

const push = (kind, message, opts = {}) => {
  if (typeof window === "undefined") return;
  const detail = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    kind, // "success" | "error" | "info"
    message: String(message ?? ""),
    duration: opts.duration ?? (kind === "error" ? 6000 : 3500),
  };
  window.dispatchEvent(new CustomEvent(EVT, { detail }));
};

export const notify = {
  success: (msg, opts) => push("success", msg, opts),
  error:   (msg, opts) => push("error",   msg, opts),
  info:    (msg, opts) => push("info",    msg, opts),
};

const KIND_STYLE = {
  success: { bg: "#ecfdf5", fg: "#065f46", border: "#10b981", Icon: CheckCircle },
  error:   { bg: "#fef2f2", fg: "#991b1b", border: "#ef4444", Icon: AlertCircle },
  info:    { bg: "#eff6ff", fg: "#1e40af", border: "#3b82f6", Icon: Info },
};

export function ToastContainer() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    const onToast = (e) => {
      const t = e.detail;
      setToasts(prev => [...prev, t]);
      if (t.duration > 0) {
        setTimeout(() => {
          setToasts(prev => prev.filter(x => x.id !== t.id));
        }, t.duration);
      }
    };
    window.addEventListener(EVT, onToast);
    return () => window.removeEventListener(EVT, onToast);
  }, []);

  const dismiss = (id) => setToasts(p => p.filter(x => x.id !== id));

  if (toasts.length === 0) return null;

  return (
    <div
      role="region"
      aria-label="Notifications"
      style={{
        position: "fixed",
        top: 16,
        right: 16,
        zIndex: 10000,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        maxWidth: 360,
        pointerEvents: "none",
      }}
    >
      {toasts.map(t => {
        const s = KIND_STYLE[t.kind] || KIND_STYLE.info;
        const Icon = s.Icon;
        return (
          <div
            key={t.id}
            role={t.kind === "error" ? "alert" : "status"}
            style={{
              pointerEvents: "auto",
              display: "flex",
              alignItems: "flex-start",
              gap: 10,
              background: s.bg,
              color: s.fg,
              borderLeft: `4px solid ${s.border}`,
              padding: "10px 12px",
              borderRadius: 6,
              boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
              fontSize: 13,
              fontWeight: 500,
              fontFamily: "'DM Sans', sans-serif",
              animation: "scrm-toast-in 180ms ease-out",
            }}
          >
            <Icon size={16} style={{ flexShrink: 0, marginTop: 1 }} />
            <span style={{ flex: 1, lineHeight: 1.4 }}>{t.message}</span>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss notification"
              style={{
                background: "transparent",
                border: 0,
                cursor: "pointer",
                color: s.fg,
                opacity: 0.7,
                padding: 0,
                display: "flex",
              }}
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
      <style>{`@keyframes scrm-toast-in { from { transform: translateX(20px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }`}</style>
    </div>
  );
}
