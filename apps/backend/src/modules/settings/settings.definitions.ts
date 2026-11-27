import { z } from 'zod';

/** Every editable setting group with its validation schema and default values. */
export const SETTING_GROUPS = {
  business: {
    label: 'Business Profile',
    schema: z.object({
      businessName: z.string().trim().min(2).max(120),
      tagline: z.string().trim().max(160).optional().default(''),
      phone: z.string().trim().max(30).optional().default(''),
      whatsapp: z.string().trim().max(30).optional().default(''),
      email: z.string().trim().email().or(z.literal('')).optional().default(''),
      address: z.string().trim().max(300).optional().default(''),
      city: z.string().trim().max(80).optional().default(''),
      ntn: z.string().trim().max(40).optional().default(''),
      logoUrl: z.string().trim().max(500).optional().default(''),
    }),
    defaults: {
      businessName: 'AMIR ZAMEER', tagline: "Men's Tailoring & Fabrics", phone: '', whatsapp: '', email: '',
      address: '', city: '', ntn: '', logoUrl: '',
    },
  },
  regional: {
    label: 'Regional',
    schema: z.object({
      currency: z.literal('PKR'),
      timezone: z.literal('Asia/Karachi'),
      dateFormat: z.enum(['DD/MM/YYYY', 'YYYY-MM-DD', 'DD-MMM-YYYY']),
      defaultMeasurementUnit: z.enum(['INCH', 'CM']),
      fabricUnit: z.enum(['METER', 'YARD']),
    }),
    defaults: { currency: 'PKR', timezone: 'Asia/Karachi', dateFormat: 'DD/MM/YYYY', defaultMeasurementUnit: 'INCH', fabricUnit: 'METER' },
  },
  numbering: {
    label: 'Document Numbering',
    schema: z.object({
      orderPrefix: z.string().trim().regex(/^[A-Z]{1,6}$/, 'Use 1-6 capital letters'),
      customerPrefix: z.string().trim().regex(/^[A-Z]{1,6}$/, 'Use 1-6 capital letters'),
      receiptPrefix: z.string().trim().regex(/^[A-Z]{1,6}$/, 'Use 1-6 capital letters'),
      expensePrefix: z.string().trim().regex(/^[A-Z]{1,6}$/, 'Use 1-6 capital letters'),
      fabricPrefix: z.string().trim().regex(/^[A-Z]{1,6}$/, 'Use 1-6 capital letters'),
      supplierPrefix: z.string().trim().regex(/^[A-Z]{1,6}$/, 'Use 1-6 capital letters'),
      purchasePrefix: z.string().trim().regex(/^[A-Z]{1,6}$/, 'Use 1-6 capital letters'),
    }),
    defaults: {
      orderPrefix: 'AZ', customerPrefix: 'AZC', receiptPrefix: 'RCP', expensePrefix: 'EXP',
      fabricPrefix: 'AZF', supplierPrefix: 'AZS', purchasePrefix: 'PUR',
    },
  },
  orders: {
    label: 'Orders',
    schema: z.object({
      defaultDeliveryDays: z.number().int().min(1).max(90),
      requireAdvancePayment: z.boolean(),
      minimumAdvancePercent: z.number().min(0).max(100),
    }),
    defaults: { defaultDeliveryDays: 7, requireAdvancePayment: false, minimumAdvancePercent: 0 },
  },
  printing: {
    label: 'Printing',
    schema: z.object({
      invoiceFooter: z.string().trim().max(500).optional().default(''),
      receiptWidth: z.enum(['58mm', '80mm']),
      showLogoOnReceipt: z.boolean(),
    }),
    defaults: { invoiceFooter: 'Thank you for choosing AMIR ZAMEER.', receiptWidth: '80mm', showLogoOnReceipt: true },
  },
} as const;

export type SettingGroupKey = keyof typeof SETTING_GROUPS;
export const SETTING_GROUP_KEYS = Object.keys(SETTING_GROUPS) as SettingGroupKey[];
