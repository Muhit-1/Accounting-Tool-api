import { CanActivate, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// Email/password login is switched off unless AUTH_PASSWORD_ENABLED is exactly
// "true" (unset counts as off). Google is the real login; this exists so local
// development and tests keep working without Google credentials. A 404 rather
// than 403 so a production server does not advertise that the routes exist.
@Injectable()
export class PasswordAuthEnabledGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(): boolean {
    if (this.config.get<string>('AUTH_PASSWORD_ENABLED') !== 'true') {
      throw new NotFoundException();
    }
    return true;
  }
}
