import { BadRequestException, Injectable } from '@nestjs/common';
import Tesseract from 'tesseract.js';
import * as chrono from 'chrono-node';
import { BusinessService } from '../business/business.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AccessPermission } from '../generated/prisma/client.js';

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

  async scan(userId: string, businessId: string, ledgerId: string, buffer: Buffer) {
    await this.businessService.assertAccess(userId, businessId, AccessPermission.EDIT);
    await this.assertLedgerBelongsToBusiness(businessId, ledgerId);

    const { data } = await Tesseract.recognize(buffer, 'eng');
    const dateResult = parseInvoiceDate(data.text);
    return {
      amount: extractAmount(data.text, dateResult?.text),
      date: dateResult ? dateResult.start.date().toISOString().slice(0, 10) : null,
    };
  }
}
