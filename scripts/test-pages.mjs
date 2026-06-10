import { chromium } from "playwright";

const PAGES = [
  { name: "Dashboard", url: "http://localhost:3000/" },
  { name: "Billing", url: "http://localhost:3000/billing" },
  { name: "Demo", url: "http://localhost:3000/demo" },
  { name: "Integrations", url: "http://localhost:3000/settings/integrations" },
  { name: "Org Detail", url: "http://localhost:3000/org/93a0fb2d-6390-48a0-a0e7-84fd8a0a65fb" },
  { name: "Org Settings", url: "http://localhost:3000/org/93a0fb2d-6390-48a0-a0e7-84fd8a0a65fb/settings" },
];

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  let passed = 0;
  let failed = 0;

  for (const { name, url } of PAGES) {
    try {
      const response = await page.goto(url, { waitUntil: "networkidle", timeout: 20000 });
      const status = response?.status() ?? 0;
      const title = await page.title();

      if (status >= 200 && status < 400) {
        // Check for runtime error overlay
        const errorText = await page.locator("text=Runtime Error").count();
        if (errorText > 0) {
          console.log(`❌ ${name} (${url}) → HTTP ${status} — Runtime Error overlay detected`);
          failed++;
        } else {
          // Get key content to verify page actually rendered
          const bodyText = await page.locator("body").innerText();
          const preview = bodyText.slice(0, 120).replace(/\n/g, " ");
          console.log(`✅ ${name} (${url}) → HTTP ${status} — "${preview}..."`);
          passed++;
        }
      } else {
        console.log(`❌ ${name} (${url}) → HTTP ${status}`);
        failed++;
      }
    } catch (err) {
      console.log(`❌ ${name} (${url}) → ERROR: ${err.message}`);
      failed++;
    }
  }

  console.log(`\n${passed} passed, ${failed} failed, ${PAGES.length} total`);
  await browser.close();
  process.exit(failed > 0 ? 1 : 0);
}

main();
