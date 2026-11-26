// Environment for e2e tests: a separate database that is reset before the run.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://az_erp:az_erp_dev@localhost:5432/amir_zameer_erp_test?schema=public&connection_limit=5';
process.env.APP_URL = 'http://localhost:5173';
process.env.LOGIN_MAX_ATTEMPTS = '3';
process.env.LOGIN_LOCK_MINUTES = '15';
process.env.SESSION_TTL_HOURS = '12';
process.env.SESSION_IDLE_MINUTES = '120';
process.env.COOKIE_SECURE = 'false';
process.env.SWAGGER_ENABLED = 'false';
process.env.OWNER_NAME = 'Test Owner';
process.env.OWNER_EMAIL = 'owner@test.local';
process.env.OWNER_USERNAME = 'owner';
process.env.OWNER_PASSWORD = 'OwnerPass123';
process.env.LOGIN_RATE_LIMIT_PER_MINUTE = '1000';
