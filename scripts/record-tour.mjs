/**
 * Enregistre une vidéo de démonstration à partir d'un scénario (liste d'actions).
 *
 *   npm run dev                                   (dans un autre terminal)
 *   npm run video                                 → videos/demo.webm  (scénario par défaut)
 *   npm run video -- scripts/demo/autre.mjs       → videos/autre.webm
 *
 * Variables facultatives : APP_URL (défaut http://127.0.0.1:5173), WIDTH / HEIGHT (défaut 1920×1080),
 * PAUSE (pause après chaque action, défaut 400 ms), LOAD_MS (chargement avant le début de la vidéo, défaut 10000 ms),
 * HEADED=1 pour voir le navigateur pendant l'enregistrement.
 *
 * Le format des actions est documenté dans scripts/demo/scenario.mjs.
 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const scenarioFile = path.resolve(process.argv[2] ?? 'scripts/demo/scenario.mjs');
const { default: scenario } = await import(pathToFileURL(scenarioFile).href);
const url = process.env.APP_URL ?? 'http://127.0.0.1:5173';
const size = { width: Number(process.env.WIDTH ?? 1920), height: Number(process.env.HEIGHT ?? 1080) };
const defaultPause = Number(process.env.PAUSE ?? 400);
const loadMs = Number(process.env.LOAD_MS ?? 10000);
const outDir = path.resolve('videos');
const target = path.join(outDir, `${path.basename(scenarioFile, path.extname(scenarioFile)).replace(/^scenario$/, 'demo')}.webm`);

/**
 * Injecté dans la page avant son chargement :
 * - faux curseur et sous-titres (la vidéo Playwright n'affiche pas le vrai pointeur) ;
 * - window.open remplacé : le rapport exporté s'affiche dans un cadre plein écran au-dessus de l'app
 *   au lieu d'un nouvel onglet, pour rester dans la vidéo.
 */
const overlay = () => {
  // Dans le cadre du rapport : relayer les clics au faux curseur de la page principale (le cadre couvre tout l'écran).
  if (window.top !== window) {
    const relay = (name) => addEventListener(name, (e) => window.top.__demoPointer?.[name](e.clientX, e.clientY), true);
    ['mousedown', 'mouseup'].forEach(relay);
    return;
  }
  const install = () => {
    const style = document.createElement('style');
    style.textContent = `
      #demo-cursor { position: fixed; left: 0; top: 0; z-index: 2147483647; pointer-events: none; will-change: transform; }
      #demo-cursor > i { display: block; width: 22px; height: 22px; margin: -3px 0 0 -3px; transform-origin: 3px 3px;
        background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M3 2l7 19 2.6-7.4L20 11z' fill='%23111' stroke='white' stroke-width='1.6' stroke-linejoin='round'/%3E%3C/svg%3E") no-repeat;
        filter: drop-shadow(0 1px 2px #0006); transition: transform .12s ease-out; }
      #demo-cursor.down > i { transform: scale(.82); }
      .demo-ripple { position: fixed; z-index: 2147483646; width: 44px; height: 44px; margin: -22px 0 0 -22px; border-radius: 50%;
        border: 3px solid #e3001b; pointer-events: none; animation: demo-ripple .55s ease-out forwards; }
      @keyframes demo-ripple { from { transform: scale(.3); opacity: 1; } to { transform: scale(1.4); opacity: 0; } }
      #demo-caption { position: fixed; z-index: 2147483645; left: 50%; bottom: 48px; transform: translate(-50%, 20px); max-width: 70vw;
        padding: 14px 26px; border-radius: 12px; background: #111d; color: #fff; font: 600 24px/1.35 system-ui, sans-serif;
        text-align: center; pointer-events: none; opacity: 0; transition: opacity .35s, transform .35s; }
      #demo-caption.show { opacity: 1; transform: translate(-50%, 0); }
      #demo-report { position: fixed; inset: 0; z-index: 2147483600; width: 100vw; height: 100vh; border: 0; background: #fff;
        animation: demo-report-in .35s ease-out; }
      @keyframes demo-report-in { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: none; } }`;
    document.head.append(style);
    const cursor = Object.assign(document.createElement('div'), { id: 'demo-cursor' });
    const caption = Object.assign(document.createElement('div'), { id: 'demo-caption' });
    cursor.append(document.createElement('i'));
    document.body.append(cursor, caption);
    // Le faux curseur est animé par le compositeur (Web Animations sur `transform`), et non par les événements
    // de la vraie souris : le mouvement reste fluide même quand l'app est occupée (carte, recalcul du parc).
    let at = { x: innerWidth / 2, y: innerHeight / 2 }, current = null, side = 1;
    const translate = (x, y) => `translate3d(${x}px, ${y}px, 0)`;
    const place = (x, y) => { at = { x, y }; cursor.style.transform = translate(x, y); };
    place(at.x, at.y);
    const pointer = window.__demoPointer = {
      place,
      /** Glisse jusqu'à (x, y) ; `curve` : légère courbe (comme une main), alternativement d'un côté puis de l'autre. */
      glide(x, y, duration, curve = true) {
        current?.cancel();
        const from = at, dx = x - from.x, dy = y - from.y, distance = Math.hypot(dx, dy);
        const bend = curve ? (side = -side) * Math.min(70, distance * 0.12) : 0;
        const cx = from.x + dx / 2 - (dy / (distance || 1)) * bend, cy = from.y + dy / 2 + (dx / (distance || 1)) * bend;
        const ease = (t) => (t < .5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2); // départ et arrivée en douceur
        const frames = Array.from({ length: 41 }, (_, i) => {
          const u = ease(i / 40), a = (1 - u) ** 2, b = 2 * (1 - u) * u, c = u ** 2; // courbe de Bézier quadratique
          return { transform: translate(a * from.x + b * cx + c * x, a * from.y + b * cy + c * y) };
        });
        place(x, y); // position finale (appliquée dès que l'animation se termine)
        current = cursor.animate(frames, { duration, easing: 'linear' });
        return current.finished.then(() => {}, () => {});
      },
      mousedown(x, y) {
        cursor.classList.add('down');
        const ripple = Object.assign(document.createElement('div'), { className: 'demo-ripple' });
        ripple.style.left = `${x}px`; ripple.style.top = `${y}px`;
        document.body.append(ripple); setTimeout(() => ripple.remove(), 600);
      },
      mouseup() { cursor.classList.remove('down'); },
    };
    for (const name of ['mousedown', 'mouseup']) addEventListener(name, (e) => pointer[name](e.clientX, e.clientY), true);
    /** Défilement doux d'une fenêtre (page ou rapport) jusqu'à `top`. */
    window.__demoScroll = (win, top, duration) => new Promise((resolve) => {
      const from = win.scrollY, start = performance.now(), ease = (t) => -(Math.cos(Math.PI * t) - 1) / 2;
      const frame = (now) => {
        const t = Math.min(1, (now - start) / duration);
        win.scrollTo(0, from + (top - from) * ease(t));
        if (t < 1) requestAnimationFrame(frame); else resolve();
      };
      requestAnimationFrame(frame);
    });
    window.open = () => {
      document.getElementById('demo-report')?.remove();
      const frame = Object.assign(document.createElement('iframe'), { id: 'demo-report', title: 'Rapport' });
      document.body.append(frame);
      // Imite l'objet fenêtre utilisé par HtmlReport.open() : document.write puis location.href.
      return { document: frame.contentDocument, location: { set href(url) { frame.src = url; } }, close: () => frame.remove() };
    };
    window.__demoCaption = (text) => {
      if (text) caption.textContent = text;
      caption.classList.toggle('show', Boolean(text));
    };
  };
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', install); else install();
};

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch({
  headless: !process.env.HEADED,
  // Rendu WebGL par le GPU : sans ces options, la carte 3D est dessinée en logiciel et tout ralentit.
  args: process.env.NO_GPU ? [] : ['--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=gl'],
});
const context = await browser.newContext({ viewport: size });
await context.addInitScript(overlay);
const page = await context.newPage();

let mouse = { x: size.width / 2, y: size.height / 2 };
const speed = Number(process.env.CURSOR_SPEED ?? 1); // > 1 : plus rapide
/** Durée d'un déplacement : courte pour quelques pixels, jusqu’à ~1,8 s pour traverser l’écran. */
const glideTime = (distance) => Math.min(1800, 450 + distance * 0.95) / speed;
/**
 * Fait glisser le faux curseur (animé dans la page) et déplace la vraie souris en parallèle (survols, clics).
 * La vraie souris fait peu de pas : chaque pas déclenche du travail dans l'app (survol de la carte…).
 * `straight` : trajet rectiligne (curseur de seuil, glisser de carte) ; `steps` : nombre de pas réels.
 */
async function moveTo(x, y, duration, { straight = false, steps } = {}) {
  const distance = Math.hypot(x - mouse.x, y - mouse.y);
  if (distance < 1) return;
  duration ??= glideTime(distance);
  steps ??= Math.max(2, Math.round(duration / 150));
  const real = (async () => {
    for (let i = 1; i <= steps; i++) {
      await page.waitForTimeout(duration / steps);
      await page.mouse.move(mouse.x + (x - mouse.x) * i / steps, mouse.y + (y - mouse.y) * i / steps);
    }
  })();
  await Promise.all([page.evaluate(([x, y, d, c]) => window.__demoPointer.glide(x, y, d, c), [x, y, duration, !straight]), real]);
  mouse = { x, y };
}
/**
 * Position à l'écran d'un point [longitude, latitude] de la carte, ou du bâtiment sélectionné ('selected'). L'instance MapLibre n'est pas exposée par l'app :
 * on la retrouve dans l'arbre React, à partir de l'élément de la carte (ne dépend que du ref `mapRef`).
 */
async function mapPoint(on) {
  return page.evaluate(async (on) => {
    const el = document.querySelector('.maplibregl-map');
    let fiber = el[Object.keys(el).find((k) => k.startsWith('__reactFiber'))], map;
    for (; fiber && !map; fiber = fiber.return)
      for (let hook = fiber.memoizedState; hook && !map; hook = hook.next)
        if (typeof hook.memoizedState?.current?.project === 'function') map = hook.memoizedState.current;
    if (!map) throw new Error('carte MapLibre introuvable');
    let lngLat = on;
    if (on === 'selected') {
      // Bâtiment sélectionné : son identifiant est dans le filtre du halo de sélection ; on centre la carte dessus.
      const id = map.getFilter('selected-halo')?.[2];
      const feature = map.querySourceFeatures('buildings', { filter: ['==', ['get', 'id'], id] })[0];
      if (!id || !feature) throw new Error('aucun bâtiment sélectionné visible sur la carte');
      lngLat = feature.geometry.coordinates;
      map.easeTo({ center: lngLat, duration: 900 });
      await new Promise((resolve) => map.once('moveend', resolve));
    }
    const point = map.project(lngLat), box = map.getCanvas().getBoundingClientRect();
    return { x: box.left + point.x, y: box.top + point.y };
  }, on);
}
/** Défilement doux de la page (ou du rapport) pour amener `top` (px dans le document) en haut de l'écran. */
async function scrollWindow(where, top, duration = 1200) {
  await page.evaluate(([inReport, top, d]) => {
    const win = inReport ? document.getElementById('demo-report').contentWindow : window;
    return window.__demoScroll(win, top, d);
  }, [where === 'report', top, duration]);
}
/** Élément de la page, ou du rapport exporté si l'action porte `in: 'report'`. */
const locate = (selector, where) => (where === 'report' ? page.frameLocator('#demo-report') : page).locator(selector).first();
async function center(selector, where) {
  const element = locate(selector, where);
  await element.waitFor({ state: 'visible' });
  await element.scrollIntoViewIfNeeded();
  const box = await element.boundingBox();
  return { element, box, x: box.x + box.width / 2, y: box.y + box.height / 2 };
}
async function clickAt(x, y) {
  await moveTo(x, y);
  await page.mouse.down(); await page.waitForTimeout(90); await page.mouse.up();
}
const tourButton = (name) => page.locator('.tour-popover').getByRole('button', { name });

const actions = {
  async wait() {},
  async caption(step) { await page.evaluate((text) => window.__demoCaption(text), step.caption); },
  async tour({ tour, fast }) {
    if (tour === 'start') {
      const { x, y } = await center('role=button[name="Visite guidée"]');
      await clickAt(x, y);
      await page.locator('.tour-popover').waitFor();
      return;
    }
    const name = { next: /Suivant|Terminer/, prev: /Précédent/, end: /Terminer|Fermer la visite/ }[tour];
    if (!name) throw new Error(`tour: valeur inconnue « ${tour} »`);
    const button = tourButton(name).first();
    if (fast) { await button.dispatchEvent('click'); return; } // le curseur reste où il est
    const box = await button.boundingBox();
    await clickAt(box.x + box.width / 2, box.y + box.height / 2);
  },
  async click(step) {
    const { click, offset, fast } = step;
    // Clic direct par événement, sans bouger la souris : le faux curseur reste où il est, sans saut ni onde.
    if (fast) { await locate(click, step.in).dispatchEvent('click'); return; }
    const { box, x, y } = await center(click, step.in);
    await clickAt(offset ? box.x + offset[0] : x, offset ? box.y + offset[1] : y);
  },
  async hover(step) { const { x, y } = await center(step.hover, step.in); await moveTo(x, y); },
  async move({ move }) { await moveTo(move[0], move[1]); },
  async type(step) {
    const { type, text, delay = 50 } = step;
    const { x, y, element } = await center(type, step.in);
    await clickAt(x, y);
    await element.fill('');
    await page.keyboard.type(text, { delay });
  },
  async key({ key }) { await page.keyboard.press(key); },
  async slider(step) {
    const { slider, to, duration = 1200 } = step;
    const { element, box } = await center(slider, step.in);
    const [min, max, value] = await element.evaluate((input) => [input.min, input.max, input.value].map(Number));
    const xOf = (v) => box.x + 8 + ((v - min) / (max - min)) * (box.width - 16); // 8 px : demi-largeur du curseur
    const y = box.y + box.height / 2;
    await moveTo(xOf(value), y);
    await page.mouse.down();
    // Peu de positions réelles : chaque valeur relance le calcul de tout le parc, qui prend du temps.
    // Le faux curseur, lui, glisse en continu.
    await moveTo(xOf(to), y, duration, { straight: true, steps: Math.max(2, Math.min(12, Math.round(duration / 100))) });
    await page.mouse.up();
  },
  async zoom({ zoom, at = '[data-tour="map"] canvas', on, duration = 800 }) {
    let { x, y } = await center(at);
    if (on) ({ x, y } = await mapPoint(on));
    await moveTo(x, y);
    // Multiple de 4.000244140625 : MapLibre reconnaît alors une vraie molette (et pas un pavé tactile),
    // ce qui rend le zoom identique dans les deux sens, quelle que soit la vitesse de rendu.
    // 1 unité ≈ 1 niveau de zoom (≈ 5 crans de molette).
    const delta = 4.000244140625 * 30, ticks = Math.max(1, Math.round(Math.abs(zoom) * 5.5));
    for (let i = 0; i < ticks; i++) { await page.mouse.wheel(0, zoom > 0 ? -delta : delta); await page.waitForTimeout(duration / ticks); }
  },
  async drag({ drag, by, duration = 900 }) {
    const { x, y } = await center(drag);
    await moveTo(x, y);
    await page.mouse.down();
    await moveTo(x + by[0], y + by[1], duration, { straight: true, steps: Math.max(2, Math.round(duration / 30)) });
    await page.mouse.up();
  },
  /** Amène l'élément en haut de l'écran (`offset` px sous le bord, par défaut sous la barre d'outils du rapport). */
  async scroll(step) {
    const { scroll, offset = step.in === 'report' ? 64 : 16, duration = 1200 } = step;
    const frame = step.in === 'report' ? page.frame({ url: /^blob:/ }) : page.mainFrame();
    const top = await frame.locator(scroll).first().evaluate((el, offset) => el.getBoundingClientRect().top + scrollY - offset, offset);
    await scrollWindow(step.in, top, duration);
  },
  async scrollBy(step) {
    const frame = step.in === 'report' ? page.frame({ url: /^blob:/ }) : page.mainFrame();
    const top = await frame.evaluate((by) => scrollY + by, step.scrollBy);
    await scrollWindow(step.in, top, step.duration ?? 1200);
  },
  async report({ report }) {
    if (report === 'open') {
      const { x, y } = await center('[data-tour="export"]');
      await clickAt(x, y);
      await page.waitForFunction(() => document.getElementById('demo-report')?.src.startsWith('blob:'), null, { timeout: 60_000 });
      await page.frameLocator('#demo-report').locator('body > *').first().waitFor();
    } else if (report === 'close') {
      await page.evaluate(() => document.getElementById('demo-report')?.remove());
    } else throw new Error(`report: valeur inconnue « ${report} »`);
  },
  async run(step) { await step.run(page); },
};

await page.goto(url);
await page.locator('[data-tour="map"] canvas').first().waitFor({ timeout: 60_000 });
await page.waitForTimeout(loadMs); // laisse charger les données et la carte, hors de la vidéo
await page.screencast.start({ path: target, size });
const start = Date.now();
const clock = () => { const t = Math.round((Date.now() - start) / 1000); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };
for (const [index, step] of scenario.entries()) {
  const kind = Object.keys(actions).find((name) => name in step && name !== 'wait') ?? (typeof step.wait === 'number' ? 'wait' : null);
  if (!kind) throw new Error(`Étape ${index + 1} : action inconnue ${JSON.stringify(step)}`);
  console.log(`${clock()}  ${String(index + 1).padStart(3)}. ${kind} ${JSON.stringify(step[kind]) ?? ''}`);
  try { await actions[kind](step); }
  catch (error) { throw new Error(`Étape ${index + 1} (${JSON.stringify(step)}) : ${error.message}`); }
  await page.waitForTimeout(kind === 'wait' ? step.wait : step.wait ?? defaultPause);
}

await page.screencast.stop(); // finalise le fichier vidéo
await browser.close();
console.log(`Vidéo enregistrée : ${target}`);
