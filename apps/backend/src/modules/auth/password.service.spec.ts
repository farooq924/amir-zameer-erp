import { PasswordService, passwordPolicyError } from './password.service';

describe('PasswordService', () => {
  const svc = new PasswordService();
  it('hashes with argon2id and verifies', async () => {
    const hash = await svc.hash('Correct Horse 1');
    expect(hash.startsWith('$argon2id$')).toBe(true);
    expect(await svc.verify(hash, 'Correct Horse 1')).toBe(true);
    expect(await svc.verify(hash, 'wrong')).toBe(false);
  });
  it('returns false for a missing user without throwing', async () => {
    expect(await svc.verify(null, 'anything')).toBe(false);
  });
  it('enforces password policy', () => {
    expect(passwordPolicyError('short1A')).toMatch(/10 characters/);
    expect(passwordPolicyError('alllowercase1')).toMatch(/upper and lower/);
    expect(passwordPolicyError('NoNumbersHere')).toMatch(/number/);
    expect(passwordPolicyError('GoodPassword1')).toBeNull();
  });
});
