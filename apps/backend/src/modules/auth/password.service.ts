import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';

/** Argon2id password hashing (OWASP recommended parameters). */
@Injectable()
export class PasswordService {
  private static readonly OPTIONS: argon2.Options & { raw?: false } = {
    type: argon2.argon2id,
    memoryCost: 19456, // 19 MiB
    timeCost: 2,
    parallelism: 1,
  };

  /** Pre-computed hash used to keep timing equal when a user does not exist. */
  private dummyHash: Promise<string> | null = null;

  hash(password: string): Promise<string> {
    return argon2.hash(password, PasswordService.OPTIONS);
  }

  async verify(hash: string | null, password: string): Promise<boolean> {
    if (!hash) {
      this.dummyHash ??= this.hash('timing-equaliser-not-a-real-password');
      await argon2.verify(await this.dummyHash, password).catch(() => false);
      return false;
    }
    try {
      return await argon2.verify(hash, password);
    } catch {
      return false;
    }
  }
}

/** Minimum password policy for ERP accounts. Returns an error message or null. */
export function passwordPolicyError(password: string): string | null {
  if (password.length < 10) return 'Password must be at least 10 characters long';
  if (password.length > 128) return 'Password must be at most 128 characters long';
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password)) return 'Password must contain upper and lower case letters';
  if (!/\d/.test(password)) return 'Password must contain at least one number';
  return null;
}
