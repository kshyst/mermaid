import { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';
import { Minus, Plus, Maximize, Scan, AlertCircle, Check, LoaderCircle } from 'lucide-react';
let renderCounter = 0;
let renderQueue = Promise.resolve();
export default function Preview({ code, theme, background, onSvg, refresh, live }) {
  const [svg, setSvg] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [zoom, setZoom] = useState(1), [pan, setPan] = useState({ x: 0, y: 0 });
  const frame = useRef(null), diagram = useRef(null), drag = useRef(null), callback = useRef(onSvg), last = useRef(null);
  callback.current = onSvg;
  useEffect(() => {
    if (!live && last.current && last.current.refresh === refresh && last.current.theme === theme) { setBusy(false); return; }
    last.current = { refresh, theme };
    callback.current('');
    let cancelled = false;
    const timer = setTimeout(() => {
      setBusy(true);
      renderQueue = renderQueue.catch(() => {}).then(async () => {
        if (cancelled) return;
        try {
          mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', suppressErrorRendering: true, theme, htmlLabels: false, fontFamily: 'Arial, sans-serif', flowchart: { htmlLabels: false }, sequence: { useMaxWidth: false } });
          const result = await mermaid.render(`diagram-${++renderCounter}`, code || 'flowchart TD\n A[Start writing your diagram]');
          const parsed = new DOMParser().parseFromString(result.svg, 'image/svg+xml');
          const root = parsed.documentElement;
          const box = root.getAttribute('viewBox')?.split(/[ ,]+/).map(Number);
          if (box?.length === 4) { root.setAttribute('width', box[2]); root.setAttribute('height', box[3]); }
          const rendered = new XMLSerializer().serializeToString(root);
          if (!cancelled) { setSvg(rendered); setError(''); callback.current(rendered); }
        } catch (err) {
          if (!cancelled) { setError(err.message || String(err)); callback.current(''); }
        } finally { if (!cancelled) setBusy(false); }
      });
    }, 350);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [code, theme, refresh, live]);
  function fit() {
    const el = diagram.current?.querySelector('svg');
    if (!el || !frame.current) return;
    const box = el.viewBox.baseVal, area = frame.current.getBoundingClientRect();
    setZoom(Math.min(2, Math.max(.1, Math.min((area.width - 100) / box.width, (area.height - 100) / box.height)))); setPan({ x: 0, y: 0 });
  }
  useEffect(() => {
    if (!svg) return;
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(frame.current);
    return () => observer.disconnect();
  }, [svg]);
  const adjust = delta => setZoom(z => Math.min(5, Math.max(.1, z + delta)));
  return <section className="preview-pane">
    <div className="pane-header"><span><span className="status-dot"/> Live preview</span><span className="render-status">{busy ? <><LoaderCircle size={12} className="spin"/> Rendering</> : error ? <><AlertCircle size={12}/> Syntax error</> : <><Check size={12}/> Ready</>}</span></div>
    <div ref={frame} className={`canvas ${background}`} onWheel={e => { if (e.ctrlKey || e.metaKey) { e.preventDefault(); adjust(e.deltaY > 0 ? -.1 : .1); } }} onPointerDown={e => { if (e.target.closest('button')) return; drag.current = { x: e.clientX - pan.x, y: e.clientY - pan.y }; e.currentTarget.setPointerCapture(e.pointerId); }} onPointerMove={e => { if (drag.current) setPan({ x: e.clientX - drag.current.x, y: e.clientY - drag.current.y }); }} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
      <div className="canvas-label">YOUR IDEAS, CONNECTED</div>
      <div ref={diagram} className="diagram" style={{ transform: `translate(${pan.x}px,${pan.y}px) scale(${zoom})` }} dangerouslySetInnerHTML={{ __html: svg }}/>
      {!svg && !error && <div className="empty-preview"><LoaderCircle className="spin"/> Bringing your diagram to life…</div>}
      {error && <div className="syntax-error"><strong><AlertCircle size={16}/> Check your diagram syntax</strong><pre>{error}</pre><span>Your last valid preview stays visible while you edit.</span></div>}
      <div className="zoom-tools" onPointerDown={e => e.stopPropagation()}><button title="Zoom out" aria-label="Zoom out" onClick={() => adjust(-.1)}><Minus size={16}/></button><button title="Reset zoom" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}>{Math.round(zoom * 100)}%</button><button title="Zoom in" aria-label="Zoom in" onClick={() => adjust(.1)}><Plus size={16}/></button><i/><button title="Fit diagram" aria-label="Fit diagram" onClick={fit}><Scan size={17}/></button><button title="Fullscreen preview" aria-label="Fullscreen preview" onClick={() => { if (document.fullscreenElement) document.exitFullscreen(); else frame.current.requestFullscreen?.(); }}><Maximize size={16}/></button></div>
    </div>
    <div className="preview-footer"><span>Drag to pan · Ctrl + scroll to zoom</span><span>Powered by Mermaid</span></div>
  </section>;
}
