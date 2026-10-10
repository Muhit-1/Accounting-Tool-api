import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service.js';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { LoginLockoutService } from './login-lockout.service.js';

const SALT_ROUNDS = 12;

// Compared against when the email is unknown so a login for a missing user
// takes as long as one for a real user — otherwise response time reveals
// which emails are registered.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', SALT_ROUNDS);

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly loginLockout: LoginLockoutService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);
    const user = await this.prisma.user.create({
      data: { email: dto.email, passwordHash, name: dto.name },
    });

    return this.buildAuthResponse(user);
  }

  async login(dto: LoginDto) {
    // Before the (slow) password check, and for unknown emails too, so a lock
    // reveals nothing about which accounts exist.
    this.loginLockout.assertNotLocked(dto.email);
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    const passwordMatches = await bcrypt.compare(dto.password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !user.passwordHash || !passwordMatches) {
      this.loginLockout.recordFailure(dto.email);
      throw new UnauthorizedException('Invalid email or password');
    }

    this.loginLockout.recordSuccess(dto.email);
    return this.buildAuthResponse(user);
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    return { id: user.id, email: user.email, name: user.name };
  }

  // Also used by the Google login, so both paths issue identical tokens.
  issueAccessToken(user: { id: string; email: string }): string {
    return this.jwtService.sign({ sub: user.id, email: user.email });
  }

  private buildAuthResponse(user: { id: string; email: string; name: string }) {
    const accessToken = this.issueAccessToken(user);
    return {
      accessToken,
      user: { id: user.id, email: user.email, name: user.name },
    };
  }
}
