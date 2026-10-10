import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import mermaid from 'mermaid';
import { webcrypto } from 'node:crypto';
import { createDiagramId } from './id';
import { templates } from './templates';
import App from './App';

vi.mock('./Editor', () => ({ default: ({ code }) => <textarea aria-label="Test source" readOnly value={code}/> }));
vi.mock('./Preview', () => ({ default: ({ code }) => <div data-testid="preview-source">{code}</div> }));

describe('HTTP-compatible diagram IDs', () => {
  it('creates unique valid UUIDs without the secure-context randomUUID method', () => {
    const httpCrypto = { getRandomValues: bytes => webcrypto.getRandomValues(bytes) };
    const ids = Array.from({ length: 100 }, () => createDiagramId(httpCrypto));
    expect(new Set(ids).size).toBe(100);
    for (const id of ids) expect(id).toMatch(/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/);
  });
});

describe('Complete template catalog', () => {
  it('offers thirty distinct examples across sixteen diagram types', () => {
    expect(templates).toHaveLength(30);
    expect(new Set(templates.map(template => template.name)).size).toBe(30);
    expect(new Set(templates.map(template => template.type)).size).toBe(16);
  });
  for (const template of templates) {
    it(`parses ${template.name}`, async () => {
      mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', htmlLabels: false });
      expect(await mermaid.parse(template.code)).toBeTruthy();
    });
  }
});

describe('Template insertion and autosave over HTTP', () => {
  let host, root, saved, serverDocs;
  const existing = { id: '11111111-1111-4111-8111-111111111111', name: 'Existing diagram', code: 'flowchart TD\n A-->B', updated: 1, version: 1 };
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    vi.useFakeTimers();
    const storage = new Map();
    vi.stubGlobal('localStorage', { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value)), clear: () => storage.clear() });
    localStorage.clear(); localStorage.setItem('kshyst-mermaid-sqlite-migrated-v1', 'true');
    vi.stubGlobal('crypto', { getRandomValues: bytes => webcrypto.getRandomValues(bytes) });
    saved = []; serverDocs = [existing];
    vi.stubGlobal('fetch', vi.fn(async (path, options = {}) => {
      if (options.method === 'POST' && path === '/api/diagrams') {
        const doc = JSON.parse(options.body); saved.push(doc);
        return { ok: true, json: async () => ({ diagram: { ...doc, version: 1 } }) };
      }
      return { ok: true, json: async () => ({ diagrams: serverDocs }) };
    }));
    host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  });
  afterEach(async () => { if (root) await act(async () => root.unmount()); host?.remove(); vi.useRealTimers(); vi.unstubAllGlobals(); });
  async function click(label) {
    const button = Array.from(host.querySelectorAll('button')).find(button => button.getAttribute('aria-label') === label || button.textContent.trim() === label);
    expect(button, label).toBeTruthy();
    await act(async () => button.click());
  }
  it('opens complete source, preserves the existing document, and persists the new UUID', async () => {
    await act(async () => root.render(<App/>));
    await click('Explore templates');
    await click('Use Checkout and payment template');
    const template = templates.find(template => template.name === 'Checkout and payment');
    expect(host.querySelector('[aria-label="Test source"]').value).toBe(template.code);
    expect(host.querySelector('[data-testid="preview-source"]').textContent).toBe(template.code);
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    expect(host.textContent).toContain('Existing diagram');
    await act(async () => vi.advanceTimersByTimeAsync(600));
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ name: template.name, code: template.code });
    expect(saved[0].id).toMatch(/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/);
    expect(host.textContent).toContain('All changes saved');
  });
  it('keeps template search separate from the sidebar search', async () => {
    await act(async () => root.render(<App/>));
    const search = host.querySelector('[aria-label="Search diagrams"]');
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(search, 'Existing');
      search.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await click('Explore templates');
    const templateSearch = host.querySelector('[aria-label="Search templates"]');
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(templateSearch, 'OAuth');
      templateSearch.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(host.querySelectorAll('.template-card')).toHaveLength(1);
    await click('Use OAuth authorization flow template');
    expect(host.querySelector('[aria-label="Search diagrams"]').value).toBe('Existing');
    expect(host.querySelector('[aria-label="Test source"]').value).toContain('code and state');
  });
  it('offers templates when the database library is empty', async () => {
    serverDocs = [];
    await act(async () => root.render(<App/>));
    await click('Explore templates');
    await click('Use Commerce database template');
    expect(host.querySelector('[aria-label="Test source"]').value).toContain('PURCHASE_ORDER');
    await act(async () => vi.advanceTimersByTimeAsync(600));
    expect(saved).toHaveLength(1);
  });
  it('filters by diagram type and opens the matching example', async () => {
    await act(async () => root.render(<App/>));
    await click('Explore templates');
    const filter = host.querySelector('[aria-label="Filter template type"]');
    await act(async () => { filter.value = 'Quadrant'; filter.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(host.querySelectorAll('.template-card')).toHaveLength(1);
    await click('Use Feature prioritization matrix template');
    expect(host.querySelector('[aria-label="Test source"]').value).toContain('quadrantChart');
  });
  it('keeps the dialog open and shows an error if creation fails', async () => {
    await act(async () => root.render(<App/>));
    await click('Explore templates');
    vi.stubGlobal('crypto', {});
    await click('Use Checkout and payment template');
    expect(host.querySelector('[role="dialog"]')).not.toBeNull();
    expect(host.querySelector('[role="status"]').textContent).toContain('cannot generate diagram IDs');
    expect(saved).toHaveLength(0);
  });
  it('keeps templates usable after deactivating the last document', async () => {
    await act(async () => root.render(<App/>));
    await click('Document actions');
    await click('Delete diagram');
    await click('Delete diagram');
    expect(host.querySelector('.library-empty')).not.toBeNull();
    await click('Explore templates');
    await click('Use Incident response template');
    expect(host.querySelector('[aria-label="Test source"]').value).toContain('Monitoring alert');
  });
});
