import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'az:isPublic';
/** Route does not require a logged-in session (login, health, CSRF bootstrap). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
