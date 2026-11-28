import { MODULES } from '@az/shared';
import { GUIDE_PARTS, GUIDE_SECTIONS, sectionText } from '@/features/guide';

describe('user guide (Documents)', () => {
  it('has unique section ids in valid parts, each with content', () => {
    const ids = GUIDE_SECTIONS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    const parts = new Set<string>(GUIDE_PARTS.map((p) => p.key));
    for (const s of GUIDE_SECTIONS) {
      expect(parts.has(s.part)).toBe(true);
      expect(s.summary.length).toBeGreaterThan(20);
      expect(s.blocks.length).toBeGreaterThan(0);
    }
  });
  it('covers every module in the menu', () => {
    const covered = new Set(GUIDE_SECTIONS.map((s) => s.module).filter(Boolean));
    const paths = new Set(GUIDE_SECTIONS.map((s) => s.path));
    for (const m of MODULES.filter((x) => !x.hidden)) expect(covered.has(m.key) || paths.has(m.path)).toBe(true);
    expect(paths.has('/offline') && paths.has('/sync')).toBe(true);
  });
  it('starts with the welcome and ends with update help, and search text is plain', () => {
    expect(GUIDE_SECTIONS[0]!.id).toBe('welcome');
    expect(GUIDE_SECTIONS.at(-1)!.id).toBe('update-support');
    const t = sectionText(GUIDE_SECTIONS.find((s) => s.id === 'backup')!);
    expect(t).toContain('back up now');
    expect(t).not.toContain('**');
  });
});
