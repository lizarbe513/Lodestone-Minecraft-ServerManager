// Módulo de Audio para efectos de sonido
// Usa el archivo proporcionado por el usuario (click.webm y fire.webm) y la Web Audio API con AudioBuffer para garantizar latencia cero

const CLICK_URL = 'assets/click.webm';
const FIRE_URL = 'assets/fire.webm';
const KEYBOARD_URL = 'assets/keyboard.mp3';
let audioCtx = null;
let clickBuffer = null;
let fireBuffer = null;
let keyboardBuffer = null;
let isDecoding = false;
let loadAttempted = false;

function getAudioContext() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  return audioCtx;
}

// Envoltorio compatible con callbacks para asegurar decodificación en versiones antiguas de WebKitGTK
function decodeAudio(ctx, arrayBuffer) {
  return new Promise((resolve, reject) => {
    try {
      ctx.decodeAudioData(
        arrayBuffer,
        (buffer) => resolve(buffer),
        (err) => reject(err || new Error("Error decodificando audio"))
      );
    } catch (e) {
      reject(e);
    }
  });
}

// Carga genérica de buffer
async function loadBuffer(url) {
  const ctx = getAudioContext();
  if (!ctx) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const arrayBuffer = await res.arrayBuffer();
    return await decodeAudio(ctx, arrayBuffer);
  } catch (e) {
    console.error(`Fallo cargando ${url}`, e);
    return null;
  }
}

// Carga y decodifica los archivos en búferes de memoria flotante pura
async function loadAllBuffers() {
  if (isDecoding || loadAttempted) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  
  isDecoding = true;
  loadAttempted = true;
  
  clickBuffer = await loadBuffer(CLICK_URL);
  fireBuffer = await loadBuffer(FIRE_URL);
  keyboardBuffer = await loadBuffer(KEYBOARD_URL);
  
  isDecoding = false;
}

const VOL_KEY = "mc_gui_sfx_volume";
const TYPING_VOL_KEY = "mc_gui_typing_volume";

let sfxVolume = 0.75;
let typingVolume = 0.75;

export function getSfxVolume() {
  const saved = localStorage.getItem(VOL_KEY);
  if (saved !== null) {
    const val = parseFloat(saved);
    if (!isNaN(val)) return val;
  }
  return 0.75;
}

export function setSfxVolume(vol) {
  sfxVolume = Math.max(0, Math.min(1, vol));
  localStorage.setItem(VOL_KEY, sfxVolume.toString());
}

export function getTypingVolume() {
  const saved = localStorage.getItem(TYPING_VOL_KEY);
  if (saved !== null) {
    const val = parseFloat(saved);
    if (!isNaN(val)) return val;
  }
  return 0.75;
}

export function setTypingVolume(vol) {
  typingVolume = Math.max(0, Math.min(1, vol));
  localStorage.setItem(TYPING_VOL_KEY, typingVolume.toString());
}

async function playSoundNode(buffer, duration = null, customVol = null) {
  const activeVol = customVol !== null ? customVol : getSfxVolume();
  if (activeVol <= 0) return; // Silencio total si el volumen está en 0

  const ctx = getAudioContext();
  
  if (!ctx) {
    playHtml5Fallback(activeVol);
    return;
  }

  try {
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    if (!buffer && !isDecoding && !loadAttempted) {
      await loadAllBuffers();
    }

    if (!buffer) {
      if (!duration) playHtml5Fallback(activeVol); // Fallback solo para el click normal
      return;
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const gainNode = ctx.createGain();
    const baseVol = 0.75 * activeVol;
    
    if (duration !== null) {
      // Programar un desvanecimiento suave (fade-out) ajustado a la duración del sonido
      const fadeDuration = Math.min(0.08, duration * 0.4);
      gainNode.gain.setValueAtTime(baseVol, ctx.currentTime);
      gainNode.gain.setValueAtTime(baseVol, ctx.currentTime + duration - fadeDuration);
      gainNode.gain.linearRampToValueAtTime(0.001, ctx.currentTime + duration);
      
      source.connect(gainNode);
      gainNode.connect(ctx.destination);
      source.start(ctx.currentTime, 0, duration);
    } else {
      gainNode.gain.value = baseVol;
      source.connect(gainNode);
      gainNode.connect(ctx.destination);
      source.start(0);
    }
  } catch (e) {
    console.warn("Fallo Web Audio API en este evento, usando fallback:", e);
    if (!duration) playHtml5Fallback(activeVol);
  }
}

let lastClickTime = 0;

/**
 * Reproduce el sonido de clic estándar (con debounce de 60ms para evitar doble sonido)
 */
export async function playClickSound() {
  const now = Date.now();
  if (now - lastClickTime < 60) return;
  lastClickTime = now;
  await playSoundNode(clickBuffer);
}

/**
 * Reproduce el sonido de clic + el efecto de fuego (limitado a 1 segundo)
 */
export async function playHardcoreSound() {
  playSoundNode(clickBuffer);
  playSoundNode(fireBuffer, 1.0);
}

// --- Sistema de Respaldo (Fallback) con etiquetas HTML5 en caso extremo ---
let html5Pool = [];
const POOL_SIZE = 12;
let poolInitialized = false;
let poolIndex = 0;

function initHtml5Pool() {
  if (poolInitialized) return;
  for (let i = 0; i < POOL_SIZE; i++) {
    const audio = new Audio(CLICK_URL);
    audio.volume = 0.75 * sfxVolume;
    html5Pool.push(audio);
  }
  poolInitialized = true;
}

function playHtml5Fallback() {
  try {
    initHtml5Pool();
    const audio = html5Pool[poolIndex];
    if (audio) {
      audio.volume = 0.75 * sfxVolume;
      audio.currentTime = 0;
      audio.play().catch(e => {});
      poolIndex = (poolIndex + 1) % POOL_SIZE;
    }
  } catch (e) {
    console.error("Fallo fallback:", e);
  }
}

/**
 * Inicializa el escuchador global para añadir sonido a todos los botones e interactivos
 */
export function initAudio() {
  const handleInteraction = (e) => {
    // Escuchamos en botones, inputs de texto, números, desplegables (select), textareas e interactivos
    const target = e.target.closest("button, .create-tab-btn, .tab-btn, .mc-btn-group-item, .extension-card, input, select, textarea, a, label");
    
    if (target && !target.disabled) {
      const isHardcore = target.id === 'create-hardcore' || (target.tagName === 'LABEL' && target.querySelector('#create-hardcore'));
      
      if (isHardcore) {
        const checkbox = document.getElementById('create-hardcore');
        // mousedown ocurre antes de que el checkbox cambie de estado.
        if (checkbox && !checkbox.checked) {
          playHardcoreSound();
        } else {
          playClickSound();
        }
      } else {
        playClickSound();
      }
    }
  };

  document.addEventListener("mousedown", handleInteraction, true);

  // Reproducir sonido solo en cambios reales del usuario en menús desplegables (select)
  document.addEventListener("change", (e) => {
    if (e.target && e.target.tagName === "SELECT" && e.isTrusted) {
      playClickSound();
    }
  }, true);

  // Escuchador de tecleado en casillas de entrada
  document.addEventListener("keydown", (e) => {
    const isInput = e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA");
    if (isInput && !["Shift", "Control", "Alt", "Meta", "CapsLock", "Tab"].includes(e.key)) {
      playTypingSound();
    }
  }, true);
}

// Sonido de tecleado usando el archivo spacebar-click (0.2s con desvanecimiento)
let lastKeyTime = 0;

export async function playTypingSound() {
  const now = Date.now();
  if (now - lastKeyTime < 45) return; // Debounce suave para evitar saturación
  lastKeyTime = now;
  const tVol = getTypingVolume();
  if (tVol <= 0) return;
  await playSoundNode(keyboardBuffer, 0.2, tVol);
}
