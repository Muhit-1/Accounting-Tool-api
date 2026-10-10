import { HttpException } from '@nestjs/common';
import bcrypt from 'bcrypt';
import { LoginLockoutService } from './login-lockout.service.js';
import { AuthService } from './auth.service.js';

const T0 = 1_000_000;
const MINUTE = 60_000;

describe('LoginLockoutService', () => {
  let lockout: LoginLockoutService;

  beforeEach(() => {
    lockout = new LoginLockoutService();
  });

  function fail(email: string, times: number, at = T0) {
    for (let i = 0; i < times; i += 1) lockout.recordFailure(email, at);
  }

  it('allows attempts below the limit', () => {
    fail('a@b.com', 4);
    expect(() => lockout.assertNotLocked('a@b.com', T0)).not.toThrow();
  });

  it('locks the account on the fifth failure with a 429', () => {
    fail('a@b.com', 5);
    try {
      lockout.assertNotLocked('a@b.com', T0 + MINUTE);
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as HttpException).getStatus()).toBe(429);
    }
  });

  it('unlocks after 15 minutes and starts counting afresh', () => {
    fail('a@b.com', 5);
    expect(() => lockout.assertNotLocked('a@b.com', T0 + 16 * MINUTE)).not.toThrow();
    fail('a@b.com', 4, T0 + 16 * MINUTE);
    expect(() => lockout.assertNotLocked('a@b.com', T0 + 16 * MINUTE)).not.toThrow();
  });

  it('forgets old failures that fall outside the window', () => {
    fail('a@b.com', 4);
    lockout.recordFailure('a@b.com', T0 + 20 * MINUTE);
    expect(() => lockout.assertNotLocked('a@b.com', T0 + 20 * MINUTE)).not.toThrow();
  });

  it('clears the count after a successful sign-in', () => {
    fail('a@b.com', 4);
    lockout.recordSuccess('a@b.com');
    fail('a@b.com', 4);
    expect(() => lockout.assertNotLocked('a@b.com', T0)).not.toThrow();
  });

  it('tracks each email separately, registered or not', () => {
    fail('victim@b.com', 5);
    expect(() => lockout.assertNotLocked('victim@b.com', T0)).toThrow(HttpException);
    expect(() => lockout.assertNotLocked('other@b.com', T0)).not.toThrow();
  });
});

describe('AuthService.login with lockout', () => {
  it('locks after repeated wrong passwords (even for the right one afterwards) and treats unknown emails the same', async () => {
    const passwordHash = await bcrypt.hash('right-password', 4);
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue({ id: 'u1', email: 'a@b.com', name: 'A', passwordHash }),
        create: vi.fn(),
      },
    };
    const jwt = { sign: vi.fn().mockReturnValue('token') };
    const service = new AuthService(prisma as never, jwt as never, new LoginLockoutService());

    for (let i = 0; i < 5; i += 1) {
      await expect(service.login({ email: 'a@b.com', password: 'wrong' })).rejects.toThrow('Invalid email or password');
    }
    await expect(service.login({ email: 'a@b.com', password: 'right-password' })).rejects.toThrow(/Too many failed/);

    prisma.user.findUnique.mockResolvedValue(null);
    for (let i = 0; i < 5; i += 1) {
      await expect(service.login({ email: 'ghost@b.com', password: 'x' })).rejects.toThrow('Invalid email or password');
    }
    await expect(service.login({ email: 'ghost@b.com', password: 'x' })).rejects.toThrow(/Too many failed/);
  });
});
