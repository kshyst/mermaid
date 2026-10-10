import { useState } from 'react';
import { ArrowUpRight, CalendarDays, ChartColumn, ChartPie, Database, FileCode2, GitBranch, GitMerge, LayoutGrid, Search, Workflow } from 'lucide-react';
import { templates } from './templates';
import './template-library.css';

const icons = { Flowchart: Workflow, Sequence: GitBranch, 'Entity relationship': Database, Gantt: CalendarDays, Pie: ChartPie, 'Git graph': GitMerge, 'XY chart': ChartColumn, Block: LayoutGrid };
const types = [...new Set(templates.map(template => template.type))].sort();

export default function TemplateLibrary({ onSelect, disabled = false }) {
  const [query, setQuery] = useState(''), [type, setType] = useState('All');
  const visible = templates.filter(template => (type === 'All' || template.type === type) &&
    `${template.name} ${template.type} ${template.description}`.toLowerCase().includes(query.trim().toLowerCase()));
  return <>
    <div className="eyebrow">{templates.length} COMPLETE EXAMPLES · {types.length} DIAGRAM TYPES</div>
    <h2>Choose a template</h2>
    <p>Click a template to open its full source in a new diagram.</p>
    <div className="template-controls">
      <label className="searchbox template-search"><Search size={16}/><input aria-label="Search templates" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search workflows, systems, charts…" autoFocus/></label>
      <select aria-label="Filter template type" value={type} onChange={event => setType(event.target.value)}>
        <option value="All">All diagram types</option>
        {types.map(type => <option value={type} key={type}>{type}</option>)}
      </select>
    </div>
    <div className="template-results">{visible.length} {visible.length === 1 ? 'template' : 'templates'}<span>Creates a new document</span></div>
    <div className="template-grid">
      {visible.map((template, index) => {
        const Icon = icons[template.type] || FileCode2;
        return <button type="button" className="template-card" key={template.name} disabled={disabled}
          aria-label={`Use ${template.name} template`} onClick={() => onSelect(template)}>
          <div className={`template-art art-${index % 4}`}><Icon size={34}/><span>{template.type}</span></div>
          <strong>{template.name}<ArrowUpRight size={15}/></strong>
          <p>{template.description}</p>
          <div className="template-card-footer"><span>{template.code.split('\n').length} lines</span><span>Use template →</span></div>
        </button>;
      })}
    </div>
    {!visible.length && <div className="template-no-results"><p>No templates match these filters.</p><button className="button secondary" onClick={() => { setQuery(''); setType('All'); }}>Clear filters</button></div>}
  </>;
}
