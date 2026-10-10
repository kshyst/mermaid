import { useEffect, useRef, useState } from 'react';
import { blankCode } from './templates';
import { createDiagramId } from './id';
import { apiRequest as request } from './api';

const LEGACY_KEY = 'mermaid-studio-v1';
const makeDoc = (name, code) => ({ id: createDiagramId(), name, code, updated: Date.now() });
function read(key, fallback = null) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function validDoc(doc) {
  return doc && typeof doc.id === 'string' && typeof doc.name === 'string' && typeof doc.code === 'string';
}
export default function useDiagramStore(user) {
  const DRAFT_KEY = `kshyst-mermaid-drafts-v2:${user.id}`;
  const MIGRATION_KEY = `kshyst-mermaid-sqlite-migrated-v2:${user.id}`;
  const alive = useRef(true);
  const [groups, setGroups] = useState([]);
  const groupRef = useRef([]);
  const initial = useRef(null);
  if (!initial.current) {
    const legacy = user.legacy ? read(LEGACY_KEY,{}) : {};
    const drafts = read(DRAFT_KEY, user.legacy ? read('kshyst-mermaid-drafts-v1',{}) : {});
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
        while (dirty.current.size && alive.current) {
          const [id, entry] = dirty.current.entries().next().value;
          const version = versions.current.get(id);
          const result = await request(version ? `/api/diagrams/${id}` : '/api/diagrams', version ? 'PUT' : 'POST', { ...entry.doc, version });
          if (!alive.current) return;
          versions.current.set(id, result.diagram.version);
          if (dirty.current.get(id)?.token === entry.token) dirty.current.delete(id);
          setState(s => ({ ...s, docs: s.docs.map(doc => doc.id === id ? { ...result.diagram, ...doc, version: result.diagram.version, creatorId: result.diagram.creatorId ?? user.id, creatorName: result.diagram.creatorName ?? user.username, canManage: result.diagram.canManage ?? true, groupName: doc.groupId===result.diagram.groupId ? result.diagram.groupName : doc.groupName } : doc) }));
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
      if (user.legacy && !read(MIGRATION_KEY, false)) {
        const legacyDocs = initial.current.legacy.docs;
        if (Array.isArray(legacyDocs)) {
          for (const doc of legacyDocs.filter(validDoc)) { if (!alive.current) return; await request('/api/diagrams/import', 'POST', { diagrams: [doc] }); }
        }
        // Keeping the legacy snapshot provides a fallback; the marker avoids importing it again.
        try { localStorage.setItem(MIGRATION_KEY, 'true'); } catch {}
      }
      const result = await request('/api/diagrams');
      if (!alive.current) return;
      await refreshGroups();
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
            Object.assign(copy,{creatorId:user.id,creatorName:user.username,canManage:true,canEdit:true,groupId:null});
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
    alive.current = true; load();
    const retry = () => { if (ready.current) saveNow().catch(() => {}); };
    const beforeUnload = event => { if (dirty.current.size) { cache(); event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('online', retry); window.addEventListener('beforeunload', beforeUnload);
    return () => { alive.current = false; clearTimeout(timer.current); window.removeEventListener('online', retry); window.removeEventListener('beforeunload', beforeUnload); };
  }, []);

  function addDoc(name = 'Untitled diagram', code = blankCode, groupId = null) {
    if (!ready.current) throw new Error('The diagram library is still loading. Please try again in a moment.');
    if (deactivating) throw new Error('Wait for the current diagram to finish deactivating, then try again.');
    const doc = {...makeDoc(name,code),creatorId:user.id,creatorName:user.username,canManage:true,canEdit:true,groupId,groupName:groups.find(group=>group.id===groupId)?.name || null}; mark(doc);
    setState(s => ({ ...s, docs: [...s.docs, doc], active: doc.id })); schedule();
    return doc;
  }
  function updateDoc(values, documentId = stateRef.current.active) {
    const current = stateRef.current;
    const doc = current.docs.find(doc => doc.id === documentId);
    if (!doc || removed.current.has(doc.id)) return;
    const next = { ...doc, ...values, updated: Date.now() }; mark(next);
    setState(s => ({ ...s, docs: s.docs.map(item => item.id === next.id ? next : item) })); schedule();
  }
  async function removeDoc(id = stateRef.current.active) {
    if (!id || deactivating) return;
    if (stateRef.current.docs.find(doc=>doc.id===id)?.creatorId!==user.id) throw new Error('Only the creator can deactivate this diagram');
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
  async function refreshGroups() {
    const result = await request('/api/groups');
    const items = Array.isArray(result.groups) ? result.groups : [];
    groupRef.current = items;
    if (alive.current) setGroups(items);
    return items;
  }
  async function refreshAccess() {
    const result = await request('/api/diagrams');
    if (!alive.current) return;
    const docs = result.diagrams.map(doc=> {
      const pending=dirty.current.get(doc.id);
      if (!pending) { versions.current.set(doc.id,doc.version); return doc; }
      let draft={...doc,...pending.doc,creatorId:doc.creatorId,creatorName:doc.creatorName,canManage:doc.canManage};
      if(draft.groupId && !groupRef.current.some(group=>group.id===draft.groupId) && doc.canManage) {
        draft={...draft,groupId:null,groupName:null}; mark(draft);
      }
      return draft;
    });
    for(const [id,entry] of Array.from(dirty.current.entries())) {
      if(docs.some(doc=>doc.id===id)) continue;
      if(versions.current.has(id)) {
        // Revoked group access must hide the original, while preserving already-written local work.
        dirty.current.delete(id);versions.current.delete(id);
        const copy={...makeDoc(`${entry.doc.name.slice(0,470)} (recovered draft)`,entry.doc.code),creatorId:user.id,creatorName:user.username,canManage:true,canEdit:true,groupId:null,groupName:null};
        mark(copy);docs.push(copy);
      } else {
        const draft={...entry.doc};
        if(draft.groupId && !groupRef.current.some(group=>group.id===draft.groupId)) {draft.groupId=null;draft.groupName=null;mark(draft);}
        docs.push(draft);
      }
    }
    setState(s=>({...s,docs,active:docs.some(doc=>doc.id===s.active)?s.active:docs[0]?.id || ''}));
    if(dirty.current.size) schedule();
  }
  return { state, setState, loaded, loadError, saveError, saved, deactivating, addDoc, updateDoc, removeDoc, saveNow, retryLoad: load, groups, refreshGroups, refreshAccess };
}
