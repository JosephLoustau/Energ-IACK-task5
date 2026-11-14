import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadBuildings, parseBuildings } from './data';
import { BASE_YEAR, conditionAtAge } from './model';

const building = {
  id: 'TEST-1', name: 'Bâtiment test', district: 'Test', use: 'Éducation',
  coordinates: [46.2, 6.14], area: 1000, constructionYear: 2000, lastWorkYear: null,
  idc: 450, carbonIntensity: 25, heating: 'Gaz',
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('runtime building data', () => {
  it('fetches the public dataset under the deployment base URL and models its condition', async () => {
    vi.stubEnv('BASE_URL', '/decathlon/');
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify([building])));
    vi.stubGlobal('fetch', fetch);
    const controller = new AbortController();
    const buildings = await loadBuildings(controller.signal);
    expect(fetch).toHaveBeenCalledWith('/decathlon/data/buildings.generated.json', {
      signal: controller.signal, cache: 'no-store',
    });
    expect(buildings).toHaveLength(1);
    expect(buildings[0]).toMatchObject({
      id: 'TEST-1', condition: conditionAtAge(BASE_YEAR - 2000), effectiveAge: BASE_YEAR - 2000,
    });
  });

  it('fails explicitly when the public data is missing, with no fallback dataset', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('', { status: 404 }));
    vi.stubGlobal('fetch', fetch);
    await expect(loadBuildings()).rejects.toThrow('HTTP 404');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('propagates network errors and cancellation', async () => {
    const error = new DOMException('Aborted', 'AbortError');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(error));
    await expect(loadBuildings()).rejects.toBe(error);
  });

  it('rejects invalid JSON responses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>Missing file</html>')));
    await expect(loadBuildings()).rejects.toThrow();
  });

  it.each([null, {}, [], [null], [{ ...building, area: 0 }], [{ ...building, idc: NaN }],
    [{ ...building, coordinates: [46.2] }], [{ ...building, coordinates: [100, 6] }],
    [{ ...building, heating: 'unknown system' }], [{ ...building, use: 'unknown use' }],
    [{ ...building, height: 'invalid' }], [{ ...building, imputed: [1] }],
  ])('rejects invalid dataset %j', (data) => {
    expect(() => parseBuildings(data)).toThrow();
  });

  it('rejects duplicate building IDs', () => {
    expect(() => parseBuildings([building, building])).toThrow('en double');
  });
});
