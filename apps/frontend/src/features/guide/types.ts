/**
 * User guide (Documents menu). The guide text itself is written in Roman Urdu on the owner's request;
 * page chrome (menu, headings, buttons) stays in English like the rest of the ERP.
 * Inside guide text, **double stars** mark a button or field name exactly as it appears on screen.
 */
export type GuideBlock =
  | { type: 'para'; title?: string; text: string }
  | { type: 'steps'; title: string; items: string[] }
  | { type: 'options'; title: string; items: { name: string; text: string }[] }
  | { type: 'tip'; text: string }
  | { type: 'warning'; text: string };

export interface GuideSection {
  id: string;
  part: string;
  /** English heading (matches the menu / page name). */
  title: string;
  icon: string;
  /** Page in the ERP this section explains (for the "Open page" button). */
  path?: string;
  /** Permission module needed to open that page. */
  module?: string;
  /** Short Roman Urdu summary shown under the heading. */
  summary: string;
  blocks: GuideBlock[];
}

export const GUIDE_PARTS = [
  { key: 'start', label: 'Getting Started' },
  { key: 'setup', label: 'Settings & Access' },
  { key: 'sales', label: 'Customers & Orders' },
  { key: 'fabric', label: 'Fabric & Purchases' },
  { key: 'staff', label: 'Staff & Payroll' },
  { key: 'money', label: 'Money & Accounts' },
  { key: 'reports', label: 'Reports & WhatsApp' },
  { key: 'offline', label: 'Offline & Sync' },
  { key: 'security', label: 'Security & Backup' },
  { key: 'help', label: 'Help' },
] as const;

/** Plain text of a section, used by the guide search. */
export function sectionText(s: GuideSection): string {
  const parts: string[] = [s.title, s.summary];
  for (const b of s.blocks) {
    if (b.type === 'para') parts.push(b.title ?? '', b.text);
    else if (b.type === 'steps') parts.push(b.title, ...b.items);
    else if (b.type === 'options') parts.push(b.title, ...b.items.flatMap((i) => [i.name, i.text]));
    else parts.push(b.text);
  }
  return parts.join(' ').replace(/\*\*/g, '').toLowerCase();
}
