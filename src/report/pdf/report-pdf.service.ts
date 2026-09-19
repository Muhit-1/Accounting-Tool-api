import { Injectable } from '@nestjs/common';
import { renderHtmlToPdf } from '../../common/pdf-browser.js';
import { renderReportHtml, type ReportPdfData } from './report-template.js';

@Injectable()
export class ReportPdfService {
  render(data: ReportPdfData): Promise<Buffer> {
    return renderHtmlToPdf(renderReportHtml(data));
  }
}
