import { describe, expect, it } from 'vitest';
import runtime from './runtime.js?raw';
import { REPORT_TEXTS } from './texts';

describe('report texts', () => {
  it('every text key used by the report exists in texts.ts', () => {
    const used = [...runtime.matchAll(/\bT\('(\w+)'/g)].map((m) => m[1]!);
    expect(used.length).toBeGreaterThan(20);
    expect(used.filter((key) => !(key in REPORT_TEXTS))).toEqual([]);
  });
});
