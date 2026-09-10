import { BadRequestException, Injectable } from '@nestjs/common';
import Tesseract from 'tesseract.js';
import * as chrono from 'chrono-node';
import { createCanvas } from '@napi-rs/canvas';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { BusinessService } from '../business/business.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AccessPermission } from '../generated/prisma/client.js';

// Below this many non-whitespace characters, a PDF's embedded text layer is
// treated as absent — the PDF is almost certainly a scanned/photographed
// page with no real text, just an image, so it needs OCR instead.
const MIN_MEANINGFUL_TEXT_LENGTH = 15;
const MAX_PDF_PAGES_FOR_TEXT = 20;

// Lines that usually sit right next to the figure the user actually cares
// about on an invoice/receipt — checked in this order so "Total" style
// lines win over an incidental larger number elsewhere on the page.
const AMOUNT_KEYWORDS = [/grand\s*total/i, /balance\s*due/i, /amount\s*due/i, /total\s*due/i, /\btotal\b/i];

// Matches an entire run of digits/commas/dots as one token — e.g. "1,234.56",
// "1234.56", "1234", "9.75" — with an optional currency symbol/code before
// it. Capturing the whole run (rather than trying to distinguish
// thousands-groups from the decimal in the regex itself) avoids the regex
// alternation greedily stopping after 3 digits on a plain 4+ digit integer
// like "2026"; parseAmountToken below figures out the decimal point.
const AMOUNT_PATTERN = /(?:[$€£¥]|BDT|USD|EUR|CNY|TK|৳)?\s?(\d[\d,. ]*\d|\d)/g;

function parseAmountToken(token: string): number | null {
  // Normalize "1,234.56" and "1.234,56"-style separators down to a plain
  // float: strip thousands separators, keep the last "." or "," as the
  // decimal point.
  const cleaned = token.replace(/\s/g, '');
  const lastDot = cleaned.lastIndexOf('.');
  const lastComma = cleaned.lastIndexOf(',');
  const decimalIndex = Math.max(lastDot, lastComma);
  let normalized: string;
  if (decimalIndex === -1) {
    normalized = cleaned;
  } else {
    const intPart = cleaned.slice(0, decimalIndex).replace(/[.,]/g, '');
    const fracPart = cleaned.slice(decimalIndex + 1).replace(/[.,]/g, '');
    normalized = `${intPart}.${fracPart}`;
  }
  const value = Number(normalized);
  return Number.isFinite(value) && value > 0 ? value : null;
}

// A bare 4-digit whole number in a plausible calendar-year range is almost
// always part of a date, not the amount — matters for the keyword-less
// fallback below, where a year would otherwise usually outrank the real
// (smaller) total.
function looksLikeYear(token: string, value: number): boolean {
  return /^\d{4}$/.test(token.trim()) && value >= 1900 && value <= 2099;
}

// excludeSpan is the exact substring chrono matched as the invoice's date
// (see extractDateSpan) — masked out before scanning so a day/year number
// from the date line (e.g. the "12" in "12 August 2026") can't outrank the
// real total in the keyword-less fallback below.
export function extractAmount(text: string, excludeSpan?: string | null): number | null {
  const scanText = excludeSpan ? text.replace(excludeSpan, ' ') : text;
  const lines = scanText.split('\n');

  for (const keyword of AMOUNT_KEYWORDS) {
    for (const line of lines) {
      if (!keyword.test(line)) continue;
      const matches = [...line.matchAll(AMOUNT_PATTERN)].map((m) => parseAmountToken(m[1])).filter((n): n is number => n !== null);
      if (matches.length > 0) {
        return matches[matches.length - 1];
      }
    }
  }

  // Fallback: the largest plausible amount anywhere on the page — usually
  // the total on a simple receipt with no explicit "Total" label the OCR
  // could pick up cleanly.
  const all = [...scanText.matchAll(AMOUNT_PATTERN)]
    .map((m) => ({ token: m[1], value: parseAmountToken(m[1]) }))
    .filter((m): m is { token: string; value: number } => m.value !== null && !looksLikeYear(m.token, m.value));
  if (all.length === 0) return null;
  return Math.max(...all.map((m) => m.value));
}

// Labels that typically introduce the other party's name on an
// invoice/receipt, checked in this order. "Bill to"/"Invoice to"/"Sold to"
// are the strongest signal (explicit, purpose-built); the generic "From"/
// "To" are checked last since they're common words that occasionally show
// up elsewhere on a page.
const COUNTERPARTY_LABELS = [
  /^bill\s*to\b\s*[:-]?\s*/i,
  /^invoice\s*to\b\s*[:-]?\s*/i,
  /^sold\s*to\b\s*[:-]?\s*/i,
  /^customer\b\s*[:-]?\s*/i,
  /^client\b\s*[:-]?\s*/i,
  /^vendor\b\s*[:-]?\s*/i,
  /^from\b\s*[:-]?\s*/i,
  /^to\b\s*[:-]?\s*/i,
];

const MAX_COUNTERPARTY_LENGTH = 80;

// A line is a plausible "name" (business/person) if it's short, non-empty,
// and not mostly digits — filters out totals, dates, and item/price rows.
function looksLikeNameLine(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_COUNTERPARTY_LENGTH) return false;
  const digitCount = trimmed.match(/\d/g)?.length ?? 0;
  return digitCount / trimmed.length < 0.4;
}

// excludeSpan masks out the matched date text, same reasoning as in
// extractAmount — stops a date line from being mistaken for a name.
export function extractCounterparty(text: string, excludeSpan?: string | null): string | null {
  const scanText = excludeSpan ? text.replace(excludeSpan, ' ') : text;
  const lines = scanText
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  for (const label of COUNTERPARTY_LABELS) {
    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(label);
      if (!match) continue;
      const sameLine = lines[i].slice(match[0].length).trim();
      if (sameLine && looksLikeNameLine(sameLine)) return sameLine.slice(0, MAX_COUNTERPARTY_LENGTH);
      const nextLine = lines[i + 1];
      if (nextLine && looksLikeNameLine(nextLine)) return nextLine.slice(0, MAX_COUNTERPARTY_LENGTH);
    }
  }

  // Fallback: the first plausible name-like line on the page — usually the
  // business name printed in the header of a simple receipt.
  const first = lines.find(looksLikeNameLine);
  return first ? first.slice(0, MAX_COUNTERPARTY_LENGTH) : null;
}

// Day-first (en-GB) rather than chrono's US-default month-first parsing —
// this app's ventures are Bangladesh-based, where DD/MM/YYYY is standard, so
// an ambiguous slash-date like "03/09/2026" should read as 3 Sept, not 9
// March.
function parseInvoiceDate(text: string) {
  const results = chrono.en.GB.parse(text, new Date(), { forwardDate: false });
  return results[0] ?? null;
}

export function extractDate(text: string): string | null {
  const result = parseInvoiceDate(text);
  return result ? result.start.date().toISOString().slice(0, 10) : null;
}

@Injectable()
export class InvoiceScanService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly businessService: BusinessService,
  ) {}

  private async assertLedgerBelongsToBusiness(businessId: string, ledgerId: string) {
    const ledger = await this.prisma.ledger.findUnique({ where: { id: ledgerId } });
    if (!ledger || ledger.businessId !== businessId) {
      throw new BadRequestException('Ledger does not belong to this business');
    }
  }

  // Most real invoices are PDFs generated by some accounting/billing system
  // (this app's own invoice PDFs included) — they already have a real text
  // layer, so pulling that out directly is exact and needs no OCR at all.
  // Only a scanned/photographed PDF (no text layer) falls through to
  // rendering its first page to an image and OCR-ing that, same as a plain
  // photo upload.
  private async extractPdfText(buffer: Buffer): Promise<string> {
    const doc = await pdfjsLib.getDocument({
      data: new Uint8Array(buffer),
      useWorkerFetch: false,
    }).promise;

    let text = '';
    const pageCount = Math.min(doc.numPages, MAX_PDF_PAGES_FOR_TEXT);
    for (let i = 1; i <= pageCount; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      // getTextContent() returns a flat run of text items with no line
      // breaks of its own — each item carries hasEOL marking whether a line
      // break follows it, which extractAmount/extractCounterparty rely on
      // (e.g. "first line of the page" as the likely vendor name).
      for (const item of content.items) {
        if (!('str' in item)) continue;
        text += item.str + (item.hasEOL ? '\n' : ' ');
      }
      text += '\n';
    }

    if (text.replace(/\s/g, '').length >= MIN_MEANINGFUL_TEXT_LENGTH) {
      return text;
    }

    // No usable text layer — rasterize the first page and OCR it instead.
    const page = await doc.getPage(1);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = createCanvas(viewport.width, viewport.height);
    // @napi-rs/canvas is API-compatible with the browser HTMLCanvasElement
    // pdfjs-dist expects, but isn't the exact same TS type.
    await page.render({ canvas: canvas as never, viewport }).promise;
    const {
      data: { text: ocrText },
    } = await Tesseract.recognize(canvas.toBuffer('image/png'), 'eng');
    return ocrText;
  }

  // A file passing the earlier magic-byte check only proves it *starts*
  // like a real PDF/image — pdfjs-dist (and, in principle, Tesseract) can
  // still choke on a truncated or otherwise malformed file past that point.
  // Surface that as a normal 400 instead of an unhandled 500.
  private async extractText(buffer: Buffer, mimetype: string): Promise<string> {
    try {
      return mimetype === 'application/pdf'
        ? await this.extractPdfText(buffer)
        : (await Tesseract.recognize(buffer, 'eng')).data.text;
    } catch {
      throw new BadRequestException("Couldn't read that file — it may be corrupted or an unsupported format");
    }
  }

  async scan(userId: string, businessId: string, ledgerId: string, buffer: Buffer, mimetype: string) {
    await this.businessService.assertAccess(userId, businessId, AccessPermission.EDIT);
    await this.assertLedgerBelongsToBusiness(businessId, ledgerId);

    const text = await this.extractText(buffer, mimetype);

    const dateResult = parseInvoiceDate(text);
    return {
      amount: extractAmount(text, dateResult?.text),
      date: dateResult ? dateResult.start.date().toISOString().slice(0, 10) : null,
      counterparty: extractCounterparty(text, dateResult?.text),
    };
  }
}
