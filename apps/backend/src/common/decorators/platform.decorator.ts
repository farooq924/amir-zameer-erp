import { SetMetadata } from '@nestjs/common';

export const PLATFORM_KEY = 'az:platform';
export const COMPANY_OPTIONAL_KEY = 'az:companyOptional';
export const ALLOW_READ_ONLY_KEY = 'az:allowReadOnly';

/** Super Admin (TailoringERP platform) route. Runs across all companies. */
export const Platform = () => SetMetadata(PLATFORM_KEY, true);
/** Route also works for a Super Admin who has not opened a company (e.g. /auth/me). */
export const CompanyOptional = () => SetMetadata(COMPANY_OPTIONAL_KEY, true);
/** State-changing route that still works when the subscription is read-only (logout, password). */
export const AllowReadOnly = () => SetMetadata(ALLOW_READ_ONLY_KEY, true);
