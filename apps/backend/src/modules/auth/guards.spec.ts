import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CsrfGuard, PermissionsGuard } from './guards';

function ctx(req: Record<string, unknown>): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

function reflectorReturning(value: unknown): Reflector {
  return { getAllAndOverride: () => value } as unknown as Reflector;
}

const baseUser = { id: 'u1', isOwner: false, permissions: ['customers.view'] };

describe('PermissionsGuard', () => {
  it('allows when no permission is required', () => {
    expect(new PermissionsGuard(reflectorReturning(undefined)).canActivate(ctx({ user: baseUser }))).toBe(true);
  });
  it('allows when user has all required permissions', () => {
    expect(new PermissionsGuard(reflectorReturning(['customers.view'])).canActivate(ctx({ user: baseUser }))).toBe(true);
  });
  it('denies when a permission is missing', () => {
    expect(() => new PermissionsGuard(reflectorReturning(['customers.view', 'customers.delete'])).canActivate(ctx({ user: baseUser })))
      .toThrow(ForbiddenException);
  });
  it('owner bypasses permission checks', () => {
    const owner = { ...baseUser, isOwner: true, permissions: [] };
    expect(new PermissionsGuard(reflectorReturning(['accounting.approve'])).canActivate(ctx({ user: owner }))).toBe(true);
  });
});

describe('CsrfGuard', () => {
  const guard = new CsrfGuard(reflectorReturning(false));
  it('skips safe methods', () => {
    expect(guard.canActivate(ctx({ method: 'GET', headers: {} }))).toBe(true);
  });
  it('rejects a POST without token', () => {
    expect(() => guard.canActivate(ctx({ method: 'POST', headers: {}, csrfToken: 'abc' }))).toThrow(ForbiddenException);
  });
  it('rejects a POST with the wrong token', () => {
    expect(() => guard.canActivate(ctx({ method: 'POST', headers: { 'x-csrf-token': 'xyz' }, csrfToken: 'abc' }))).toThrow(ForbiddenException);
  });
  it('accepts a POST with the matching token', () => {
    expect(guard.canActivate(ctx({ method: 'POST', headers: { 'x-csrf-token': 'abc' }, csrfToken: 'abc' }))).toBe(true);
  });
});
