import Dexie, { type Table } from 'dexie';
import type { SyncEntityType, SyncOperationType } from '@az/shared';

/** Where an outbox entry stands on this device. */
export type OutboxStatus = 'pending' | 'waiting' | 'retry' | 'conflict' | 'rejected';

/** One piece of work saved on this device, waiting to be sent to the server. */
export interface OutboxOp {
  id: string;
  entityType: SyncEntityType;
  entityId: string;
  operation: SyncOperationType;
  baseVersion?: number;
  payload: Record<string, unknown>;
  dependsOn?: string[];
  clientTimestamp: string;
  /** User who saved it. Entries are only sent while that user is signed in. */
  userId: string;
  /** Short text for lists, e.g. "New customer: Faraz Siddiqui". */
  title: string;
  subtitle?: string;
  status: OutboxStatus;
  message?: string;
  conflictId?: string;
  attempts: number;
  lastTriedAt?: string;
}

export interface CachedCustomer {
  id: string;
  code: string | null;
  name: string;
  mobile: string;
  whatsapp: string | null;
  email: string | null;
  city: string | null;
  address: string | null;
  customerType: string;
  status: string;
  notes: string | null;
  version: number;
  updatedAt: string;
  /** Created on this device and not on the server yet. */
  local?: boolean;
}

export interface CachedTemplate {
  id: string;
  code: string;
  name: string;
  garmentCategory: string;
  defaultUnit: 'INCH' | 'CM';
  fields: { key: string; label: string; isRequired: boolean; sortOrder: number }[];
}

export interface CachedGarment {
  id: string;
  code: string;
  name: string;
  category: string;
  defaultStitchingPrice: string;
  measurementTemplate: { id: string; code: string; name: string } | null;
}

export interface CachedOrder {
  id: string;
  orderNumber: string | null;
  customerId: string;
  customerName: string;
  customerCode: string | null;
  customerMobile: string;
  orderDate: string;
  expectedDeliveryDate: string | null;
  totalAmount: string;
  paidAmount: string;
  balanceAmount: string;
  paymentStatus: string;
  lifecycle: string;
  stage: { name: string; color: string } | null;
  items: number;
  version: number;
  updatedAt: string;
  local?: boolean;
}

export interface MetaRow {
  key: string;
  value: unknown;
}

class OfflineDb extends Dexie {
  outbox!: Table<OutboxOp, string>;
  customers!: Table<CachedCustomer, string>;
  templates!: Table<CachedTemplate, string>;
  garments!: Table<CachedGarment, string>;
  orders!: Table<CachedOrder, string>;
  meta!: Table<MetaRow, string>;

  constructor() {
    super('amir-zameer-offline');
    this.version(1).stores({
      outbox: 'id, status, userId, clientTimestamp, entityType',
      customers: 'id, name, mobile, code, updatedAt',
      templates: 'id, name',
      garments: 'id, name',
      orders: 'id, customerId, orderNumber, updatedAt',
      meta: 'key',
    });
  }
}

export const db = new OfflineDb();

export async function getMeta<T>(key: string): Promise<T | undefined> {
  return (await db.meta.get(key))?.value as T | undefined;
}
export async function setMeta(key: string, value: unknown): Promise<void> {
  await db.meta.put({ key, value });
}

/** Wipes downloaded business data (on logout or user change). Unsent work in the outbox is kept. */
export async function clearCachedData(): Promise<void> {
  await db.transaction('rw', [db.customers, db.templates, db.garments, db.orders, db.meta], async () => {
    await Promise.all([db.customers.clear(), db.templates.clear(), db.garments.clear(), db.orders.clear(), db.meta.clear()]);
  });
}
