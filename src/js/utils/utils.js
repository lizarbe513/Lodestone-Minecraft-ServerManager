import { els } from "../core/dom.js";
import { globals } from "../core/state.js";

export function showFeedback(message, type = "info") {
  if (!els.feedback) return;
  els.feedback.textContent = message;
  els.feedback.dataset.type = type;
}

export function normalizeError(error) {
  if (typeof error === "string") {
    return error;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return `${error}`;
}

export function normalizeMessage(message) {
  return `${message}`.replace(/\r/g, "").trimEnd();
}

export function appendLog(kind, message) {
  if (!els.logOutput) return;
  const text = normalizeMessage(message);
  if (!text) {
    return;
  }
  const line = document.createElement("div");
  line.className = `log-line log-${kind}`;
  
  let safeText = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  
  if (/Exception|WARN|ERROR|Caused by:|at /i.test(safeText)) {
      safeText = `<span style="color: #ffff55;">${safeText}</span>`;
  } else {
      const prefixMatch = safeText.match(/^(\[[0-9:]+\] \[[^\]]+\])(.*)$/);
      if (prefixMatch) {
          safeText = `<span style="color: #55ff55;">${prefixMatch[1]}</span>${prefixMatch[2]}`;
      }
  }
  
  line.innerHTML = safeText;
  els.logOutput.appendChild(line);

  while (els.logOutput.children.length > 500) {
    els.logOutput.removeChild(els.logOutput.firstChild);
  }

  els.logOutput.scrollTop = els.logOutput.scrollHeight;
}

export function clearLogs() {
  if (!els.logOutput) return;
  els.logOutput.innerHTML = "";
}

export function fileNameFromPath(filePath) {
  return filePath.split(/[\\/]/).pop() ?? "";
}

export function suggestedServerName(filePath) {
  return fileNameFromPath(filePath).replace(/\.jar$/i, "");
}

export function showLoadingOverlay(title = "Cargando...", description = "Por favor, espera un momento.") {
  const overlay = document.getElementById("loading-overlay");
  const titleEl = document.getElementById("loading-overlay-title");
  const descEl = document.getElementById("loading-overlay-desc");
  if (overlay) {
    if (titleEl) titleEl.textContent = title;
    if (descEl) descEl.textContent = description;
    overlay.showModal();
  }
}

export function hideLoadingOverlay() {
  const overlay = document.getElementById("loading-overlay");
  if (overlay) overlay.close();
}

export function requestConfirm(title, message, command) {
  if (!els.confirmDialog) return;
  els.confirmTitle.textContent = title;
  els.confirmMessage.textContent = message;
  globals.pendingConfirmAction = command;
  els.confirmDialog.showModal();
}

let currentLightboxZoom = 1.0;
let currentLightboxPanX = 0;
let currentLightboxPanY = 0;
let isDraggingLightbox = false;
let startDragX = 0;
let startDragY = 0;

export function openImageLightbox(src, title = "Vista Previa") {
  const dialog = document.querySelector("#gallery-lightbox-dialog");
  const img = document.querySelector("#lightbox-img");
  const viewport = document.querySelector("#lightbox-viewport");
  const titleEl = document.querySelector("#lightbox-title");
  const zoomLabel = document.querySelector("#lightbox-zoom-label");
  const btnZoomIn = document.querySelector("#btn-lightbox-zoom-in");
  const btnZoomOut = document.querySelector("#btn-lightbox-zoom-out");
  const btnReset = document.querySelector("#btn-lightbox-reset");
  const btnClose = document.querySelector("#btn-lightbox-close");

  if (!dialog || !img || !src) return;

  currentLightboxZoom = 1.0;
  currentLightboxPanX = 0;
  currentLightboxPanY = 0;
  isDraggingLightbox = false;

  const updateTransform = () => {
    img.style.transform = `translate(${currentLightboxPanX}px, ${currentLightboxPanY}px) scale(${currentLightboxZoom})`;
    if (zoomLabel) {
      zoomLabel.textContent = `${Math.round(currentLightboxZoom * 100)}%`;
    }
    if (viewport) {
      viewport.style.cursor = currentLightboxZoom > 1.0 ? "grab" : "default";
    }
  };

  img.src = src;
  img.style.imageRendering = "auto";
  img.style.filter = "none";
  if (titleEl) titleEl.textContent = title;
  updateTransform();
  dialog.showModal();

  const setZoom = (newZoom) => {
    currentLightboxZoom = Math.min(Math.max(Math.round(newZoom * 100) / 100, 1.0), 3.0);
    if (currentLightboxZoom === 1.0) {
      currentLightboxPanX = 0;
      currentLightboxPanY = 0;
    }
    updateTransform();
  };

  if (btnZoomIn) {
    btnZoomIn.onclick = (e) => {
      e.stopPropagation();
      setZoom(currentLightboxZoom + 0.25);
    };
  }
  if (btnZoomOut) {
    btnZoomOut.onclick = (e) => {
      e.stopPropagation();
      setZoom(currentLightboxZoom - 0.25);
    };
  }
  if (btnReset) {
    btnReset.onclick = (e) => {
      e.stopPropagation();
      currentLightboxPanX = 0;
      currentLightboxPanY = 0;
      setZoom(1.0);
    };
  }
  if (btnClose) {
    btnClose.onclick = (e) => {
      e.stopPropagation();
      dialog.close();
    };
  }

  if (viewport) {
    viewport.onwheel = (e) => {
      e.preventDefault();
      if (e.deltaY < 0) {
        setZoom(currentLightboxZoom + 0.15);
      } else {
        setZoom(currentLightboxZoom - 0.15);
      }
    };

    viewport.onmousedown = (e) => {
      if (currentLightboxZoom <= 1.0 || e.button !== 0) return;
      isDraggingLightbox = true;
      startDragX = e.clientX - currentLightboxPanX;
      startDragY = e.clientY - currentLightboxPanY;
      viewport.style.cursor = "grabbing";
      e.preventDefault();
    };

    window.onmousemove = (e) => {
      if (!isDraggingLightbox) return;
      currentLightboxPanX = e.clientX - startDragX;
      currentLightboxPanY = e.clientY - startDragY;
      updateTransform();
    };

    window.onmouseup = () => {
      if (isDraggingLightbox) {
        isDraggingLightbox = false;
        if (viewport) {
          viewport.style.cursor = currentLightboxZoom > 1.0 ? "grab" : "default";
        }
      }
    };
  }

  dialog.onclick = (e) => {
    if (e.target === dialog) dialog.close();
  };
}
