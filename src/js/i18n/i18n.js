import { AVAILABLE_LANGUAGES } from './locales/index.js';

export const DEFAULT_LANGUAGE = 'en';
export const FALLBACK_LANGUAGE = 'en';

// Map of all available languages
const locales = {};
AVAILABLE_LANGUAGES.forEach(lang => {
  locales[lang.code] = lang.data;
});

const listeners = new Set();

let currentLang = localStorage.getItem('app_language') || DEFAULT_LANGUAGE;
// Ensure the saved lang actually exists
if (!locales[currentLang]) {
    currentLang = DEFAULT_LANGUAGE;
}

export function t(key, params = {}) {
  // 1. Idioma activo
  let text = locales[currentLang]?.[key];
  
  // 2. Fallback
  if (text === undefined && currentLang !== FALLBACK_LANGUAGE) {
    text = locales[FALLBACK_LANGUAGE]?.[key];
  }
  
  // 3. Clave literal si no existe
  if (text === undefined) {
    console.warn(`[i18n] Missing translation key: "${key}"`);
    text = key;
  }
  
  // Interpolación
  for (const [paramKey, paramValue] of Object.entries(params)) {
    text = text.replace(new RegExp(`\\{${paramKey}\\}`, 'g'), paramValue);
  }
  
  return text;
}

export function setLanguage(lang) {
  if (!locales[lang]) return;
  currentLang = lang;
  localStorage.setItem('app_language', lang);
  document.documentElement.lang = lang;
  translateDOM();
  listeners.forEach(cb => {
    try {
      cb(lang);
    } catch (e) {
      console.error('[i18n] Error in language change listener:', e);
    }
  });
}

export function getLanguage() {
  return currentLang;
}

export function onLanguageChange(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function populateLanguageSelector(selectElement) {
  if (!selectElement) return;
  selectElement.innerHTML = AVAILABLE_LANGUAGES.map(lang => `
    <option value="${lang.code}">${lang.label}</option>
  `).join('');
  selectElement.value = getLanguage();
}

export function translateDOM(root = document) {
  // Text content
  root.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (key) el.textContent = t(key);
  });
  
  // Placeholders
  root.querySelectorAll('[data-i18n-ph]').forEach(el => {
    const key = el.getAttribute('data-i18n-ph');
    if (key) el.placeholder = t(key);
  });

  // Titles / Tooltips
  root.querySelectorAll('[data-i18n-title]').forEach(el => {
    const key = el.getAttribute('data-i18n-title');
    if (key) el.title = t(key);
  });

  // Aria labels
  root.querySelectorAll('[data-i18n-aria]').forEach(el => {
    const key = el.getAttribute('data-i18n-aria');
    if (key) el.setAttribute('aria-label', t(key));
  });
}
