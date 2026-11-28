import { MONEY_SECTIONS } from './content-money';
import { OPS_SECTIONS } from './content-ops';
import { SALES_SECTIONS } from './content-sales';
import { START_SECTIONS } from './content-start';
import { PLATFORM_SECTIONS, SAAS_INTRO_SECTIONS } from './content-saas';
import { SYSTEM_SECTIONS } from './content-system';
import type { GuideSection } from './types';

export * from './types';

/** Every guide section in reading order: from login and setup to backups and help. */
export const GUIDE_SECTIONS: GuideSection[] = [
  START_SECTIONS[0]!, ...SAAS_INTRO_SECTIONS, ...START_SECTIONS.slice(1),
  ...SALES_SECTIONS, ...OPS_SECTIONS, ...MONEY_SECTIONS,
  // Super Admin sections sit just before the last section (Updating the ERP & Support).
  ...SYSTEM_SECTIONS.slice(0, -1), ...PLATFORM_SECTIONS, ...SYSTEM_SECTIONS.slice(-1),
];
