// Cursor-tracked reflection effect.
// Lightweight vanilla JS that drives two CSS variables based on the
// cursor's proximity to (a) the A33 chrome letters and (b) the Under
// Renovation pill — so the soft highlight on each only fades in when
// the cursor is actually near that element, instead of being visible
// across the whole page.
//
//   :root  --cx, --cy             eased cursor X/Y in viewport px
//   :root  --chrome-active        0..1, fades over CHROME_FADE_DIST px
//   .pill  --pmx, --pmy           cursor X/Y relative to pill bbox
//   .pill  --pill-near            0..1, fades over PILL_FADE_DIST px
//
// Values are eased toward the target every animation frame so the
// highlight has a slight follow lag (feels like a physical reflection,
// not a hard cursor follower).

const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

if (!reduceMotion) {
  init();
}

function init() {
  const root = document.documentElement;
  // .chrome itself is a full-viewport wrapper (inset:0). The actual
  // chrome image lives in .chrome-wrap with its own absolute positioning
  // — that's the bbox we want for proximity detection.
  const chromeEl = document.querySelector(".chrome .chrome-wrap");
  const pillEl = document.querySelector(".pill");

  // Proximity fade ranges (px outside element bbox where effect is
  // fully visible at 0 and fully hidden at >= these distances).
  const CHROME_FADE_DIST = 200;
  const PILL_FADE_DIST = 150;

  // Target values from latest pointer event
  let tx = window.innerWidth / 2;
  let ty = window.innerHeight / 2;
  // Eased values rendered to CSS
  let ex = tx;
  let ey = ty;
  // Smoothing factor (0 = no follow, 1 = instant)
  const POSITION_EASE = 0.18;
  const PROXIMITY_EASE = 0.12;

  let chromeActive = 0;
  let pillNear = 0;
  let rafId = null;
  let cursorOnPage = false;

  // Cache element rects — recomputed on resize/scroll
  let chromeRect = null;
  let pillRect = null;
  const refreshRects = () => {
    if (chromeEl) chromeRect = chromeEl.getBoundingClientRect();
    if (pillEl) pillRect = pillEl.getBoundingClientRect();
  };
  refreshRects();
  window.addEventListener("resize", refreshRects, { passive: true });
  window.addEventListener("scroll", refreshRects, { passive: true });

  // Initial CSS state — effects hidden until cursor enters
  root.style.setProperty("--cx", tx + "px");
  root.style.setProperty("--cy", ty + "px");
  root.style.setProperty("--chrome-active", "0");
  if (pillEl) pillEl.style.setProperty("--pill-near", "0");

  const onMove = (e) => {
    tx = e.clientX;
    ty = e.clientY;
    cursorOnPage = true;
    if (!rafId) rafId = requestAnimationFrame(loop);
  };

  const onLeave = () => {
    cursorOnPage = false;
    if (!rafId) rafId = requestAnimationFrame(loop);
  };

  document.addEventListener("pointermove", onMove, { passive: true });
  document.addEventListener("pointerleave", onLeave, { passive: true });
  document.addEventListener("pointercancel", onLeave, { passive: true });

  // Manhattan-style proximity to a rect's outer boundary.
  // Returns 0 if (x,y) is inside the rect, otherwise the Euclidean
  // distance from (x,y) to the nearest edge.
  function distOutsideRect(x, y, rect) {
    if (!rect) return Infinity;
    const dx = Math.max(rect.left - x, 0, x - rect.right);
    const dy = Math.max(rect.top - y, 0, y - rect.bottom);
    return Math.hypot(dx, dy);
  }

  function loop() {
    // Position easing
    ex += (tx - ex) * POSITION_EASE;
    ey += (ty - ey) * POSITION_EASE;
    root.style.setProperty("--cx", ex.toFixed(1) + "px");
    root.style.setProperty("--cy", ey.toFixed(1) + "px");

    // Proximity-based activation (0..1, linearly faded by distance)
    let targetChrome = 0;
    let targetPill = 0;
    if (cursorOnPage) {
      const chromeDist = distOutsideRect(ex, ey, chromeRect);
      const pillDist = distOutsideRect(ex, ey, pillRect);
      targetChrome = Math.max(0, 1 - chromeDist / CHROME_FADE_DIST);
      targetPill = Math.max(0, 1 - pillDist / PILL_FADE_DIST);
    }

    chromeActive += (targetChrome - chromeActive) * PROXIMITY_EASE;
    pillNear += (targetPill - pillNear) * PROXIMITY_EASE;
    root.style.setProperty("--chrome-active", chromeActive.toFixed(3));
    if (pillEl) pillEl.style.setProperty("--pill-near", pillNear.toFixed(3));

    // Cursor coordinates RELATIVE to each element's box, so the radial
    // gradient origin matches the cursor inside the element's coordinate
    // system. (The element-local origin is its top-left corner.)
    if (chromeEl && chromeRect) {
      chromeEl.style.setProperty("--ccx", (ex - chromeRect.left).toFixed(1) + "px");
      chromeEl.style.setProperty("--ccy", (ey - chromeRect.top).toFixed(1) + "px");
    }
    if (pillEl && pillRect) {
      pillEl.style.setProperty("--pmx", (ex - pillRect.left).toFixed(1) + "px");
      pillEl.style.setProperty("--pmy", (ey - pillRect.top).toFixed(1) + "px");
    }

    const stillEasing =
      Math.abs(tx - ex) > 0.3 ||
      Math.abs(ty - ey) > 0.3 ||
      Math.abs(targetChrome - chromeActive) > 0.003 ||
      Math.abs(targetPill - pillNear) > 0.003;
    if (stillEasing) {
      rafId = requestAnimationFrame(loop);
    } else {
      rafId = null;
    }
  }
}
