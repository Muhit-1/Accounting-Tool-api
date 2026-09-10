import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import { EncryptionService } from './encryption.service.js';

function createService(key = randomBytes(32).toString('base64')): EncryptionService {
  const configService = { get: () => key } as unknown as ConfigService;
  const service = new EncryptionService(configService);
  service.onModuleInit();
  return service;
}

describe('EncryptionService', () => {
  it('round-trips a plaintext value', () => {
    const service = createService();
    const ciphertext = service.encrypt('1234567890');
    expect(ciphertext).not.toBe('1234567890');
    expect(service.decrypt(ciphertext)).toBe('1234567890');
  });

  it('produces different ciphertext for the same plaintext each time (random IV)', () => {
    const service = createService();
    const a = service.encrypt('same-value');
    const b = service.encrypt('same-value');
    expect(a).not.toBe(b);
    expect(service.decrypt(a)).toBe('same-value');
    expect(service.decrypt(b)).toBe('same-value');
  });

  it('passes null/undefined straight through', () => {
    const service = createService();
    expect(service.encrypt(null)).toBeNull();
    expect(service.encrypt(undefined)).toBeNull();
    expect(service.decrypt(null)).toBeNull();
  });

  it('fails closed (returns null) when decrypting with the wrong key', () => {
    const a = createService();
    const b = createService();
    const ciphertext = a.encrypt('secret');
    expect(b.decrypt(ciphertext)).toBeNull();
  });

  it('returns plaintext-looking input as-is instead of throwing (pre-encryption legacy rows)', () => {
    const service = createService();
    expect(service.decrypt('plain-old-value')).toBe('plain-old-value');
  });

  it('rejects a key that is not exactly 32 bytes', () => {
    const configService = { get: () => Buffer.from('too-short').toString('base64') } as unknown as ConfigService;
    const service = new EncryptionService(configService);
    expect(() => service.onModuleInit()).toThrow();
  });
});
