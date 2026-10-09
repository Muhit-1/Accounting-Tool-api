// Structured on purpose (no HTML, no markdown): every client — the web app
// today, a mobile app later — renders these fields itself, so a legal text can
// never smuggle markup or script into a page.
export interface LegalSection {
  heading: string;
  paragraphs?: string[];
  bullets?: string[];
}

export interface LegalDocument {
  slug: LegalSlug;
  title: string;
  version: string;
  effectiveDate: string;
  language: 'en';
  sections: LegalSection[];
}

export const LEGAL_SLUGS = ['privacy', 'terms'] as const;
export type LegalSlug = (typeof LEGAL_SLUGS)[number];
