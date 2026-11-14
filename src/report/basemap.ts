/**
 * Static basemap for the report maps: swisstopo grey tiles stitched into one faded JPEG when the report is
 * generated, so the report stays self-contained (offline, printable). Projection: Web Mercator.
 */
export interface MapView {
  zoom: number;
  /** Top-left corner and size, in world pixels at `zoom`. */
  x0: number; y0: number; width: number; height: number;
}

const TILE = 256;
const tileUrl = (z: number, x: number, y: number) =>
  `https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.swisstlm3d-karte-grau/default/current/3857/${z}/${x}/${y}.png`;

export class Basemap {
  /** Target image width (px): ~150 dpi on the printed A4 map, ~25 tiles for a city. */
  static readonly targetWidth = 1000;
  /** Paper veil over the tiles, so the coloured markers stay the main read. */
  static readonly veil = { color: '#f4f3f1', alpha: 0.68 };
  static readonly timeoutMs = 8000;
  /** Height / width of the map box on the A4 page (176 × 120 mm): the frame is widened to it, so nothing is letterboxed. */
  static readonly aspect = 120 / 176;

  readonly view: MapView;

  /** Frame = 1st–99th percentile of the points plus a margin (outliers would squash the map). */
  constructor(points: { lat: number; lon: number }[], margin = 0.004) {
    const q = (values: number[], f: number) => { const s = [...values].sort((a, b) => a - b); return s[Math.floor(f * (s.length - 1))] ?? 0; };
    const lats = points.map((p) => p.lat), lons = points.map((p) => p.lon);
    const [la0, la1, lo0, lo1] = [q(lats, .01) - margin, q(lats, .99) + margin, q(lons, .01) - margin, q(lons, .99) + margin];
    const width0 = Basemap.x(lo1, 0) - Basemap.x(lo0, 0);
    const zoom = Math.min(17, Math.max(8, Math.ceil(Math.log2(Basemap.targetWidth / width0))));
    let x0 = Basemap.x(lo0, zoom), y0 = Basemap.y(la1, zoom);
    let width = Basemap.x(lo1, zoom) - x0, height = Basemap.y(la0, zoom) - y0;
    if (height > width * Basemap.aspect) { x0 -= (height / Basemap.aspect - width) / 2; width = height / Basemap.aspect; }
    else { y0 -= (width * Basemap.aspect - height) / 2; height = width * Basemap.aspect; }
    this.view = { zoom, x0, y0, width, height };
  }

  static x(lon: number, zoom: number) { return (lon + 180) / 360 * TILE * 2 ** zoom; }
  static y(lat: number, zoom: number) {
    const r = lat * Math.PI / 180;
    return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * TILE * 2 ** zoom;
  }

  /** JPEG data URL of the framed basemap, or undefined (no browser, offline, timeout): the map then draws without it. */
  async image(): Promise<string | undefined> {
    if (typeof document === 'undefined') return undefined;
    const { zoom, x0, y0, width, height } = this.view;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width); canvas.height = Math.round(height);
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;
    const jobs: Promise<boolean>[] = [];
    for (let tx = Math.floor(x0 / TILE); tx <= Math.floor((x0 + width) / TILE); tx++) {
      for (let ty = Math.floor(y0 / TILE); ty <= Math.floor((y0 + height) / TILE); ty++) {
        jobs.push(loadImage(tileUrl(zoom, tx, ty)).then((img) => { ctx.drawImage(img, tx * TILE - x0, ty * TILE - y0); return true; }, () => false));
      }
    }
    const timeout = new Promise<boolean[]>((resolve) => setTimeout(() => resolve([]), Basemap.timeoutMs));
    const loaded = await Promise.race([Promise.all(jobs), timeout]);
    if (!loaded.some(Boolean)) return undefined;
    ctx.globalAlpha = Basemap.veil.alpha; ctx.fillStyle = Basemap.veil.color;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.8);
  }
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous'; // swisstopo sends CORS headers; without it the canvas cannot be exported
    img.onload = () => resolve(img); img.onerror = reject; img.src = src;
  });
}
