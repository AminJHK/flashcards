// public/icon.svg로 PWA용 PNG 아이콘을 만든다. 실행: node scripts/icons.mjs
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';

const svg = readFileSync(new URL('../public/icon.svg', import.meta.url), 'utf8');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage();

async function render(file, size, { maskable = false, bg = '#2F5BEA' } = {}) {
  await page.setViewportSize({ width: size, height: size });
  // maskable: 안전 영역(가운데 80%) 안에 들어가도록 줄이고 배경을 채운다
  const inner = maskable ? Math.round(size * 0.8) : size;
  const body = maskable
    ? `<div style="width:${size}px;height:${size}px;background:${bg};display:flex;align-items:center;justify-content:center">${svg.replace('<svg ', `<svg width="${inner}" height="${inner}" `).replace('rx="112"', 'rx="0"')}</div>`
    : svg.replace('<svg ', `<svg width="${size}" height="${size}" `);
  await page.setContent(`<html><body style="margin:0;background:transparent">${body}</body></html>`);
  await page.screenshot({ path: new URL(`../public/${file}`, import.meta.url).pathname, omitBackground: !maskable });
}

await render('icon-192.png', 192);
await render('icon-512.png', 512);
await render('icon-maskable-512.png', 512, { maskable: true });
await render('apple-touch-icon.png', 180, { maskable: true });
// 안드로이드 앱 (android/): 런처 아이콘(옛 모양·동그라미·적응형 앞면)과 시작 화면
import { readdirSync } from 'node:fs';
const res = new URL('../android/app/src/main/res/', import.meta.url).pathname;
const BG = '#2F5BEA';
const cardOnly = svg.replace(/<rect width="512" height="512"[^>]*\/>/, '');
async function shot(path, w, h, html) {
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(`<html><body style="margin:0;background:transparent">${html}</body></html>`);
  await page.screenshot({ path, omitBackground: true });
}
const sized = (s, size) => s.replace('<svg ', `<svg width="${size}" height="${size}" `);
for (const [dpi, size] of [['mdpi', 48], ['hdpi', 72], ['xhdpi', 96], ['xxhdpi', 144], ['xxxhdpi', 192]]) {
  const dir = `${res}mipmap-${dpi}/`;
  await shot(`${dir}ic_launcher.png`, size, size, sized(svg, size));
  await shot(`${dir}ic_launcher_round.png`, size, size, `<div style="width:${size}px;height:${size}px;border-radius:50%;overflow:hidden">${sized(svg.replace('rx="112"', 'rx="0"'), size)}</div>`);
  // 적응형 아이콘 앞면: 108dp 캔버스, 가운데 66%가 안전 영역
  const fg = Math.round((size * 108) / 48);
  const inner = Math.round(fg * 0.62);
  await shot(`${dir}ic_launcher_foreground.png`, fg, fg, `<div style="width:${fg}px;height:${fg}px;display:flex;align-items:center;justify-content:center">${sized(cardOnly, inner)}</div>`);
}
for (const d of readdirSync(res).filter((d) => d.startsWith('drawable'))) {
  const file = `${res}${d}/splash.png`;
  let buf;
  try {
    buf = readFileSync(file);
  } catch {
    continue;
  }
  const w = buf.readUInt32BE(16);
  const h = buf.readUInt32BE(20);
  const icon = Math.round(Math.min(w, h) * 0.32);
  await shot(file, w, h, `<div style="width:${w}px;height:${h}px;background:${BG};display:flex;align-items:center;justify-content:center">${sized(cardOnly, icon)}</div>`);
}

await browser.close();
console.log('icons ok');
