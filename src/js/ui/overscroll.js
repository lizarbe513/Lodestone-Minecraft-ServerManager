// Efecto de resplandor / difuminado al hacer sobre-scroll (Overscroll Edge Glow)
// Sincronizado automáticamente con el color de acentuación del tema o personalización.

const STORAGE_ENABLED_KEY = "mc_gui_overscroll_enabled";

let glowTopEl = null;
let glowBottomEl = null;
let decayTimeout = null;
let isOverscrollEnabled = true;

export function getOverscrollEnabled() {
  return localStorage.getItem(STORAGE_ENABLED_KEY) !== "false";
}

export function setOverscrollEnabled(enabled) {
  isOverscrollEnabled = !!enabled;
  localStorage.setItem(STORAGE_ENABLED_KEY, isOverscrollEnabled ? "true" : "false");
  if (!isOverscrollEnabled) {
    if (glowTopEl) {
      glowTopEl.style.opacity = "0";
      glowTopEl.style.transform = "scaleY(0)";
    }
    if (glowBottomEl) {
      glowBottomEl.style.opacity = "0";
      glowBottomEl.style.transform = "scaleY(0)";
    }
  }
}

export function initOverscrollGlow() {
  isOverscrollEnabled = getOverscrollEnabled();

  const style = document.createElement("style");
  style.id = "overscroll-glow-styles";
  style.textContent = `
    .overscroll-glow-effect-top,
    .overscroll-glow-effect-bottom {
      position: fixed;
      left: 0;
      right: 0;
      height: 28px;
      pointer-events: none;
      z-index: 99999;
      opacity: 0;
      transform: scaleY(0);
      transition: opacity 0.35s cubic-bezier(0.16, 1, 0.3, 1), transform 0.35s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .overscroll-glow-effect-top {
      top: 0;
      background: radial-gradient(ellipse at 50% 0%, var(--mc-green) 0%, transparent 100%);
      transform-origin: top center;
    }
    .overscroll-glow-effect-bottom {
      bottom: 0;
      background: radial-gradient(ellipse at 50% 100%, var(--mc-green) 0%, transparent 100%);
      transform-origin: bottom center;
    }
  `;
  document.head.appendChild(style);

  glowTopEl = document.createElement("div");
  glowTopEl.className = "overscroll-glow-effect-top";
  document.body.appendChild(glowTopEl);

  glowBottomEl = document.createElement("div");
  glowBottomEl.className = "overscroll-glow-effect-bottom";
  document.body.appendChild(glowBottomEl);

  window.addEventListener("wheel", (e) => {
    if (!isOverscrollEnabled) return;

    let target = e.target;
    let scrollable = null;

    while (target && target !== document.body && target !== document.documentElement) {
      const overflowY = window.getComputedStyle(target).overflowY;
      if ((overflowY === "auto" || overflowY === "scroll") && target.scrollHeight > target.clientHeight) {
        scrollable = target;
        break;
      }
      target = target.parentElement;
    }

    let isAtTop = false;
    let isAtBottom = false;

    if (scrollable) {
      isAtTop = scrollable.scrollTop <= 1 && e.deltaY < 0;
      isAtBottom = (scrollable.scrollTop + scrollable.clientHeight >= scrollable.scrollHeight - 2) && e.deltaY > 0;
    } else {
      const docTop = window.scrollY || document.documentElement.scrollTop || 0;
      const docHeight = document.documentElement.scrollHeight;
      const winHeight = window.innerHeight;
      isAtTop = docTop <= 1 && e.deltaY < 0;
      isAtBottom = (docTop + winHeight >= docHeight - 2) && e.deltaY > 0;
    }

    if (isAtTop || isAtBottom) {
      triggerGlow(isAtTop ? "top" : "bottom", Math.abs(e.deltaY));
    }
  }, { passive: true });
}

function triggerGlow(direction, delta) {
  if (!isOverscrollEnabled) return;
  const targetEl = direction === "top" ? glowTopEl : glowBottomEl;
  if (!targetEl) return;

  const intensity = Math.min(1, delta / 140);
  const scale = 0.4 + intensity * 0.4;

  targetEl.style.opacity = (0.12 + intensity * 0.25).toFixed(2);
  targetEl.style.transform = `scaleY(${scale.toFixed(2)})`;

  if (decayTimeout) clearTimeout(decayTimeout);
  decayTimeout = setTimeout(() => {
    if (glowTopEl) {
      glowTopEl.style.opacity = "0";
      glowTopEl.style.transform = "scaleY(0)";
    }
    if (glowBottomEl) {
      glowBottomEl.style.opacity = "0";
      glowBottomEl.style.transform = "scaleY(0)";
    }
  }, 260);
}
