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
await browser.close();
console.log('icons ok');
