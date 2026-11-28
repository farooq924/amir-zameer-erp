import { MONEY_SECTIONS } from './content-money';
import { OPS_SECTIONS } from './content-ops';
import { SALES_SECTIONS } from './content-sales';
import { START_SECTIONS } from './content-start';
import { SYSTEM_SECTIONS } from './content-system';
import type { GuideSection } from './types';

export * from './types';

/** Every guide section in reading order: from login and setup to backups and help. */
export const GUIDE_SECTIONS: GuideSection[] = [...START_SECTIONS, ...SALES_SECTIONS, ...OPS_SECTIONS, ...MONEY_SECTIONS, ...SYSTEM_SECTIONS];
