import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../common/services/audit.service';
import { RequestContext } from '../../common/types/auth-user';
import { SETTING_GROUPS, SETTING_GROUP_KEYS, SettingGroupKey } from './settings.definitions';

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  /** All groups, stored values merged over defaults. */
  async getAll(): Promise<Record<SettingGroupKey, Record<string, unknown>>> {
    const rows = await this.prisma.systemSetting.findMany({ where: { key: { in: SETTING_GROUP_KEYS.map((g) => `group.${g}`) } } });
    const out = {} as Record<SettingGroupKey, Record<string, unknown>>;
    for (const g of SETTING_GROUP_KEYS) {
      const stored = rows.find((r) => r.key === `group.${g}`)?.value as Record<string, unknown> | undefined;
      out[g] = { ...SETTING_GROUPS[g].defaults, ...(stored ?? {}) };
    }
    return out;
  }

  async getGroup(group: string): Promise<Record<string, unknown>> {
    if (!SETTING_GROUP_KEYS.includes(group as SettingGroupKey)) throw new NotFoundException('Unknown settings group');
    return (await this.getAll())[group as SettingGroupKey];
  }

  async updateGroup(group: string, body: unknown, ctx: RequestContext): Promise<Record<string, unknown>> {
    if (!SETTING_GROUP_KEYS.includes(group as SettingGroupKey)) throw new NotFoundException('Unknown settings group');
    const def = SETTING_GROUPS[group as SettingGroupKey];
    const before = await this.getGroup(group);
    const parsed = def.schema.safeParse({ ...before, ...(body as object) });
    if (!parsed.success) {
      throw new BadRequestException({ message: 'Validation failed', details: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) });
    }
    const value = parsed.data as Prisma.InputJsonValue;
    await this.prisma.$transaction(async (tx) => {
      await tx.systemSetting.upsert({
        where: { key: `group.${group}` },
        create: { key: `group.${group}`, group, value, updatedById: ctx.userId },
        update: { value, updatedById: ctx.userId },
      });
      await this.audit.log({ action: 'SETTINGS_CHANGED', module: 'settings', recordId: group, oldValues: before, newValues: value }, ctx, tx);
    });
    return parsed.data as Record<string, unknown>;
  }
}
