import { els } from "./dom.js";
import { globals } from "./state.js";

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
  line.textContent = text;
  els.logOutput.appendChild(line);
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

export function requestConfirm(title, message, command) {
  if (!els.confirmDialog) return;
  els.confirmTitle.textContent = title;
  els.confirmMessage.textContent = message;
  globals.pendingConfirmAction = command;
  els.confirmDialog.showModal();
}
