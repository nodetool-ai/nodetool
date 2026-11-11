import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const web = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
function option(name) {
  const i = args.indexOf(name);
  if (i < 0) return undefined;
  if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error(`Missing value for ${name}`);
  return args[i + 1];
}
const out = option('--out');
if (!out) throw new Error('Usage: node web/scripts/capture-visual-compare.mjs --out DIRECTORY [--url URL]');
const directory = path.resolve(out);
await mkdir(directory, { recursive: true });
await rm(path.join(directory, 'manifest.json'), { force: true });
const allDefinitions = JSON.parse(await readFile(new URL('../src/visual_compare/cases.json', import.meta.url), 'utf8'));
const selectedCase = option('--case');
if (selectedCase && !allDefinitions.some(c => c.id === selectedCase)) throw new Error(`Missing case: ${selectedCase}`);
const definitions = selectedCase ? allDefinitions.filter(c => c.id === selectedCase) : allDefinitions;
const missing = [];
let server;
let browser;
try {
  let url = option('--url');
  if (!url) {
    server = await createServer({ root: web, configFile: path.join(web, 'vite.config.ts'), server: { host: '127.0.0.1', port: 0 } });
    await server.listen();
    url = new URL('visual-compare.html', server.resolvedUrls.local[0]).href;
  }
  browser = await chromium.launch({ headless: true });
  const cases = [];
  const errors = [];
  const fonts = [];
  for (const scheme of ['dark', 'light']) {
    const page = await browser.newPage({ viewport: { width: 1000, height: 1400 }, deviceScaleFactor: 1, locale: 'en-US', colorScheme: scheme, reducedMotion: 'reduce' });
    page.on('pageerror', error => errors.push(error.message));
    page.on('requestfailed', request => errors.push(`${request.url()}: ${request.failure()?.errorText}`));
    const target = new URL(url);
    target.searchParams.set('scheme', scheme);
    await page.goto(target.href, { waitUntil: 'load', timeout: 60000 });
    await page.locator(`[data-fixture-ready="${scheme}"]`).waitFor({ timeout: 60000 });
    fonts.push(await page.evaluate(async () => {
      await document.fonts.ready;
      const faces = [...document.fonts].map(f => ({ family: f.family, weight: f.weight, status: f.status }));
      if (!faces.some(f => f.family.includes('Inter') && f.status === 'loaded')) throw new Error('Production Inter font did not load');
      if (faces.some(f => f.status === 'error')) throw new Error('Production font failed to load');
      return faces;
    }));
    for (const definition of definitions) {
      const fixture = page.locator(`[data-case="${definition.fixture ?? definition.id}"]`);
      const wrapper = definition.selector ? fixture.locator(definition.selector) : fixture;
      await wrapper.waitFor({ timeout: 10000 });
      if (definition.id === 'node-selected' && !await wrapper.evaluate(element => element.closest('.react-flow__node')?.classList.contains('selected'))) throw new Error('Node selection was not applied');
      if (await wrapper.count() !== 1) throw new Error(`Expected exactly one ${definition.id}`);
      if (definition.state === 'focus') await wrapper.locator('input').focus();
      else await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); });
      await page.mouse.move(990, 10);
      if (definition.state === 'focus' && !await wrapper.locator('input').evaluate(input => input === document.activeElement)) throw new Error('Focus state was not applied');
      await wrapper.evaluate(async element => {
        let previous = '';
        let stable = 0;
        for (let i = 0; i < 120; i++) {
          await new Promise(requestAnimationFrame);
          const rect = element.getBoundingClientRect();
          const next = JSON.stringify([rect.x, rect.y, rect.width, rect.height]);
          stable = next === previous ? stable + 1 : 0;
          if (stable >= 5) return;
          previous = next;
        }
        throw new Error('Layout did not stabilize');
      });
      const targetControl = definition.id === 'inspector-field' ? wrapper.locator('.MuiOutlinedInput-root') : wrapper;
      const metrics = await targetControl.evaluate(wrapper => {
        const root = wrapper.matches("[data-case]") ? wrapper.firstElementChild : wrapper;
        if (!root) throw new Error('Missing production component');
        const control = root.querySelector('.MuiOutlinedInput-root') ?? root;
        const text = root.querySelector('input') ?? control;
        const border = control.querySelector('fieldset') ?? control;
        const style = getComputedStyle(control), type = getComputedStyle(text), outline = getComputedStyle(border);
        const rect = control.getBoundingClientRect();
        const padding = getComputedStyle(text);
        const number = value => Number.isFinite(parseFloat(value)) ? parseFloat(value) : null;
        const color = value => {
          const canvas = document.createElement('canvas');
          canvas.width = canvas.height = 1;
          const ctx = canvas.getContext('2d');
          if (!ctx || !CSS.supports('color', value)) return null;
          ctx.fillStyle = value; ctx.fillRect(0, 0, 1, 1);
          return '#' + [...ctx.getImageData(0, 0, 1, 1).data].map(v => v.toString(16).padStart(2, '0')).join('');
        };
        const firstFamily = type.fontFamily.split(',')[0].trim().replace(/^[\"']|[\"']$/g, '');
        const loaded = [...document.fonts].some(face => face.family.replace(/^[\"']|[\"']$/g, '') === firstFamily && face.status === 'loaded');
        if (!loaded || !document.fonts.check(`${type.fontWeight} ${type.fontSize} \"${firstFamily}\"`, text.textContent || 'Sample text')) throw new Error(`Font not loaded: ${firstFamily}`);
        const path = root.querySelector('.react-flow__edge-path');
        if (path) {
          const edgeStyle = getComputedStyle(path);
          return { 'stroke.color': color(edgeStyle.stroke), 'stroke.width': number(edgeStyle.strokeWidth) };
        }
        return { width: rect.width, height: rect.height, 'font.family': firstFamily, 'font.stack': type.fontFamily, 'font.size': number(type.fontSize), 'font.weight': number(type.fontWeight), color: color(type.color), 'background.color': color(style.backgroundColor), 'border.color': color(outline.borderTopColor), 'border.width': number(outline.borderTopWidth), 'border.radius': number(style.borderTopLeftRadius), 'padding.top': number(padding.paddingTop), 'padding.right': number(padding.paddingRight), 'padding.bottom': number(padding.paddingBottom), 'padding.left': number(padding.paddingLeft), gap: number(style.gap) };
      });
      const image = `${scheme}-${definition.id}.png`;
      await targetControl.scrollIntoViewIfNeeded();
      const bounds = await targetControl.boundingBox();
      if (!bounds) throw new Error('Missing capture bounds');
      // Outward integer rounding plus two pixels preserves outlines at fractional positions.
      const captureBounds = { x: Math.max(0, Math.floor(bounds.x) - 2), y: Math.max(0, Math.floor(bounds.y) - 2),
        width: Math.ceil(bounds.x + bounds.width) - Math.max(0, Math.floor(bounds.x) - 2) + 2,
        height: Math.ceil(bounds.y + bounds.height) - Math.max(0, Math.floor(bounds.y) - 2) + 2 };
      await page.screenshot({ path: path.join(directory, image), clip: captureBounds, animations: 'disabled' });
      cases.push({ ...definition, scheme, image, captureBounds, metrics });
    }
    await page.close();
  }
  if (errors.length) throw new Error(errors.join('\n'));
  await writeFile(path.join(directory, 'manifest.json'), JSON.stringify({ version: 1, surface: 'web', environment: { browser: await browser.version(), platform: process.platform, dpr: 1, uiScale: 1, textScale: 1, locale: 'en-US', fonts, missingCoverage: missing }, cases }, null, 2));
  console.log(`Captured ${cases.length} cases in ${directory}. Missing coverage: ${missing.map(c => c.id).join(', ')}`);
} finally {
  await browser?.close();
  await server?.close();
}
