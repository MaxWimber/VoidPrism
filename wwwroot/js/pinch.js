/** Multi-touch pinch zoom helper for constellation / canvas. */

export function attachPinch(target, { onZoom, onPinchStart, onPinchEnd } = {}) {
  const pointers = new Map();
  let pinch = null;

  const midpoint = () => {
    const pts = [...pointers.values()];
    if (pts.length < 2) return null;
    return {
      x: (pts[0].x + pts[1].x) / 2,
      y: (pts[0].y + pts[1].y) / 2,
      dist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y),
    };
  };

  const onDown = (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    try {
      target.setPointerCapture?.(event.pointerId);
    } catch {
      /* ignore */
    }
    if (pointers.size === 2) {
      const mid = midpoint();
      if (!mid || mid.dist < 8) return;
      pinch = { startDist: mid.dist, startZ: 1, mid };
      onPinchStart?.(event);
      event.preventDefault();
    }
  };

  const onMove = (event) => {
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (!pinch || pointers.size < 2) return;
    const mid = midpoint();
    if (!mid || mid.dist < 8) return;
    const factor = mid.dist / pinch.startDist;
    onZoom?.(mid.x, mid.y, factor, pinch);
    pinch.startDist = mid.dist;
    pinch.mid = mid;
    event.preventDefault();
  };

  const onUp = (event) => {
    pointers.delete(event.pointerId);
    if (pointers.size < 2 && pinch) {
      pinch = null;
      onPinchEnd?.(event);
    }
  };

  target.addEventListener("pointerdown", onDown, { passive: false });
  target.addEventListener("pointermove", onMove, { passive: false });
  target.addEventListener("pointerup", onUp);
  target.addEventListener("pointercancel", onUp);
  target.addEventListener("lostpointercapture", onUp);

  return {
    isPinching: () => Boolean(pinch),
    pointerCount: () => pointers.size,
    clear: () => {
      pointers.clear();
      pinch = null;
    },
  };
}
