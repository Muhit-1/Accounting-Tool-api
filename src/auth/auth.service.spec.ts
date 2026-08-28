import { ConflictException, UnauthorizedException } from '@nestjs/common';
import bcrypt from 'bcrypt';
import { AuthService } from './auth.service.js';

function createPrismaMock() {
  return { user: { findUnique: vi.fn(), create: vi.fn() } };
}

function createJwtMock() {
  return { sign: vi.fn().mockReturnValue('signed.jwt.token') };
}

describe('AuthService', () => {
  let service: AuthService;
  let prisma: ReturnType<typeof createPrismaMock>;
  let jwt: ReturnType<typeof createJwtMock>;

  beforeEach(() => {
    prisma = createPrismaMock();
    jwt = createJwtMock();
    service = new AuthService(prisma as never, jwt as never);
  });

  describe('register', () => {
    it('hashes the password before storing it and returns a signed token', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({ id: 'u1', email: 'a@b.com', name: 'A' });

      const result = await service.register({ email: 'a@b.com', password: 'password123', name: 'A' });

      const createArgs = prisma.user.create.mock.calls[0][0];
      expect(createArgs.data.passwordHash).not.toBe('password123');
      expect(await bcrypt.compare('password123', createArgs.data.passwordHash)).toBe(true);
      expect(result).toEqual({ accessToken: 'signed.jwt.token', user: { id: 'u1', email: 'a@b.com', name: 'A' } });
    });

    it('throws ConflictException when the email is already registered', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'existing' });

      await expect(service.register({ email: 'a@b.com', password: 'password123', name: 'A' })).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.user.create).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    it('returns a token when the password matches the stored hash', async () => {
      const passwordHash = await bcrypt.hash('password123', 4);
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', email: 'a@b.com', name: 'A', passwordHash });

      const result = await service.login({ email: 'a@b.com', password: 'password123' });

      expect(result.accessToken).toBe('signed.jwt.token');
    });

    it('throws UnauthorizedException for a wrong password', async () => {
      const passwordHash = await bcrypt.hash('password123', 4);
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', email: 'a@b.com', name: 'A', passwordHash });

      await expect(service.login({ email: 'a@b.com', password: 'wrong' })).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when no user exists with that email', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.login({ email: 'nobody@b.com', password: 'password123' })).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('throws UnauthorizedException for a Stage 2 Google-only account with no password set', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', email: 'a@b.com', name: 'A', passwordHash: null });

      await expect(service.login({ email: 'a@b.com', password: 'anything' })).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
});
