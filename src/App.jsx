import { useEffect, useRef, useState } from 'react';
import { GitBranch, Plus, Search, FileCode2, ChevronDown, Upload, Download, Share2, PanelLeftClose, PanelLeftOpen, LayoutTemplate, X, Copy, Trash2, Check, WrapText, Play, ArrowUpRight, MoreHorizontal } from 'lucide-react';
import Editor from './Editor';
import Preview from './Preview';
import { templates } from './templates';
import useDiagramStore from './diagram-store';
import { download, safeName, shareUrl, readShare, exportPng } from './files';
function IconButton({ title, children, ...props }) { return <button className="icon-button" title={title} aria-label={title} {...props}>{children}</button>; }
export default function App() {
  const store = useDiagramStore();
  const { state, setState, loaded, loadError, saveError, saved, deactivating, updateDoc, saveNow } = store;
  const [query, setQuery] = useState(''), [modal, setModal] = useState(null), [toast, setToast] = useState(''), [sidebar, setSidebar] = useState(true), [svg, setSvg] = useState(''), [refresh, setRefresh] = useState(0), [live, setLive] = useState(true), [exportType, setExportType] = useState('svg'), [scale, setScale] = useState(2), [pngBg, setPngBg] = useState('#ffffff'), [pane, setPane] = useState('split'), [share, setShare] = useState('');
  const importRef = useRef(null), toastTimer = useRef(null);
  const doc = state.docs.find(d => d.id === state.active) || state.docs[0];
  function notify(message) { setToast(message); clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(''), 4000); }
  function addDoc(name, code) { store.addDoc(name, code); setModal(null); setRefresh(r => r + 1); }
  function preference(key, value) { setState(s => ({ ...s, [key]: value })); }
  useEffect(() => {
    if (!loaded) return;
    const shared = readShare();
    if (shared) { addDoc(shared.name, shared.code); history.replaceState(null, '', location.pathname); notify('Shared diagram added to your library'); }
  }, [loaded]);
  useEffect(() => {
    function shortcut(e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); saveNow().then(() => notify('Saved to database')).catch(error => notify(error.message)); }
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); setRefresh(r => r + 1); }
      if (e.key === 'Escape') setModal(null);
    }
    window.addEventListener('keydown', shortcut); return () => window.removeEventListener('keydown', shortcut);
  }, [loaded]);
  async function importFile(e) {
    const file = e.target.files[0]; if (!file) return;
    try {
      if (file.size > 2 * 1024 * 1024) throw new Error('Please import a source file smaller than 2 MB.');
      let text = await file.text(); const fenced = text.match(/```mermaid\s*\n([\s\S]*?)```/); if (fenced) text = fenced[1];
      addDoc(file.name.replace(/\.(mmd|mermaid|md|txt)$/i, ''), text); notify('Diagram imported');
    } catch (err) { notify(err.message); } finally { e.target.value = ''; }
  }
  async function copy(text, message) { try { await navigator.clipboard.writeText(text); notify(message); } catch { notify('Clipboard unavailable. Select and copy the text manually.'); } }
  async function doExport() {
    try {
      if (exportType === 'mmd') download(doc.code, `${safeName(doc.name)}.mmd`, 'text/plain');
      else if (exportType === 'svg') download(svg, `${safeName(doc.name)}.svg`, 'image/svg+xml');
      else await exportPng(svg, doc.name, scale, pngBg);
      notify('Your export is ready'); setModal(null);
    } catch (err) { notify(err.message); }
  }
  async function removeDoc() {
    try { await store.removeDoc(); setModal(null); setRefresh(r => r + 1); notify('Diagram deactivated; its source is retained'); }
    catch (error) { notify(error.message); }
  }
  if (!loaded || !doc) return <div className="app">
    <header className="topbar"><a className="brand" href="/" aria-label="kshyst mermaid home"><img className="brand-icon" src="/app-icon.png" alt="" width="34" height="34"/><span>kshyst<span className="brand-light">mermaid</span></span></a></header>
    <main className="library-empty">
      <FileCode2 size={32}/><h2>{loadError ? 'Could not load diagrams' : loaded ? 'Your next idea starts here' : 'Loading your diagrams…'}</h2>
      <p>{loadError || (loaded ? 'Create a diagram to start your workspace.' : 'Connecting to your diagram library.')}</p>
      {loadError ? <button className="button primary" onClick={store.retryLoad}>Retry loading</button> : loaded && <button className="button primary" onClick={() => addDoc()}><Plus size={16}/> New diagram</button>}
    </main>
  </div>;
  return <div className="app">
    <header className="topbar"><a className="brand" href="/" aria-label="kshyst mermaid home"><img className="brand-icon" src="/app-icon.png" alt="" width="34" height="34"/><span>kshyst<span className="brand-light">mermaid</span></span></a></header>
    <div className="app-body">
      {sidebar && <aside className="sidebar"><div className="workspace-label">WORKSPACE <IconButton title="Hide sidebar" onClick={() => setSidebar(false)}><PanelLeftClose size={16}/></IconButton></div><button className="new-diagram" onClick={() => addDoc()}><Plus size={17}/> New diagram <span>+</span></button><div className="searchbox"><Search size={15}/><input aria-label="Search diagrams" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search diagrams…"/></div><div className="library-label">YOUR DIAGRAMS <span>{state.docs.length}</span></div><div className="document-list">{state.docs.filter(d => d.name.toLowerCase().includes(query.toLowerCase())).map(d => <button key={d.id} className={`document-item ${d.id === doc.id ? 'selected' : ''}`} onClick={() => { preference('active', d.id); setRefresh(r => r + 1); }}><FileCode2 size={16}/><span>{d.name}<small>{new Date(d.updated).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</small></span>{d.id === doc.id && <span className="selected-dot"/>}</button>)}{!state.docs.some(d => d.name.toLowerCase().includes(query.toLowerCase())) && <p className="no-results">No matching diagrams</p>}</div><div className="sidebar-bottom"><button className="templates-button" onClick={() => { setQuery(''); setModal('templates'); }}><LayoutTemplate size={18}/> Explore templates <ArrowUpRight size={14}/></button></div></aside>}
      <main className={`main pane-${pane}`}>
        {saveError && <div className="save-error" role="alert"><span>{saveError}</span><button onClick={() => saveNow().catch(error => notify(error.message))}>Retry save</button></div>}
        <div className="document-toolbar"><div className="document-title">{!sidebar && <IconButton title="Show sidebar" onClick={() => setSidebar(true)}><PanelLeftOpen size={18}/></IconButton>}<FileCode2 size={19}/><input aria-label="Diagram title" maxLength={500} value={doc.name} onChange={e => updateDoc({ name: e.target.value })} onBlur={() => { if (!doc.name.trim()) updateDoc({ name: 'Untitled diagram' }); }}/><IconButton title="Document actions" onClick={() => setModal('actions')}><MoreHorizontal size={19}/></IconButton><span className="autosave">{saved ? <Check size={12}/> : <span className="status-dot"/>}{saveError ? 'Not saved' : saved ? 'All changes saved' : 'Saving…'}</span></div><div className="document-actions"><button className="button secondary" onClick={() => { setShare(shareUrl(doc)); setModal('share'); }}><Share2 size={15}/> Share</button><button className="button primary" onClick={() => setModal('export')}><Download size={15}/> Export <ChevronDown size={13}/></button></div></div>
        <div className="settings-toolbar"><div className="settings-group"><span className="setting-label">Theme</span><select aria-label="Diagram theme" value={state.theme} onChange={e => preference('theme', e.target.value)}><option value="default">Default</option><option value="neutral">Neutral</option><option value="dark">Dark</option><option value="forest">Forest</option></select><i/><span className="setting-label">Canvas</span><select aria-label="Canvas background" value={state.background} onChange={e => preference('background', e.target.value)}><option value="dots">Dot grid</option><option value="grid">Grid</option><option value="plain">Plain</option></select></div><div className="settings-group"><div className="pane-switch" aria-label="Workspace layout">{['code','split','preview'].map(p => <button key={p} className={pane === p ? 'active' : ''} onClick={() => setPane(p)}>{p[0].toUpperCase() + p.slice(1)}</button>)}</div><button className="import-button" onClick={() => importRef.current.click()}><Upload size={14}/> Import</button></div></div>
        <div className="editor-workspace"><section className="source-pane"><div className="pane-header"><span><FileCode2 size={14}/> Mermaid source <span className="code-badge">.mmd</span></span><div><IconButton title="Copy source" onClick={() => copy(doc.code, 'Source copied')}><Copy size={14}/></IconButton><IconButton title="Toggle line wrapping" className={`icon-button ${state.wrap ? 'enabled' : ''}`} onClick={() => preference('wrap', !state.wrap)}><WrapText size={16}/></IconButton></div></div><Editor code={doc.code} documentId={doc.id} onChange={code => updateDoc({ code })} wrap={state.wrap}/><div className="source-footer"><span>{doc.code.split('\n').length} lines <b>·</b> {doc.code.length} characters</span><div><label className="live-toggle"><input type="checkbox" checked={live} onChange={e => setLive(e.target.checked)}/> Auto-render</label><IconButton title="Render now (Ctrl+Enter)" onClick={() => setRefresh(r => r + 1)}><Play size={13}/></IconButton></div></div></section><Preview code={doc.code} theme={state.theme} background={state.background} onSvg={setSvg} refresh={refresh} live={live}/></div>
      </main>
    </div>
    <input type="file" ref={importRef} hidden accept=".mmd,.mermaid,.md,.txt" onChange={importFile}/>
    {toast && <div className="toast" role="status"><Check size={16}/>{toast}<button aria-label="Dismiss notification" onClick={() => setToast('')}><X size={14}/></button></div>}
    {modal && <div className="modal-overlay" onMouseDown={e => { if (e.target === e.currentTarget) setModal(null); }}><div className={`modal ${modal === 'templates' ? 'template-modal' : ''}`} role="dialog" aria-modal="true" aria-label={modal}><IconButton title="Close dialog" onClick={() => setModal(null)}><X size={20}/></IconButton>
      {modal === 'templates' && <><div className="eyebrow">A LITTLE INSPIRATION</div><h2>Great ideas start here.</h2><p>Pick a starting point and make it your own.</p><div className="searchbox template-search"><Search size={16}/><input aria-label="Search templates" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search templates…" autoFocus/></div><div className="template-grid">{templates.filter(t => `${t.name} ${t.type}`.toLowerCase().includes(query.toLowerCase())).map((t, i) => <button className="template-card" key={t.name} onClick={() => addDoc(t.name, t.code)}><div className={`template-art art-${i % 4}`}><GitBranch size={34}/><span>{t.type}</span></div><strong>{t.name}<ArrowUpRight size={15}/></strong><p>{t.description}</p></button>)}</div></>}
      {modal === 'export' && <><div className="eyebrow">TAKE IT WITH YOU</div><h2>Export your diagram</h2><p>A little clarity, ready to share.</p><div className="export-options">{[['svg','SVG','Scalable vector'],['png','PNG','High-quality image'],['mmd','Mermaid','Editable source']].map(([value, label, note]) => <button key={value} className={exportType === value ? 'active' : ''} onClick={() => setExportType(value)}><FileCode2 size={22}/><strong>{label}</strong><small>{note}</small></button>)}</div>{exportType === 'png' && <div className="export-settings"><label>Resolution<select value={scale} onChange={e => setScale(Number(e.target.value))}><option value={1}>1× Standard</option><option value={2}>2× Retina</option><option value={3}>3× High resolution</option></select></label><label>Background<select value={pngBg} onChange={e => setPngBg(e.target.value)}><option value="#ffffff">White</option><option value="transparent">Transparent</option><option value="#151619">Dark</option></select></label></div>}{!svg && exportType !== 'mmd' && <p className="warning">Fix the diagram syntax before exporting an image.</p>}<button className="button primary wide" disabled={!svg && exportType !== 'mmd'} onClick={doExport}><Download size={16}/> Download {exportType.toUpperCase()}</button></>}
      {modal === 'share' && <><div className="eyebrow">IDEAS TRAVEL BETTER TOGETHER</div><h2>Share this diagram</h2><p>This link includes a snapshot of your diagram. Anyone with access to this app can open it.</p><textarea className="share-input" readOnly value={share} aria-label="Share link" onFocus={e => e.target.select()}/><p className="muted">The diagram is stored in the link. Changes after sharing will need a new link.</p><button className="button primary wide" onClick={() => copy(share, 'Share link copied')}><Copy size={16}/> Copy link</button></>}
      {modal === 'actions' && <><h2>Document actions</h2><p>{doc.name}</p><div className="action-list"><button onClick={() => addDoc(`${doc.name} (copy)`, doc.code)}><Copy size={17}/> Duplicate diagram</button><button onClick={() => { download(doc.code, `${safeName(doc.name)}.mmd`, 'text/plain'); setModal(null); }}><Download size={17}/> Download source</button><button className="danger" onClick={() => setModal('delete')}><Trash2 size={17}/> Delete diagram</button></div></>}
      {modal === 'delete' && <><h2>Delete this diagram?</h2><p>“{doc.name}” will be deactivated and hidden from the library. Its source remains stored.</p><div className="dialog-actions"><button className="button secondary" onClick={() => setModal(null)}>Keep diagram</button><button className="button danger-button" disabled={deactivating} onClick={removeDoc}><Trash2 size={15}/> {deactivating ? 'Deactivating…' : 'Delete diagram'}</button></div></>}
      {modal === 'help' && <><div className="eyebrow">LESS CLICKING, MORE CREATING</div><h2>Keyboard shortcuts</h2><div className="shortcut-list">{[['Save to database','Ctrl / ⌘ + S'],['Render diagram','Ctrl / ⌘ + Enter'],['Find in source','Ctrl / ⌘ + F'],['Undo','Ctrl / ⌘ + Z'],['Redo','Ctrl / ⌘ + Shift + Z'],['Zoom canvas','Ctrl / ⌘ + Scroll'],['Close dialog','Escape']].map(([label, key]) => <div key={label}><span>{label}</span><kbd>{key}</kbd></div>)}</div><p className="muted">Documents save automatically to the database. Export Mermaid files to back up your work.</p></>}
    </div></div>}
  </div>;
}
