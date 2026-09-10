import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { CurrentUser, type AuthenticatedUser } from './decorators/current-user.decorator.js';
import { RateLimit } from '../common/rate-limit.guard.js';

// Tighter than the app-wide default (100/min) — these two are the ones
// worth specifically blunting against brute-force/credential-stuffing.
const AUTH_RATE_LIMIT = { limit: 5, windowMs: 60_000 };

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @RateLimit(AUTH_RATE_LIMIT)
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @RateLimit(AUTH_RATE_LIMIT)
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.getProfile(user.id);
  }
}
