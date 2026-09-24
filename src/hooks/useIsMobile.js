// ─────────────────────────────────────────────────────────────────────────────
// useIsMobile — true on phone-width screens (iOS Safari / Android Chrome).
// ─────────────────────────────────────────────────────────────────────────────
// Layout itself is CSS (@media in styles.js). This hook is only for the few
// behaviours CSS can't express: the sidebar becomes a slide-out drawer, the
// header swaps its search box for an icon, modals stop being draggable.
// Keep MOBILE_MAX in step with the @media (max-width: 768px) block.
import { useEffect, useState } from "react";

export const MOBILE_MAX = 768;
const QUERY = `(max-width: ${MOBILE_MAX}px)`;

const read = () => typeof window !== "undefined" && !!window.matchMedia && window.matchMedia(QUERY).matches;

export default function useIsMobile() {
  const [mobile, setMobile] = useState(read);
  useEffect(() => {
    if (!window.matchMedia) return undefined;
    const mq = window.matchMedia(QUERY);
    const on = () => setMobile(mq.matches);
    on();
    // Safari < 14 only has addListener.
    if (mq.addEventListener) mq.addEventListener("change", on); else mq.addListener(on);
    return () => { if (mq.removeEventListener) mq.removeEventListener("change", on); else mq.removeListener(on); };
  }, []);
  return mobile;
}
