// Módulo de Audio para efectos de sonido
// Usa el archivo proporcionado por el usuario (click.webm y fire.webm) y la Web Audio API con AudioBuffer para garantizar latencia cero

const CLICK_URL = 'assets/click.webm';
const FIRE_URL = 'assets/fire.webm';
let audioCtx = null;
let clickBuffer = null;
let fireBuffer = null;
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
  
  isDecoding = false;
}

async function playSoundNode(buffer, duration = null) {
  const ctx = getAudioContext();
  
  if (!ctx) {
    playHtml5Fallback();
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
      if (!duration) playHtml5Fallback(); // Fallback solo para el click normal
      return;
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const gainNode = ctx.createGain();
    
    if (duration !== null) {
      // Programar un desvanecimiento suave (fade-out) en los últimos 0.3 segundos
      const fadeDuration = 0.3;
      gainNode.gain.setValueAtTime(0.75, ctx.currentTime);
      gainNode.gain.setValueAtTime(0.75, ctx.currentTime + duration - fadeDuration);
      gainNode.gain.linearRampToValueAtTime(0.001, ctx.currentTime + duration);
      
      source.connect(gainNode);
      gainNode.connect(ctx.destination);
      source.start(0, 0, duration);
    } else {
      gainNode.gain.value = 0.75;
      source.connect(gainNode);
      gainNode.connect(ctx.destination);
      source.start(0);
    }
  } catch (e) {
    console.warn("Fallo Web Audio API en este evento, usando fallback:", e);
    if (!duration) playHtml5Fallback();
  }
}

/**
 * Reproduce el sonido de clic estándar
 */
export async function playClickSound() {
  await playSoundNode(clickBuffer);
}

/**
 * Reproduce el sonido de clic + el efecto de fuego (limitado a 1 segundo)
 */
export async function playHardcoreSound() {
  // Disparamos ambos de forma concurrente
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
    audio.volume = 0.75;
    html5Pool.push(audio);
  }
  poolInitialized = true;
}

function playHtml5Fallback() {
  try {
    initHtml5Pool();
    const audio = html5Pool[poolIndex];
    if (audio) {
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
    // Escuchamos en botones e inputs, y también en <label> para el checkbox de hardcore
    const target = e.target.closest("button, .create-tab-btn, .tab-btn, .mc-btn-group-item, .extension-card, input[type='checkbox'], input[type='radio'], a, label");
    
    if (target && !target.disabled) {
      const isHardcore = target.id === 'create-hardcore' || (target.tagName === 'LABEL' && target.querySelector('#create-hardcore'));
      
      if (isHardcore) {
        const checkbox = document.getElementById('create-hardcore');
        // mousedown ocurre antes de que el checkbox cambie de estado.
        // Si no está chequeado actualmente, significa que el usuario lo está activando.
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
}
