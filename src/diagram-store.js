import { useEffect, useRef, useState } from 'react';
import { blankCode } from './templates';

const LEGACY_KEY = 'mermaid-studio-v1';
const DRAFT_KEY = 'kshyst-mermaid-drafts-v1';
const MIGRATION_KEY = 'kshyst-mermaid-sqlite-migrated-v1';
const makeDoc = (name, code) => ({ id: crypto.randomUUID(), name, code, updated: Date.now() });
function read(key, fallback = null) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function validDoc(doc) {
  return doc && typeof doc.id === 'string' && typeof doc.name === 'string' && typeof doc.code === 'string';
}
async function request(path, method = 'GET', data) {
  let response;
  try {
    response = await fetch(path, { method, credentials: 'same-origin', headers: data === undefined ? {} : { 'Content-Type': 'application/json' }, body: data === undefined ? undefined : JSON.stringify(data) });
  } catch { throw new Error('Cannot reach the database. Your draft is kept locally; retry saving.'); }
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || (response.status === 401 ? 'Sign in again, then retry saving.' : `Database request failed (${response.status}). Retry saving.`));
  return result;
}

export default function useDiagramStore() {
  const initial = useRef(null);
  if (!initial.current) {
    const legacy = read(LEGACY_KEY, {}), drafts = read(DRAFT_KEY, {});
    initial.current = { legacy, drafts, state: { docs: [], active: drafts.active || legacy.active || '', theme: drafts.theme || legacy.theme || 'default', background: drafts.background || legacy.background || 'dots', wrap: drafts.wrap ?? legacy.wrap ?? true } };
  }
  const [state, setReactState] = useState(initial.current.state);
  const [loaded, setLoaded] = useState(false), [loadError, setLoadError] = useState(''), [saveError, setSaveError] = useState(''), [saved, setSaved] = useState(true), [deactivating, setDeactivating] = useState(false);
  const stateRef = useRef(state), dirty = useRef(new Map()), versions = useRef(new Map()), timer = useRef(null), running = useRef(null), generation = useRef(0), ready = useRef(false), removed = useRef(new Set());

  function cache() {
    const current = stateRef.current;
    const pending = Array.from(dirty.current.values(), entry => ({ ...entry.doc, version: versions.current.get(entry.doc.id) }));
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ active: current.active, theme: current.theme, background: current.background, wrap: current.wrap, pending }));
    } catch { setSaveError('Browser draft backup is unavailable. Keep this tab open until the database save completes.'); }
  }
  function setState(change) {
    const next = typeof change === 'function' ? change(stateRef.current) : change;
    stateRef.current = next; setReactState(next);
    if (ready.current) cache();
  }
  function mark(doc) {
    dirty.current.set(doc.id, { doc, token: ++generation.current }); setSaved(false);
  }
  function schedule() {
    cache(); clearTimeout(timer.current);
    timer.current = setTimeout(() => { saveNow().catch(() => {}); }, 500);
  }
  async function saveNow() {
    clearTimeout(timer.current);
    if (!ready.current) throw new Error('The diagram library is still loading.');
    if (running.current) { await running.current; if (dirty.current.size) return saveNow(); return; }
    const work = (async () => {
      setSaveError('');
      try {
        while (dirty.current.size) {
          const [id, entry] = dirty.current.entries().next().value;
          const version = versions.current.get(id);
          const result = await request(version ? `/api/diagrams/${id}` : '/api/diagrams', version ? 'PUT' : 'POST', { ...entry.doc, version });
          versions.current.set(id, result.diagram.version);
          if (dirty.current.get(id)?.token === entry.token) dirty.current.delete(id);
          setState(s => ({ ...s, docs: s.docs.map(doc => doc.id === id ? { ...doc, version: result.diagram.version } : doc) }));
          cache();
        }
        setSaved(true);
      } catch (error) { setSaved(false); setSaveError(error.message); cache(); throw error; }
    })();
    running.current = work;
    try { await work; } finally { running.current = null; }
  }

  async function load() {
    setLoadError('');
    try {
      if (!read(MIGRATION_KEY, false)) {
        const legacyDocs = initial.current.legacy.docs;
        if (Array.isArray(legacyDocs)) {
          for (const doc of legacyDocs.filter(validDoc)) await request('/api/diagrams/import', 'POST', { diagrams: [doc] });
        }
        // Keeping the legacy snapshot provides a fallback; the marker avoids importing it again.
        try { localStorage.setItem(MIGRATION_KEY, 'true'); } catch {}
      }
      const result = await request('/api/diagrams');
      const docs = result.diagrams;
      versions.current = new Map(docs.map(doc => [doc.id, doc.version]));
      const pending = initial.current.drafts.pending;
      let recovered = false;
      if (Array.isArray(pending)) {
        for (const draft of pending.filter(validDoc)) {
          const index = docs.findIndex(doc => doc.id === draft.id);
          // A successful save whose response was lost needs no duplicate recovery copy.
          if (index >= 0 && draft.name === docs[index].name && draft.code === docs[index].code) continue;
          if (index >= 0 && draft.version === docs[index].version) {
            docs[index] = { ...docs[index], name: draft.name, code: draft.code, updated: draft.updated };
            mark(docs[index]);
          } else {
            // Never overwrite a newer server copy or reactivate a deleted ID.
            const copy = makeDoc(draft.version || index >= 0 ? `${draft.name.slice(0, 470)} (recovered draft)` : draft.name, draft.code);
            docs.push(copy); mark(copy); recovered = true;
          }
        }
      }
      const active = docs.some(doc => doc.id === stateRef.current.active) ? stateRef.current.active : docs[0]?.id || '';
      ready.current = true;
      setState(s => ({ ...s, docs, active })); setLoaded(true);
      if (recovered) setSaveError('Recovered unsaved work as a separate diagram to preserve the database copy.');
      if (dirty.current.size) schedule(); else setSaved(true);
    } catch (error) { setLoadError(error.message); }
  }
  useEffect(() => {
    load();
    const retry = () => { if (ready.current) saveNow().catch(() => {}); };
    const beforeUnload = event => { if (dirty.current.size) { cache(); event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('online', retry); window.addEventListener('beforeunload', beforeUnload);
    return () => { clearTimeout(timer.current); window.removeEventListener('online', retry); window.removeEventListener('beforeunload', beforeUnload); };
  }, []);

  function addDoc(name = 'Untitled diagram', code = blankCode) {
    if (!ready.current || deactivating) return;
    const doc = makeDoc(name, code); mark(doc);
    setState(s => ({ ...s, docs: [...s.docs, doc], active: doc.id })); schedule();
  }
  function updateDoc(values) {
    const current = stateRef.current;
    const doc = current.docs.find(doc => doc.id === current.active);
    if (!doc || removed.current.has(doc.id)) return;
    const next = { ...doc, ...values, updated: Date.now() }; mark(next);
    setState(s => ({ ...s, docs: s.docs.map(item => item.id === next.id ? next : item) })); schedule();
  }
  async function removeDoc() {
    const id = stateRef.current.active;
    if (!id || deactivating) return;
    setDeactivating(true); removed.current.add(id);
    try {
      // Flush every pending edit before deactivation, including edits made just before the click.
      await saveNow();
      await request(`/api/diagrams/${id}/deactivate`, 'POST', { version: versions.current.get(id) });
      versions.current.delete(id);
      setState(s => { const docs = s.docs.filter(doc => doc.id !== id); return { ...s, docs, active: s.active === id ? docs[0]?.id || '' : s.active }; });
    } catch (error) { removed.current.delete(id); throw error; }
    finally { setDeactivating(false); }
  }
  return { state, setState, loaded, loadError, saveError, saved, deactivating, addDoc, updateDoc, removeDoc, saveNow, retryLoad: load };
}
