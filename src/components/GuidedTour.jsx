import { useState, useEffect, useLayoutEffect, useRef, useCallback } from "react";
import { X, ArrowRight, ArrowLeft, Check } from "lucide-react";

/**
 * GuidedTour — lightweight coach-mark / spotlight tour.
 * ─────────────────────────────────────────────────────────────────────
 * Anchor targets with `data-tour="some-key"` on any element, then pass a
 * `steps` array of { target, title, body, placement } where `target`
 * matches the data-tour key. The tour dims the page, cuts a spotlight
 * over the current target, and floats an arrow-tooltip beside it with
 * Back / Next / Done controls.
 *
 * Steps whose target isn't currently in the DOM are skipped automatically
 * (e.g. a button that only appears after a filter) so the tour never
 * points at nothing.
 *
 * Usage:
 *   <GuidedTour steps={QUOTE_TOUR} open={showTour} onClose={()=>setShowTour(false)} />
 *
 * Persist "seen" state with the `storageKey` prop — the tour then
 * auto-runs once per browser and never nags again.
 */
export default function GuidedTour({ steps, open, onClose, storageKey }) {
  const [idx, setIdx] = useState(0);
  const [rect, setRect] = useState(null);      // spotlight rect of the current target
  const [ready, setReady] = useState(false);
  const cardRef = useRef(null);

  // Resolve the current step's target rect. Returns null if the element
  // isn't in the DOM (caller then advances past it).
  const measure = useCallback(() => {
    const step = steps[idx];
    if (!step) return null;
    const el = document.querySelector(`[data-tour="${step.target}"]`);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    // Ignore hidden/zero-size elements (display:none anchors)
    if (r.width === 0 && r.height === 0) return null;
    return { top: r.top, left: r.left, width: r.width, height: r.height };
  }, [steps, idx]);

  // Recompute on step change, scroll, resize.
  useLayoutEffect(() => {
    if (!open) return;
    let raf;
    const update = () => {
      const r = measure();
      if (r) {
        setRect(r);
        setReady(true);
      } else {
        // Target missing — skip forward to the next resolvable step.
        setReady(false);
        setIdx(prev => {
          // find next step index that has a live target
          for (let i = prev + 1; i < steps.length; i++) {
            const el = document.querySelector(`[data-tour="${steps[i].target}"]`);
            if (el) return i;
          }
          return prev; // none left — stay; effect below will close
        });
      }
    };
    // Ensure the target is scrolled into view first
    const step = steps[idx];
    const el = step && document.querySelector(`[data-tour="${step.target}"]`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
    raf = requestAnimationFrame(() => setTimeout(update, 220));
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, idx, measure, steps]);

  // If we ran off the end while skipping missing targets, close out.
  useEffect(() => {
    if (open && ready && idx >= steps.length) finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, open, ready]);

  const finish = useCallback(() => {
    if (storageKey) {
      try { localStorage.setItem(storageKey, "1"); } catch { /* ignore */ }
    }
    setIdx(0);
    setReady(false);
    onClose?.();
  }, [onClose, storageKey]);

  // Keyboard: Esc closes, arrows navigate.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") finish();
      else if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") back();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, idx, ready]);

  if (!open || !ready || !rect) return null;
  const step = steps[idx];
  const isLast = idx === steps.length - 1;
  const isFirst = idx === 0;

  const next = () => { if (isLast) finish(); else setIdx(i => Math.min(i + 1, steps.length - 1)); };
  function back() { if (!isFirst) setIdx(i => Math.max(i - 1, 0)); }

  // ── Tooltip placement ──
  const PAD = 10;          // spotlight padding around the target
  const GAP = 16;          // gap between spotlight and card
  const CARD_W = 320;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const spot = { top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 };

  // Choose placement: prefer the step's hint, else auto by available space.
  let placement = step.placement;
  if (!placement) {
    if (spot.top > 220) placement = "top";
    else if (vh - (spot.top + spot.height) > 220) placement = "bottom";
    else if (spot.left > CARD_W + GAP) placement = "left";
    else placement = "right";
  }

  const cardStyle = { position: "fixed", width: CARD_W, zIndex: 100002 };
  let arrow = {};
  if (placement === "top") {
    cardStyle.top = spot.top - GAP; cardStyle.left = Math.min(Math.max(spot.left + spot.width / 2 - CARD_W / 2, 12), vw - CARD_W - 12); cardStyle.transform = "translateY(-100%)";
    arrow = { bottom: -7, left: Math.min(Math.max(spot.left + spot.width / 2 - (cardStyle.left), 24), CARD_W - 24), borderTop: "1px solid var(--border)", borderLeft: "1px solid var(--border)", transform: "rotate(225deg)" };
  } else if (placement === "bottom") {
    cardStyle.top = spot.top + spot.height + GAP; cardStyle.left = Math.min(Math.max(spot.left + spot.width / 2 - CARD_W / 2, 12), vw - CARD_W - 12);
    arrow = { top: -7, left: Math.min(Math.max(spot.left + spot.width / 2 - (cardStyle.left), 24), CARD_W - 24), borderTop: "1px solid var(--border)", borderLeft: "1px solid var(--border)", transform: "rotate(45deg)" };
  } else if (placement === "left") {
    cardStyle.top = Math.min(Math.max(spot.top + spot.height / 2 - 80, 12), vh - 200); cardStyle.left = spot.left - GAP; cardStyle.transform = "translateX(-100%)";
    arrow = { right: -7, top: 28, borderTop: "1px solid var(--border)", borderRight: "1px solid var(--border)", transform: "rotate(45deg)" };
  } else {
    cardStyle.top = Math.min(Math.max(spot.top + spot.height / 2 - 80, 12), vh - 200); cardStyle.left = spot.left + spot.width + GAP;
    arrow = { left: -7, top: 28, borderBottom: "1px solid var(--border)", borderLeft: "1px solid var(--border)", transform: "rotate(45deg)" };
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100000 }}>
      {/* Dimmer built from 4 rects around the spotlight so the target stays
          fully clickable + bright (a single box-shadow cutout would also
          work but blocks pointer events over the hole on some browsers). */}
      <div onClick={finish} style={{ position: "fixed", inset: 0, background: "transparent", zIndex: 100000 }}/>
      <div style={{ position: "fixed", top: 0, left: 0, right: 0, height: Math.max(spot.top, 0), background: "rgba(15,23,42,0.55)", zIndex: 100001, pointerEvents: "none" }}/>
      <div style={{ position: "fixed", top: spot.top + spot.height, left: 0, right: 0, bottom: 0, background: "rgba(15,23,42,0.55)", zIndex: 100001, pointerEvents: "none" }}/>
      <div style={{ position: "fixed", top: spot.top, left: 0, width: Math.max(spot.left, 0), height: spot.height, background: "rgba(15,23,42,0.55)", zIndex: 100001, pointerEvents: "none" }}/>
      <div style={{ position: "fixed", top: spot.top, left: spot.left + spot.width, right: 0, height: spot.height, background: "rgba(15,23,42,0.55)", zIndex: 100001, pointerEvents: "none" }}/>

      {/* Spotlight ring */}
      <div style={{ position: "fixed", top: spot.top, left: spot.left, width: spot.width, height: spot.height, border: "2px solid var(--brand)", borderRadius: 10, boxShadow: "0 0 0 4px rgba(15,118,110,0.25)", zIndex: 100001, pointerEvents: "none" }}/>

      {/* Tooltip card */}
      <div ref={cardRef} style={cardStyle}>
        <div style={{ position: "relative", background: "#fff", border: "1px solid var(--border)", borderRadius: 12, boxShadow: "0 18px 44px rgba(0,0,0,0.22)", padding: "16px 18px" }}>
          <div style={{ position: "absolute", width: 12, height: 12, background: "#fff", ...arrow }}/>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--brand)", letterSpacing: "0.5px" }}>
              STEP {idx + 1} OF {steps.length}
            </span>
            <button onClick={finish} title="Close tour" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text3)", padding: 2, display: "flex" }}>
              <X size={16}/>
            </button>
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", marginBottom: 6 }}>{step.title}</div>
          <div style={{ fontSize: 13, color: "var(--text2)", lineHeight: 1.55, marginBottom: 14 }}>{step.body}</div>

          {/* progress dots */}
          <div style={{ display: "flex", gap: 5, marginBottom: 14 }}>
            {steps.map((_, i) => (
              <span key={i} style={{ width: i === idx ? 18 : 6, height: 6, borderRadius: 3, background: i === idx ? "var(--brand)" : "var(--border)", transition: "width 0.2s" }}/>
            ))}
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <button onClick={finish} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12.5, color: "var(--text3)", fontWeight: 600 }}>
              Skip tour
            </button>
            <div style={{ display: "flex", gap: 8 }}>
              {!isFirst && (
                <button onClick={back} className="btn btn-sec" style={{ padding: "7px 12px", fontSize: 12.5 }}>
                  <ArrowLeft size={13}/>Back
                </button>
              )}
              <button onClick={next} className="btn btn-primary" style={{ padding: "7px 14px", fontSize: 12.5 }}>
                {isLast ? <><Check size={13}/>Got it</> : <>Next<ArrowRight size={13}/></>}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
