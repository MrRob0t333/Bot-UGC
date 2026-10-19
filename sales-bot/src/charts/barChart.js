"use strict";

/**
 * Gráfico de barras em SVG (sem canvas), convertido para PNG com @resvg/resvg-js.
 * Estilo "Few / Storytelling with Data": uma cor só, grade leve, sem enfeite,
 * título com a conclusão (total) e linha de média destacada discretamente.
 */

const { formatNumber } = require("../format");

const COLORS = {
  background: "#FFFFFF",
  bar: "#2F6FDE",
  barMuted: "#C9D6EE",
  text: "#1F2328",
  muted: "#6E7781",
  grid: "#E6E8EB",
  average: "#D29922",
};

function escapeXml(text) {
  return String(text ?? "").replace(/[<>&"']/g, char => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" }[char]));
}

function niceMax(value) {
  if (value <= 0) return 10;
  const exponent = 10 ** Math.floor(Math.log10(value));
  const fraction = value / exponent;
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 2.5 ? 2.5 : fraction <= 5 ? 5 : 10;
  return nice * exponent;
}

/**
 * @param {{label: string, net: number, count: number}[]} buckets
 * @param {object} options { title, subtitle, width, height, granularityLabel }
 */
function buildBarChartSvg(buckets, options = {}) {
  const width = options.width || 1000;
  const height = options.height || 480;
  const margin = { top: 86, right: 28, bottom: 56, left: 72 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const values = buckets.map(bucket => bucket.net);
  const maxValue = niceMax(Math.max(0, ...values));
  const total = values.reduce((sum, value) => sum + value, 0);
  const average = buckets.length ? total / buckets.length : 0;
  const step = buckets.length ? plotWidth / buckets.length : plotWidth;
  const barWidth = Math.max(1, Math.min(48, step * 0.72));
  const y = value => margin.top + plotHeight - (value / maxValue) * plotHeight;
  const font = "font-family=\"DejaVu Sans, Arial, Helvetica, sans-serif\"";

  const parts = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`);
  parts.push(`<rect width="100%" height="100%" fill="${COLORS.background}"/>`);
  parts.push(`<text x="${margin.left}" y="36" ${font} font-size="22" font-weight="bold" fill="${COLORS.text}">${escapeXml(options.title || "Vendas")}</text>`);
  if (options.subtitle) {
    parts.push(`<text x="${margin.left}" y="62" ${font} font-size="14" fill="${COLORS.muted}">${escapeXml(options.subtitle)}</text>`);
  }

  // Grade horizontal (4 linhas) com rótulos.
  for (let i = 0; i <= 4; i += 1) {
    const value = (maxValue / 4) * i;
    const lineY = y(value);
    parts.push(`<line x1="${margin.left}" x2="${width - margin.right}" y1="${lineY}" y2="${lineY}" stroke="${COLORS.grid}" stroke-width="1"/>`);
    parts.push(`<text x="${margin.left - 10}" y="${lineY + 4}" ${font} font-size="12" fill="${COLORS.muted}" text-anchor="end">${formatNumber(value)}</text>`);
  }

  // Barras.
  const maxIndex = values.indexOf(Math.max(...values));
  buckets.forEach((bucket, index) => {
    const x = margin.left + index * step + (step - barWidth) / 2;
    const top = y(bucket.net);
    const barHeight = Math.max(0, margin.top + plotHeight - top);
    if (barHeight > 0) {
      parts.push(`<rect x="${x.toFixed(2)}" y="${top.toFixed(2)}" width="${barWidth.toFixed(2)}" height="${barHeight.toFixed(2)}" fill="${COLORS.bar}"/>`);
    }
    // Valor só no pico e quando há poucas barras (evita poluição).
    if ((buckets.length <= 16 && bucket.net > 0) || (index === maxIndex && bucket.net > 0)) {
      parts.push(`<text x="${(x + barWidth / 2).toFixed(2)}" y="${(top - 6).toFixed(2)}" ${font} font-size="11" fill="${COLORS.text}" text-anchor="middle">${formatNumber(bucket.net)}</text>`);
    }
  });

  // Linha de média.
  if (average > 0) {
    const avgY = y(average);
    parts.push(`<line x1="${margin.left}" x2="${width - margin.right}" y1="${avgY}" y2="${avgY}" stroke="${COLORS.average}" stroke-width="1.5" stroke-dasharray="6 4"/>`);
    parts.push(`<text x="${width - margin.right}" y="${avgY - 6}" ${font} font-size="12" fill="${COLORS.average}" text-anchor="end">média ${formatNumber(average)}</text>`);
  }

  // Rótulos do eixo X (no máximo ~14 para não sobrepor).
  const labelEvery = Math.max(1, Math.ceil(buckets.length / 14));
  buckets.forEach((bucket, index) => {
    if (index % labelEvery !== 0 && index !== buckets.length - 1) return;
    const x = margin.left + index * step + step / 2;
    parts.push(`<text x="${x.toFixed(2)}" y="${height - margin.bottom + 20}" ${font} font-size="12" fill="${COLORS.muted}" text-anchor="middle">${escapeXml(bucket.label)}</text>`);
  });

  parts.push(`<line x1="${margin.left}" x2="${width - margin.right}" y1="${margin.top + plotHeight}" y2="${margin.top + plotHeight}" stroke="${COLORS.muted}" stroke-width="1"/>`);
  if (options.footer) {
    parts.push(`<text x="${margin.left}" y="${height - 12}" ${font} font-size="12" fill="${COLORS.muted}">${escapeXml(options.footer)}</text>`);
  }
  parts.push("</svg>");
  return parts.join("");
}

let resvgModule;
function loadResvg() {
  if (resvgModule === undefined) {
    try {
      resvgModule = require("@resvg/resvg-js");
    } catch {
      resvgModule = null;
    }
  }
  return resvgModule;
}

/** Converte SVG em PNG. Retorna null se @resvg/resvg-js não estiver instalado. */
function svgToPng(svg) {
  const resvg = loadResvg();
  if (!resvg) return null;
  const renderer = new resvg.Resvg(svg, {
    background: COLORS.background,
    fitTo: { mode: "original" },
    font: { loadSystemFonts: true, defaultFontFamily: "DejaVu Sans" },
  });
  return renderer.render().asPng();
}

module.exports = { buildBarChartSvg, svgToPng, niceMax, escapeXml };
