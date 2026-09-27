// Renders assets/icon.svg to the PNG sizes the web manifest needs.
// Usage: node scripts/make-icons.js   (needs Playwright + Chromium)
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

(async () => {
  const svg = fs.readFileSync(path.join(__dirname, '..', 'assets', 'icon.svg'), 'utf8');
  const browser = await chromium.launch();
  for (const size of [192, 512]) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    await page.setContent(`<style>html,body{margin:0}svg{width:${size}px;height:${size}px;display:block}</style>${svg}`);
    await page.screenshot({ path: path.join(__dirname, '..', 'assets', `icon-${size}.png`), omitBackground: true });
    await page.close();
  }
  await browser.close();
  console.log('icons written');
})();
