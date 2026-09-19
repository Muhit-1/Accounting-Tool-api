import puppeteer from 'puppeteer';

// Invoice and report PDFs are rendered from HTML that includes user-supplied
// text and a user-supplied logo. To keep that from becoming an SSRF / local
// file read vector (an <img src="http://169.254.169.254/..."> or file:// URL
// in a logo field), every network request the page tries to make is aborted
// — only inline data: URIs and the initial about:blank document are allowed.
// Also caps concurrent Chromium launches so a burst of PDF requests can't
// exhaust memory.
const MAX_CONCURRENT_RENDERS = 2;
const RENDER_TIMEOUT_MS = 30_000;

let active = 0;
const waiting: Array<() => void> = [];

async function acquire(): Promise<void> {
  if (active < MAX_CONCURRENT_RENDERS) {
    active += 1;
    return;
  }
  await new Promise<void>((resolve) => waiting.push(resolve));
}

function release(): void {
  const next = waiting.shift();
  if (next) {
    next(); // hand the slot straight to the next waiter
  } else {
    active -= 1;
  }
}

export async function renderHtmlToPdf(html: string): Promise<Buffer> {
  await acquire();
  try {
    const browser = await puppeteer.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.setJavaScriptEnabled(false);
      await page.setRequestInterception(true);
      page.on('request', (request) => {
        const url = request.url();
        if (url.startsWith('data:') || url === 'about:blank') {
          void request.continue();
        } else {
          void request.abort();
        }
      });
      await page.setContent(html, { waitUntil: 'load', timeout: RENDER_TIMEOUT_MS });
      const pdf = await page.pdf({ format: 'A4', printBackground: true, timeout: RENDER_TIMEOUT_MS });
      return Buffer.from(pdf);
    } finally {
      await browser.close();
    }
  } finally {
    release();
  }
}
