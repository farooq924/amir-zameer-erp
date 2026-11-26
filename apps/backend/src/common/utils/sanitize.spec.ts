import { redact } from './sanitize';

describe('redact', () => {
  it('removes secrets at any depth', () => {
    const out = redact({ name: 'A', passwordHash: 'x', nested: { token: 'y', ok: 1 }, list: [{ secret: 's' }] });
    expect(out).toEqual({ name: 'A', passwordHash: '[REDACTED]', nested: { token: '[REDACTED]', ok: 1 }, list: [{ secret: '[REDACTED]' }] });
  });
});
