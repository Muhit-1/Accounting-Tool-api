import { Injectable } from '@nestjs/common';
import puppeteer from 'puppeteer';
import { renderReportHtml, type ReportPdfData } from './report-template.js';

@Injectable()
export class ReportPdfService {
  async render(data: ReportPdfData): Promise<Buffer> {
    const html = renderReportHtml(data);
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
