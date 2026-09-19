import { Injectable } from '@nestjs/common';
import { renderHtmlToPdf } from '../../common/pdf-browser.js';
import { renderInvoiceHtml, type InvoiceHtmlData } from './invoice-template.js';

@Injectable()
export class InvoicePdfService {
  render(data: InvoiceHtmlData): Promise<Buffer> {
    return renderHtmlToPdf(renderInvoiceHtml(data));
  }
}
