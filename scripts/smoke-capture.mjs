// Capture one line through the real UI (the Inbox rapid log → its server action) and wait until
// it is listed. usage: node scripts/smoke-capture.mjs <base-url> <text>
// Uses an installed Chrome (playwright-core downloads no browser); CHROME_PATH overrides.
import { chromium } from 'playwright-core';

const [base, text] = process.argv.slice(2);
const browser = await chromium.launch(
  process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: 'chrome' },
);
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  await page.goto(`${base}/inbox`);
  await page.fill('#rapid-log', text);
  await page.press('#rapid-log', 'Enter');
  // Capture shorthand (@context, !prio, ^date, #tag) is parsed out of the listed text.
  const listed = text.split(/\s[@!^#]/)[0];
  await page.getByText(listed).filter({ visible: true }).first().waitFor({ timeout: 10_000 });
  console.log(`captured: ${text}`);
} finally {
  await browser.close();
}
