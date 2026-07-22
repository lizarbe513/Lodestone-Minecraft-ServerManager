import { els } from "../core/dom.js";
import { appState } from "../core/state.js";

const MAX_POINTS = 30;
let cpuHistory = Array(MAX_POINTS).fill(0);
let ramHistory = Array(MAX_POINTS).fill(0);

export function initMetrics() {
  clearMetrics();
  
  // Redibujar si cambia el tamaño de la ventana
  window.addEventListener("resize", () => {
    redrawCharts();
  });
}

export function clearMetrics() {
  cpuHistory.fill(0);
  ramHistory.fill(0);
  redrawCharts();
}

export function updateMetrics(cpu, ramMb) {
  // Añadir al historial y desplazar
  cpuHistory.push(cpu);
  if (cpuHistory.length > MAX_POINTS) cpuHistory.shift();

  ramHistory.push(ramMb);
  if (ramHistory.length > MAX_POINTS) ramHistory.shift();

  // Actualizar valores numéricos instantáneos
  if (els.chartCpuVal) {
    els.chartCpuVal.textContent = `${cpu.toFixed(1)}%`;
  }
  if (els.chartRamVal) {
    // Mostrar en GB si es mayor a 1024 MB
    if (ramMb >= 1024) {
      els.chartRamVal.textContent = `${(ramMb / 1024).toFixed(2)} GB`;
    } else {
      els.chartRamVal.textContent = `${ramMb.toFixed(0)} MB`;
    }
  }

  redrawCharts();
}

function redrawCharts() {
  // Evitar dibujar si el control no es visible o los canvas no están en el DOM
  if (!els.pageControl || els.pageControl.hidden) return;

  if (els.chartCpu) {
    drawChart(els.chartCpu, cpuHistory, 100, "%", "#00d2ff", "rgba(0, 210, 255, 0.15)");
  }

  if (els.chartRam) {
    // Determinar límite máximo de RAM basado en la sesión activa
    let maxRam = 4096; // Valor por defecto
    if (appState.activeSession && appState.activeSession.memory_gb) {
      maxRam = appState.activeSession.memory_gb * 1024;
    } else {
      const highest = Math.max(...ramHistory);
      maxRam = Math.max(1024, highest * 1.2);
    }
    drawChart(els.chartRam, ramHistory, maxRam, " MB", "#d15eff", "rgba(209, 94, 255, 0.15)");
  }
}

function drawChart(canvas, data, maxVal, unit, strokeColor, fillColor) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  // Ajuste para pantallas Retina / Alto DPI
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const width = rect.width;
  const height = rect.height;

  // Redimensionar el buffer interno del Canvas si difiere del CSS
  if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
    canvas.width = width * dpr;
    canvas.height = height * dpr;
  }

  ctx.resetTransform();
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, width, height);

  const paddingLeft = 45;
  const paddingRight = 10;
  const paddingTop = 15;
  const paddingBottom = 15;
  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  if (chartWidth <= 0 || chartHeight <= 0) return;

  // 1. Dibujar rejilla horizontal y etiquetas del eje Y
  ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
  ctx.lineWidth = 1;
  ctx.fillStyle = "rgba(174, 185, 200, 0.6)"; // Text color
  ctx.font = "10px Inter, sans-serif";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";

  const gridLines = 4;
  for (let i = 0; i <= gridLines; i++) {
    const val = (maxVal / gridLines) * i;
    const y = paddingTop + chartHeight - (chartHeight / gridLines) * i;

    // Dibujar línea de guía
    ctx.beginPath();
    ctx.moveTo(paddingLeft, y);
    ctx.lineTo(width - paddingRight, y);
    ctx.stroke();

    // Etiqueta del valor de Y
    let label = "";
    if (unit === " MB" && val >= 1024) {
      label = `${(val / 1024).toFixed(1)} GB`;
    } else {
      label = `${val.toFixed(0)}${unit}`;
    }
    ctx.fillText(label, paddingLeft - 8, y);
  }

  // 2. Dibujar línea y relleno de área
  if (data.length === 0) return;

  const points = [];
  const stepX = chartWidth / (MAX_POINTS - 1);

  for (let i = 0; i < data.length; i++) {
    const val = Math.min(data[i], maxVal);
    const x = paddingLeft + i * stepX;
    const y = paddingTop + chartHeight - (val / maxVal) * chartHeight;
    points.push({ x, y });
  }

  if (points.length < 2) return;

  // Relleno de área inferior (gradiente transparente)
  ctx.beginPath();
  ctx.moveTo(points[0].x, paddingTop + chartHeight);
  ctx.lineTo(points[0].x, points[0].y);
  
  for (let i = 0; i < points.length - 1; i++) {
    const xc = (points[i].x + points[i + 1].x) / 2;
    const yc = (points[i].y + points[i + 1].y) / 2;
    ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
  }
  ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
  ctx.lineTo(points[points.length - 1].x, paddingTop + chartHeight);
  ctx.closePath();

  const grad = ctx.createLinearGradient(0, paddingTop, 0, paddingTop + chartHeight);
  grad.addColorStop(0, fillColor);
  grad.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = grad;
  ctx.fill();

  // Dibujar la línea del trazo (Stroke)
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  
  for (let i = 0; i < points.length - 1; i++) {
    const xc = (points[i].x + points[i + 1].x) / 2;
    const yc = (points[i].y + points[i + 1].y) / 2;
    ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
  }
  ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);

  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = 2.5;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // Efecto resplandor (Glow)
  ctx.shadowColor = strokeColor;
  ctx.shadowBlur = 5;
  ctx.stroke();

  // Desactivar sombras
  ctx.shadowBlur = 0;
}
