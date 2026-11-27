/**
 * Phase 6: finance & accounting catalogue shared by backend and frontend.
 * Account codes are stable: the posting engine refers to them by code.
 */

export type AccountTypeCode = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE';

export const ACCOUNT_TYPES: readonly { key: AccountTypeCode; label: string; normal: 'DEBIT' | 'CREDIT' }[] = [
  { key: 'ASSET', label: 'Asset', normal: 'DEBIT' },
  { key: 'LIABILITY', label: 'Liability', normal: 'CREDIT' },
  { key: 'EQUITY', label: 'Equity', normal: 'CREDIT' },
  { key: 'INCOME', label: 'Income', normal: 'CREDIT' },
  { key: 'EXPENSE', label: 'Expense', normal: 'DEBIT' },
] as const;

export const ACCOUNT_SUBTYPES: readonly { key: string; label: string; type: AccountTypeCode }[] = [
  { key: 'CASH', label: 'Cash & bank', type: 'ASSET' },
  { key: 'CURRENT_ASSET', label: 'Current asset', type: 'ASSET' },
  { key: 'FIXED_ASSET', label: 'Fixed asset', type: 'ASSET' },
  { key: 'CURRENT_LIABILITY', label: 'Current liability', type: 'LIABILITY' },
  { key: 'LONG_TERM_LIABILITY', label: 'Long-term liability', type: 'LIABILITY' },
  { key: 'EQUITY', label: 'Owner equity', type: 'EQUITY' },
  { key: 'OPERATING_INCOME', label: 'Sales income', type: 'INCOME' },
  { key: 'CONTRA_INCOME', label: 'Discounts (reduces income)', type: 'INCOME' },
  { key: 'OTHER_INCOME', label: 'Other income', type: 'INCOME' },
  { key: 'COGS', label: 'Cost of sales', type: 'EXPENSE' },
  { key: 'DIRECT_LABOUR', label: 'Salaries & wages', type: 'EXPENSE' },
  { key: 'OPERATING_EXPENSE', label: 'Operating expense', type: 'EXPENSE' },
] as const;

/** System accounts used by automatic posting. */
export const ACC = {
  CASH: '1000',
  BANK: '1010',
  WALLET: '1020',
  RECEIVABLE: '1100',
  ADVANCES: '1150',
  INVENTORY: '1200',
  PAYABLE: '2000',
  SALARIES_PAYABLE: '2100',
  CAPITAL: '3000',
  DRAWINGS: '3100',
  OPENING_EQUITY: '3200',
  RETAINED: '3300',
  STITCHING_INCOME: '4000',
  FABRIC_SALES: '4010',
  DISCOUNTS: '4100',
  OTHER_INCOME: '4200',
  FABRIC_COST: '5000',
  STOCK_ADJUSTMENT: '5010',
  SALARIES: '5100',
  ADVANCE_WRITE_OFF: '5110',
  MISC_EXPENSE: '5390',
} as const;

export interface DefaultAccount {
  code: string;
  name: string;
  type: AccountTypeCode;
  subType: string;
  isSystem: boolean;
  description?: string;
}

export const DEFAULT_ACCOUNTS: readonly DefaultAccount[] = [
  { code: '1000', name: 'Cash in Hand', type: 'ASSET', subType: 'CASH', isSystem: true, description: 'Cash counter at the shop' },
  { code: '1010', name: 'Bank Account', type: 'ASSET', subType: 'CASH', isSystem: true, description: 'Bank transfers, cards and cheques' },
  { code: '1020', name: 'Mobile Wallet (JazzCash / Easypaisa)', type: 'ASSET', subType: 'CASH', isSystem: true },
  { code: '1100', name: 'Customer Receivables', type: 'ASSET', subType: 'CURRENT_ASSET', isSystem: true, description: 'What customers owe (matches customer ledgers)' },
  { code: '1150', name: 'Employee Advances', type: 'ASSET', subType: 'CURRENT_ASSET', isSystem: true },
  { code: '1200', name: 'Fabric Inventory', type: 'ASSET', subType: 'CURRENT_ASSET', isSystem: true },
  { code: '1500', name: 'Machines & Shop Equipment', type: 'ASSET', subType: 'FIXED_ASSET', isSystem: false },
  { code: '2000', name: 'Supplier Payables', type: 'LIABILITY', subType: 'CURRENT_LIABILITY', isSystem: true, description: 'What we owe suppliers (matches supplier ledgers)' },
  { code: '2100', name: 'Salaries Payable', type: 'LIABILITY', subType: 'CURRENT_LIABILITY', isSystem: true },
  { code: '2300', name: 'Loans', type: 'LIABILITY', subType: 'LONG_TERM_LIABILITY', isSystem: false },
  { code: '3000', name: "Owner's Capital", type: 'EQUITY', subType: 'EQUITY', isSystem: true },
  { code: '3100', name: "Owner's Drawings", type: 'EQUITY', subType: 'EQUITY', isSystem: true },
  { code: '3200', name: 'Opening Balance Equity', type: 'EQUITY', subType: 'EQUITY', isSystem: true, description: 'Opening balances of customers, suppliers and stock' },
  { code: '3300', name: 'Retained Earnings', type: 'EQUITY', subType: 'EQUITY', isSystem: true },
  { code: '4000', name: 'Stitching Income', type: 'INCOME', subType: 'OPERATING_INCOME', isSystem: true },
  { code: '4010', name: 'Fabric Sales', type: 'INCOME', subType: 'OPERATING_INCOME', isSystem: true },
  { code: '4100', name: 'Discounts & Waivers', type: 'INCOME', subType: 'CONTRA_INCOME', isSystem: true },
  { code: '4200', name: 'Other Income', type: 'INCOME', subType: 'OTHER_INCOME', isSystem: true },
  { code: '5000', name: 'Cost of Fabric Used', type: 'EXPENSE', subType: 'COGS', isSystem: true },
  { code: '5010', name: 'Stock Adjustments', type: 'EXPENSE', subType: 'COGS', isSystem: true },
  { code: '5100', name: 'Salaries & Wages', type: 'EXPENSE', subType: 'DIRECT_LABOUR', isSystem: true },
  { code: '5110', name: 'Advances Written Off', type: 'EXPENSE', subType: 'OPERATING_EXPENSE', isSystem: true },
  { code: '5200', name: 'Shop Rent', type: 'EXPENSE', subType: 'OPERATING_EXPENSE', isSystem: false },
  { code: '5210', name: 'Electricity (K-Electric)', type: 'EXPENSE', subType: 'OPERATING_EXPENSE', isSystem: false },
  { code: '5220', name: 'Gas (SSGC)', type: 'EXPENSE', subType: 'OPERATING_EXPENSE', isSystem: false },
  { code: '5230', name: 'Water', type: 'EXPENSE', subType: 'OPERATING_EXPENSE', isSystem: false },
  { code: '5240', name: 'Internet & Phone', type: 'EXPENSE', subType: 'OPERATING_EXPENSE', isSystem: false },
  { code: '5250', name: 'Staff Food & Tea', type: 'EXPENSE', subType: 'OPERATING_EXPENSE', isSystem: false },
  { code: '5260', name: 'Transport & Delivery', type: 'EXPENSE', subType: 'OPERATING_EXPENSE', isSystem: false },
  { code: '5270', name: 'Repairs & Maintenance', type: 'EXPENSE', subType: 'OPERATING_EXPENSE', isSystem: false },
  { code: '5280', name: 'Stationery & Printing', type: 'EXPENSE', subType: 'OPERATING_EXPENSE', isSystem: false },
  { code: '5290', name: 'Tailoring Accessories', type: 'EXPENSE', subType: 'OPERATING_EXPENSE', isSystem: false, description: 'Thread, buttons, lining, packing' },
  { code: '5300', name: 'Marketing', type: 'EXPENSE', subType: 'OPERATING_EXPENSE', isSystem: false },
  { code: '5310', name: 'Bank Charges', type: 'EXPENSE', subType: 'OPERATING_EXPENSE', isSystem: false },
  { code: '5320', name: 'Generator Fuel', type: 'EXPENSE', subType: 'OPERATING_EXPENSE', isSystem: false },
  { code: '5330', name: 'Cleaning & Security', type: 'EXPENSE', subType: 'OPERATING_EXPENSE', isSystem: false },
  { code: '5390', name: 'Miscellaneous Expenses', type: 'EXPENSE', subType: 'OPERATING_EXPENSE', isSystem: true },
] as const;

/** Default expense categories and the expense account each one posts to. */
export const DEFAULT_EXPENSE_CATEGORIES: readonly { name: string; accountCode: string }[] = [
  { name: 'Shop Rent', accountCode: '5200' },
  { name: 'Electricity', accountCode: '5210' },
  { name: 'Gas', accountCode: '5220' },
  { name: 'Water', accountCode: '5230' },
  { name: 'Internet & Phone', accountCode: '5240' },
  { name: 'Staff Food & Tea', accountCode: '5250' },
  { name: 'Transport & Delivery', accountCode: '5260' },
  { name: 'Repairs & Maintenance', accountCode: '5270' },
  { name: 'Stationery & Printing', accountCode: '5280' },
  { name: 'Tailoring Accessories', accountCode: '5290' },
  { name: 'Marketing', accountCode: '5300' },
  { name: 'Bank Charges', accountCode: '5310' },
  { name: 'Generator Fuel', accountCode: '5320' },
  { name: 'Cleaning & Security', accountCode: '5330' },
  { name: 'Miscellaneous', accountCode: '5390' },
] as const;

export const EXPENSE_STATUSES = [
  { key: 'PENDING_APPROVAL', label: 'Pending approval' },
  { key: 'APPROVED', label: 'Approved' },
  { key: 'REJECTED', label: 'Rejected' },
  { key: 'CANCELLED', label: 'Cancelled' },
] as const;

export const RECURRENCE_FREQUENCIES = [
  { key: 'WEEKLY', label: 'Weekly' },
  { key: 'MONTHLY', label: 'Monthly' },
  { key: 'QUARTERLY', label: 'Quarterly' },
  { key: 'YEARLY', label: 'Yearly' },
] as const;

export const JOURNAL_SOURCES: readonly { key: string; label: string }[] = [
  { key: 'MANUAL', label: 'Manual entry' },
  { key: 'OPENING', label: 'Opening balance' },
  { key: 'ORDER', label: 'Order' },
  { key: 'PAYMENT', label: 'Customer payment' },
  { key: 'REFUND', label: 'Customer refund' },
  { key: 'EXPENSE', label: 'Expense' },
  { key: 'PURCHASE', label: 'Purchase' },
  { key: 'PURCHASE_RETURN', label: 'Purchase return' },
  { key: 'SUPPLIER_PAYMENT', label: 'Supplier payment' },
  { key: 'SALE_RETURN', label: 'Sale return' },
  { key: 'INVENTORY', label: 'Stock' },
  { key: 'PAYROLL', label: 'Payroll' },
  { key: 'SALARY_PAYMENT', label: 'Salary payment' },
  { key: 'ADVANCE', label: 'Employee advance' },
  { key: 'REVERSAL', label: 'Reversal' },
];

export const PERIOD_STATUSES = [
  { key: 'OPEN', label: 'Open' },
  { key: 'CLOSED', label: 'Closed' },
  { key: 'LOCKED', label: 'Locked' },
] as const;

/** Signed balance in the account's normal direction: debit-normal = debit - credit. */
export function normalBalance(type: AccountTypeCode | string, debit: number, credit: number): number {
  return type === 'ASSET' || type === 'EXPENSE' ? debit - credit : credit - debit;
}
