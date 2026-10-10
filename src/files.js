import { applySvgBackground } from './diagram-themes';
export function download(content, filename, type) {
  const url = URL.createObjectURL(content instanceof Blob ? content : new Blob([content], { type }));
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export const safeName = name => (name.replace(/[^a-z0-9_-]/gi, '-').replace(/-+/g, '-') || 'diagram');
export function shareUrl(doc) {
  const bytes = new TextEncoder().encode(JSON.stringify({ name: doc.name, code: doc.code }));
  return `${location.origin}${location.pathname}#diagram=${btoa(Array.from(bytes, b => String.fromCharCode(b)).join(''))}`;
}
export function readShare() {
  try {
    if (!location.hash.startsWith('#diagram=')) return null;
    const data = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(location.hash.slice(9)), c => c.charCodeAt(0))));
    if (typeof data.code !== 'string' || typeof data.name !== 'string') return null;
    return data;
  } catch { return null; }
}
export async function exportPng(svgText, name, scale, background) {
  const xml = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  const svg = xml.documentElement;
  const box = svg.getAttribute('viewBox')?.split(/[ ,]+/).map(Number);
  const width = box?.[2] || parseFloat(svg.getAttribute('width')) || 1200;
  const height = box?.[3] || parseFloat(svg.getAttribute('height')) || 800;
  if (width * height * scale * scale > 64000000) throw new Error('Diagram is too large for PNG. Choose a lower resolution or export SVG.');
  svg.setAttribute('width', width); svg.setAttribute('height', height);
  applySvgBackground(svg, background);
  if (svg.querySelector('foreignObject')) throw new Error('This diagram uses HTML labels. Export SVG, or disable htmlLabels in its Mermaid configuration for PNG.');
  const source = new XMLSerializer().serializeToString(svg);
  const url = URL.createObjectURL(new Blob([source], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = () => reject(new Error('PNG conversion failed. Try SVG export.')); img.src = url; });
    const canvas = document.createElement('canvas'); canvas.width = Math.ceil(width * scale); canvas.height = Math.ceil(height * scale);
    const ctx = canvas.getContext('2d');
    if (background !== 'transparent') { ctx.fillStyle = background; ctx.fillRect(0, 0, canvas.width, canvas.height); }
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('Could not create PNG. Try SVG export.');
    download(blob, `${safeName(name)}.png`);
  } finally { URL.revokeObjectURL(url); }
}
