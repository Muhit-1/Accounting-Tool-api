import { Injectable } from '@nestjs/common';
import puppeteer from 'puppeteer';
import { renderInvoiceHtml, type InvoiceHtmlData } from './invoice-template.js';

@Injectable()
export class InvoicePdfService {
  async render(data: InvoiceHtmlData): Promise<Buffer> {
    const html = renderInvoiceHtml(data);
    const browser = await puppeteer.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'load' });
      const pdf = await page.pdf({ format: 'A4', printBackground: true });
      return Buffer.from(pdf);
    } finally {
      await browser.close();
    }
  }
}
