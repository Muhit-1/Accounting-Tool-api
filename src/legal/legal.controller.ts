import { Controller, Get, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { LegalService } from './legal.service.js';

// Public on purpose: Google's OAuth verification and visitors who are not
// signed in must be able to read these. There is deliberately no JwtAuthGuard;
// the global RateLimitGuard still applies.
@Controller('legal')
export class LegalController {
  constructor(private readonly legalService: LegalService) {}

  @Get(':slug')
  findOne(@Param('slug') slug: string, @Res({ passthrough: true }) res: Response) {
    const document = this.legalService.findOne(slug);
    // Set after the lookup so a 404 for an unknown slug is never cached.
    res.setHeader('Cache-Control', 'public, max-age=300');
    return document;
  }
}
