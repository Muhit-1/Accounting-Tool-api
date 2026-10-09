import { Injectable, NotFoundException } from '@nestjs/common';
import { privacyPolicy } from './content/privacy.js';
import { termsOfService } from './content/terms.js';
import { LEGAL_SLUGS, type LegalDocument, type LegalSlug } from './legal.types.js';

const DOCUMENTS: Record<LegalSlug, LegalDocument> = {
  privacy: privacyPolicy,
  terms: termsOfService,
};

@Injectable()
export class LegalService {
  findOne(slug: string): LegalDocument {
    // Checked against the allowlist first: `DOCUMENTS[slug]` on a raw string
    // would also match inherited keys like "constructor".
    if (!(LEGAL_SLUGS as readonly string[]).includes(slug)) {
      throw new NotFoundException('Legal document not found');
    }
    return DOCUMENTS[slug as LegalSlug];
  }
}
