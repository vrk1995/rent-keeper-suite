import { useEffect } from "react";

const EDGE_ZONE_PX = 24;
const SWIPE_THRESHOLD_PX = 60;

/**
 * Mimics a native "swipe from the screen edge to dismiss" gesture. A touch that starts
 * within the left edge zone and moves predominantly rightward past the threshold dispatches
 * an Escape keydown — every Radix Dialog/AlertDialog/Sheet in the app already treats Escape
 * as "close", so this closes whatever's currently open (innermost first) without wiring
 * each one individually.
 */
export const useEdgeSwipeToClose = () => {
  useEffect(() => {
    let startX = 0;
    let startY = 0;
    let tracking = false;

    const onTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (!touch) return;
      tracking = touch.clientX <= EDGE_ZONE_PX;
      startX = touch.clientX;
      startY = touch.clientY;
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (!tracking) return;
      tracking = false;
      const touch = e.changedTouches[0];
      if (!touch) return;
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;
      if (dx > SWIPE_THRESHOLD_PX && Math.abs(dx) > Math.abs(dy) * 2) {
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      }
    };

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchend", onTouchEnd, { passive: true });

    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchend", onTouchEnd);
    };
  }, []);
};
