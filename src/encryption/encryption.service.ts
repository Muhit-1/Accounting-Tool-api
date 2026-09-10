import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_BYTES = 32;
const IV_BYTES = 12;

// Encrypts sensitive fields (business bank details) at rest. AES-256-GCM
// with a random IV per value and an authentication tag, so identical
// plaintexts don't produce identical ciphertext and tampering is detected
// on decrypt. Key comes from ENCRYPTION_KEY (base64, 32 bytes) — main.ts
// refuses to start the app at all if it's missing or the wrong size, so by
// the time this service runs the key is guaranteed valid.
@Injectable()
export class EncryptionService implements OnModuleInit {
  private key!: Buffer;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const raw = this.configService.get<string>('ENCRYPTION_KEY') ?? '';
    const key = Buffer.from(raw, 'base64');
    if (key.length !== KEY_BYTES) {
      throw new Error('ENCRYPTION_KEY must decode to exactly 32 bytes (base64-encoded)');
    }
    this.key = key;
  }

  // Returns "iv.authTag.ciphertext" (each base64) — null in, null out, so
  // callers can pass optional/nullable fields straight through.
  encrypt(plaintext: string | null | undefined): string | null {
    if (plaintext === null || plaintext === undefined) return null;
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return [iv, authTag, ciphertext].map((buf) => buf.toString('base64')).join('.');
  }

  decrypt(payload: string | null | undefined): string | null {
    if (payload === null || payload === undefined) return null;
    const parts = payload.split('.');
    if (parts.length !== 3) {
      // Not our format — most likely pre-existing plaintext data from
      // before encryption was added. Return it as-is rather than throwing,
      // so old rows stay readable until they're next saved (and encrypted).
      return payload;
    }
    const [ivB64, authTagB64, ciphertextB64] = parts;
    try {
      const iv = Buffer.from(ivB64, 'base64');
      const authTag = Buffer.from(authTagB64, 'base64');
      const ciphertext = Buffer.from(ciphertextB64, 'base64');
      const decipher = createDecipheriv(ALGORITHM, this.key, iv);
      decipher.setAuthTag(authTag);
      return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    } catch {
      // Wrong key, corrupted data, or tampering — fail closed by returning
      // null rather than throwing and taking down the whole request.
      return null;
    }
  }
}
