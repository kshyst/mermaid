import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import mermaid from 'mermaid';
import { applySvgBackground, diagramThemes, getDiagramTheme, mermaidThemeConfig } from './diagram-themes';
import Preview from './Preview';

describe('Diagram palettes and export backgrounds', () => {
  it('provides twelve palettes, including eight custom backgrounds', () => {
    expect(diagramThemes).toHaveLength(12);
    expect(new Set(diagramThemes.map(theme => theme.id)).size).toBe(12);
    expect(diagramThemes.filter(theme => theme.config.theme === 'base')).toHaveLength(8);
    expect(diagramThemes.filter(theme => theme.dark)).toHaveLength(4);
    expect(getDiagramTheme('missing').id).toBe('default');
  });
  for (const theme of diagramThemes) {
    it(`initializes the ${theme.name} Mermaid palette`, async () => {
      mermaid.initialize({ ...mermaidThemeConfig(theme.id), startOnLoad: false, securityLevel: 'strict' });
      expect(await mermaid.parse('flowchart TD\n A[Start] --> B[Finish]')).toBeTruthy();
      if (theme.config.theme === 'base') {
        const variables = mermaid.mermaidAPI.getConfig().themeVariables;
        expect(variables.primaryColor).toBe(theme.config.themeVariables.primaryColor);
        expect(variables.background).toBe(theme.background);
        expect(variables.darkMode).toBe(theme.dark);
      }
    });
  }
  it('returns a fresh config so Mermaid cannot mutate stored palettes', () => {
    const config = mermaidThemeConfig('midnight');
    config.themeVariables.primaryColor = '#ff0000';
    expect(mermaidThemeConfig('midnight').themeVariables.primaryColor).toBe('#1e3a5f');
  });
  it('preserves a nonzero viewBox and replaces backgrounds without duplicates', () => {
    const svg = new DOMParser().parseFromString('<svg xmlns="http://www.w3.org/2000/svg" viewBox="-20 -10 400 200"><g id="nodes"/></svg>', 'image/svg+xml').documentElement;
    applySvgBackground(svg, '#0f172a');
    const background = svg.querySelector('[data-diagram-background]');
    expect(background.getAttribute('x')).toBe('-20');
    expect(background.getAttribute('y')).toBe('-10');
    expect(background.getAttribute('width')).toBe('400');
    expect(background.getAttribute('height')).toBe('200');
    expect(svg.firstChild).toBe(background);
    expect(svg.style.backgroundColor).toBe('rgb(15, 23, 42)');
    applySvgBackground(svg, '#ffffff');
    expect(svg.querySelectorAll('[data-diagram-background]')).toHaveLength(1);
    expect(svg.querySelector('[data-diagram-background]').getAttribute('fill')).toBe('#ffffff');
    applySvgBackground(svg, 'transparent');
    expect(svg.querySelector('[data-diagram-background]')).toBeNull();
    expect(svg.style.backgroundColor).toBe('transparent');
    expect(svg.querySelector('#nodes')).not.toBeNull();
  });
});

describe('Preview theme changes', () => {
  let host, root, initialize, render;
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    vi.useFakeTimers();
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    // jsdom has no SVG geometry engine; supply the rendered viewBox dimensions.
    Object.defineProperty(SVGElement.prototype, 'viewBox', { configurable: true, get: () => ({ baseVal: { width: 400, height: 200 } }) });
    initialize = vi.spyOn(mermaid, 'initialize');
    render = vi.spyOn(mermaid, 'render').mockResolvedValue({ svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200"><text x="10" y="20">Diagram</text></svg>' });
    host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  });
  afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
  it('changes only the preview background and rerenders when auto-render is off', async () => {
    const onSvg = vi.fn();
    const props = { code: 'flowchart TD\n A-->B', background: 'dots', onSvg, refresh: 0, live: false };
    await act(async () => { root.render(<Preview {...props} theme="midnight"/>); });
    await act(async () => vi.advanceTimersByTimeAsync(400));
    expect(host.querySelector('.canvas').style.backgroundColor).toBe('rgb(15, 23, 42)');
    expect(host.querySelector('.canvas').classList.contains('diagram-dark')).toBe(true);
    expect(onSvg.mock.calls.at(-1)[0]).toContain('data-diagram-background="true"');
    expect(onSvg.mock.calls.at(-1)[0]).toContain('#0f172a');
    await act(async () => { root.render(<Preview {...props} theme="paper"/>); });
    await act(async () => vi.advanceTimersByTimeAsync(400));
    expect(render).toHaveBeenCalledTimes(2);
    expect(initialize.mock.calls.at(-1)[0].theme).toBe('base');
    expect(host.querySelector('.canvas').style.backgroundColor).toBe('rgb(251, 244, 232)');
    expect(host.querySelector('.canvas').classList.contains('diagram-dark')).toBe(false);
    expect(document.documentElement.style.backgroundColor).toBe('');
    expect(onSvg.mock.calls.at(-1)[0]).toContain('#fbf4e8');
  });
});
