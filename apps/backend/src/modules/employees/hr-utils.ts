import { BadRequestException } from '@nestjs/common';
import { PrismaService, PrismaTx } from '../../common/prisma/prisma.service';

export const asDate = (s: string) => new Date(`${s}T00:00:00Z`);
export const dateOnly = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);

/** "2026-11-27" -> "2026-11-28" */
export function nextDay(date: string, days = 1): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Every calendar date from `from` to `to` (inclusive). */
export function dateList(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = nextDay(d)) out.push(d);
  return out;
}

/**
 * Once a month's payroll is approved its attendance, overtime and production are frozen,
 * so a paid salary never changes behind the accountant's back.
 */
export async function assertMonthOpen(client: PrismaService | PrismaTx, dates: string[], what = 'attendance') {
  const keys = [...new Set(dates.map((d) => d.slice(0, 7)))];
  if (!keys.length) return;
  const locked = await client.payroll.findFirst({ where: { periodKey: { in: keys }, status: { in: ['APPROVED', 'PARTIALLY_PAID', 'PAID'] } }, select: { periodKey: true } });
  if (locked) throw new BadRequestException(`Payroll for ${locked.periodKey} is approved, so its ${what} cannot be changed. Reopen the payroll first.`);
}
