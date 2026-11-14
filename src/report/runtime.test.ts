import { runInNewContext } from 'node:vm';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { PRESETS } from '../model';
import type { Building } from '../model';
import { HtmlReport } from './HtmlReport';
import runtime from './runtime.js?raw';

const css = readFileSync(new URL('./report.css', import.meta.url), 'utf8');

const buildings: Building[] = [{
  id: 'A', name: 'École "Test"', district: 'Centre', use: 'Administration',
  coordinates: [46.2, 6.14], area: 1000, constructionYear: 1960,
  condition: 0.8, annualDecay: 0.01, idc: 800, carbonIntensity: 40, heating: 'Gaz',
}];

function reportRuntime() {
  const report = new HtmlReport({
    buildings, strategies: Object.values(PRESETS), selectedStrategy: 'conservative',
    scopeLabel: 'Parc test', generatedAt: new Date('2026-11-14T10:00:00Z'),
  });
  const data = JSON.stringify(report.payload());
  const listeners = new Map<string, (event: unknown) => void>();
  const root = {
    innerHTML: '',
    addEventListener: (type: string, handler: (event: unknown) => void) => listeners.set(type, handler),
  };
  const anchor = { href: '', download: '', click: vi.fn() };
  const downloads: Blob[] = [];
  const print = vi.fn();
  runInNewContext(runtime, {
    document: {
      documentElement: { outerHTML: report.render() },
      getElementById: (id: string) => id === 'report' ? root : id === 'report-data' ? { textContent: data } : null,
      createElement: (tag: string) => tag === 'a' ? anchor : { style: {} },
      body: { dataset: {}, appendChild: vi.fn() },
    },
    window: { scrollY: 0, scrollTo: vi.fn(), print },
    URL: {
      createObjectURL: (blob: Blob) => { downloads.push(blob); return 'blob:test'; },
      revokeObjectURL: vi.fn(),
    },
    Blob, setTimeout: vi.fn(),
  });
  const click = (dataset: Record<string, string>) => listeners.get('click')!({ target: { closest: () => ({ dataset }) } });
  return { root, anchor, downloads, print, click };
}

describe('Report downloads', () => {
  it('offers PDF, CSV and HTML in the toolbar without opening the building list', () => {
    const { root } = reportRuntime();
    const toolbar = root.innerHTML.slice(0, root.innerHTML.indexOf('</nav>'));
    expect(toolbar).toContain('data-action="pdf"');
    expect(toolbar).toContain('Export PDF');
    expect(toolbar).toContain('data-action="csv"');
    expect(toolbar).toContain('Export CSV');
    expect(toolbar).toContain('Télécharger HTML');
  });

  it('opens the native PDF print dialog without changing the report', () => {
    const { root, click, print, downloads } = reportRuntime();
    const before = root.innerHTML;
    click({ action: 'pdf' });
    expect(print).toHaveBeenCalledOnce();
    expect(root.innerHTML).toBe(before);
    expect(downloads).toEqual([]);
    expect(css).toContain('@media screen and (max-width: 820px)');
    expect(css).toContain('@page { size: A4; margin: 0; }');
    expect(css).toContain('.toolbar, .tip, .table-tools, .list-summary .actions { display: none !important; }');
  });

  it('downloads UTF-8 CSV using the active budget and thermostat with quoted building names', async () => {
    const { click, downloads, anchor } = reportRuntime();
    click({ comfort: '1' });
    click({ budget: 'none' });
    click({ action: 'csv' });
    expect(anchor.click).toHaveBeenCalledOnce();
    expect(anchor.download).toBe('decathlon-geneve-2026-11-14-c1-none.csv');
    expect(downloads[0]!.type).toBe('text/csv;charset=utf-8');
    const csv = await downloads[0]!.text();
    expect(csv).toContain('"Budget : sans plafond"');
    expect(csv).toContain('"Thermostat : thermostat −1 °C"');
    expect(csv).toContain('"École ""Test"""');
    expect(csv.split('\r\n')).toHaveLength(buildings.length + 2);
    expect(new Uint8Array(await downloads[0]!.arrayBuffer()).slice(0, 3)).toEqual(new Uint8Array([0xef, 0xbb, 0xbf]));
  });

  it('preserves the standalone interactive HTML download', async () => {
    const { click, downloads, anchor } = reportRuntime();
    click({ action: 'html' });
    expect(anchor.download).toBe('decathlon-geneve-2026-11-14.html');
    expect(downloads[0]!.type).toBe('text/html;charset=utf-8');
    const html = await downloads[0]!.text();
    expect(html).toContain('id="report-data"');
    expect(html).toContain('data-action="pdf"');
    expect(html).toContain('data-action="csv"');
  });
});
