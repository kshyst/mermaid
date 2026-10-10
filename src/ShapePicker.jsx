import { useId, useState } from 'react';
import { ChevronDown, ChevronUp, Search, Shapes } from 'lucide-react';
import { shapes, shapeSnippet, supportsFlowchartShapes } from './shapes';
import './shape-picker.css';

function ShapeIcon({ kind }) {
  let drawing;
  switch (kind) {
    case 'rounded': drawing = <rect x="8" y="8" width="48" height="24" rx="5"/>; break;
    case 'stadium': drawing = <rect x="8" y="8" width="48" height="24" rx="12"/>; break;
    case 'diamond': drawing = <path d="M32 3 59 20 32 37 5 20Z"/>; break;
    case 'cylinder': drawing = <><path d="M12 10v20c0 9 40 9 40 0V10"/><ellipse cx="32" cy="10" rx="20" ry="6"/></>; break;
    case 'subroutine': drawing = <><rect x="8" y="8" width="48" height="24" rx="1"/><path d="M15 8v24M49 8v24"/></>; break;
    case 'circle': drawing = <circle cx="32" cy="20" r="15"/>; break;
    case 'double-circle': drawing = <><circle cx="32" cy="20" r="17"/><circle cx="32" cy="20" r="12"/></>; break;
    case 'hexagon': drawing = <path d="M16 7h32l12 13-12 13H16L4 20Z"/>; break;
    case 'asymmetric': drawing = <path d="M7 7h49v26H7l13-13Z"/>; break;
    case 'parallelogram': drawing = <path d="M17 8h43L47 32H4Z"/>; break;
    case 'reverse-slant': drawing = <path d="M4 8h43l13 24H17Z"/>; break;
    case 'trapezoid': drawing = <path d="M17 8h30l13 24H4Z"/>; break;
    case 'reverse-trapezoid': drawing = <path d="M4 8h56L47 32H17Z"/>; break;
    case 'document': drawing = <path d="M9 6h46v26c-17-9-29 9-46 0Z"/>; break;
    case 'cloud': drawing = <path d="M16 31C0 30 4 13 15 14 13 2 33 0 37 10 47 1 62 12 53 20 65 34 43 40 38 31 30 41 18 39 16 31Z"/>; break;
    case 'delay': drawing = <path d="M10 6h28a14 14 0 0 1 0 28H10Z"/>; break;
    case 'manual-input': drawing = <path d="M8 15 56 5v29H8Z"/>; break;
    case 'junction': drawing = <circle cx="32" cy="20" r="9" fill="currentColor"/>; break;
    case 'triangle': drawing = <path d="M32 4 58 34H6Z"/>; break;
    default: drawing = <rect x="8" y="8" width="48" height="24" rx="1"/>;
  }
  return <svg viewBox="0 0 64 40" width="48" height="30" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" aria-hidden="true">{drawing}</svg>;
}

export default function ShapePicker({ source, onInsert }) {
  const [open, setOpen] = useState(() => !window.matchMedia('(max-width: 800px)').matches), [query, setQuery] = useState('');
  const panelId = useId();
  const supported = supportsFlowchartShapes(source);
  const visible = shapes.filter(shape => `${shape.name} ${shape.label}`.toLowerCase().includes(query.toLowerCase()));
  return <section className="shape-picker" aria-label="Flowchart shape picker">
    <button className="shape-picker-heading" type="button" onClick={() => setOpen(value => !value)} aria-expanded={open} aria-controls={panelId}>
      <span><Shapes size={14}/> Insert shape <small>{shapes.length}</small></span>
      {open ? <ChevronDown size={14}/> : <ChevronUp size={14}/>}
    </button>
    {open && <div id={panelId} className="shape-picker-body">
      <div className="shape-picker-tools">
        <span>{supported ? 'Click to insert at your cursor' : 'Shapes are available in flowchart / graph diagrams'}</span>
        <label className="shape-search"><Search size={12}/><input aria-label="Search shapes" placeholder="Find a shape…" value={query} onChange={event => setQuery(event.target.value)}/></label>
      </div>
      <div className="shape-grid">
        {visible.map(shape => <button className="shape-option" key={shape.kind} type="button" disabled={!supported}
          title={`${shape.name}: ${shapeSnippet(shape, 'node1').text}`}
          aria-label={`Insert ${shape.name.toLowerCase()} shape`}
          onMouseDown={event => event.preventDefault()}
          onClick={() => onInsert(shape)}>
          <ShapeIcon kind={shape.kind}/><span>{shape.name}</span>
        </button>)}
        {!visible.length && <p className="shape-empty">No matching shapes.</p>}
      </div>
    </div>}
  </section>;
}
