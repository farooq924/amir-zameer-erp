import type { Paginated } from './index';

export interface Ref { id: string; name: string; code?: string }

export interface CustomerPayment {
  id: string; receiptNo: string; paymentDate: string; amount: string; method: string; type: string; status: 'POSTED' | 'REVERSED';
  reference: string | null; notes: string | null; customer: { id: string; code: string; name: string; mobile: string };
  order: { id: string; orderNumber: string } | null; createdBy: { id: string; fullName: string } | null;
}
export type PaymentList = Paginated<CustomerPayment> & { totals: { received: string; refunded: string } };

export interface PaymentSummary {
  today: { received: string; receipts: number };
  month: { received: string; receipts: number; refunded: string; supplierPaid: string; salariesPaid: string; expenses: string; moneyOut: string; net: string };
  byMethod: { method: string; amount: string }[];
}

export interface RefundableOrder {
  id: string; orderNumber: string; lifecycle: string; customer: { id: string; code: string; name: string; mobile: string };
  effectiveTotal: string; paidAmount: string; refundable: string;
}

export interface SupplierPaymentRow {
  id: string; paymentNo: string; paymentDate: string; amount: string; method: string; reference: string | null;
  supplier: { id: string; code: string; name: string }; purchase: { id: string; purchaseNo: string } | null; status: string;
}
export interface SalaryPaymentRow {
  id: string; paymentNo: string; paymentDate: string; amount: string; method: string; reference: string | null;
  employee: { id: string; code: string; name: string }; periodKey: string; payrollId: string;
}
export type OutgoingList<T> = Paginated<T> & { totalAmount: string };

export interface ExpenseCategory { id: string; name: string; account: { id: string; code: string; name: string } | null; isActive: boolean; expenses: number }

export interface Expense {
  id: string; expenseNo: string; expenseDate: string; category: { id: string; name: string; account: { id: string; code: string; name: string } | null };
  description: string; amount: string; paymentMethod: string; paidTo: string | null; reference: string | null; notes: string | null;
  status: 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'DRAFT'; approvedBy: { id: string; fullName: string } | null; approvedAt: string | null;
  recurring: { id: string; description: string; frequency: string } | null; createdBy: { id: string; fullName: string } | null; createdAt: string; version: number;
  journal?: { id: string; entryNo: string; status: string } | null;
}
export type ExpenseList = Paginated<Expense> & { totalAmount: string };

export interface ExpenseSummary {
  month: string; monthLabel: string; total: string; count: number; pendingCount: number; pendingAmount: string; recurringDue: number;
  byCategory: { categoryId: string; name: string; amount: string; count: number }[];
  trend: { month: string; label: string; amount: string }[];
}

export interface RecurringExpense {
  id: string; category: { id: string; name: string }; description: string; amount: string; paymentMethod: string; frequency: string;
  nextRunDate: string; isActive: boolean; created: number; isDue: boolean;
}

export interface Account {
  id: string; code: string; name: string; type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE'; subType: string | null; subTypeLabel: string | null;
  isSystem: boolean; isActive: boolean; description: string | null; debit: string; credit: string; balance: string;
}

export interface AccountingOverview {
  today: string; monthLabel: string; cash: { id: string; code: string; name: string; balance: string }[]; totalCash: string;
  receivables: string; payables: string; inventory: string; month: { income: string; expenses: string; profit: string }; journalCount: number;
  sync: { at: string; posted: number; failedCount: number; failed: { key: string; reason: string }[] } | null;
}

export interface JournalRow { id: string; entryNo: string; date: string; description: string; sourceType: string; source: string; status: string; amount: string; isReversal: boolean }

export interface JournalDetail {
  id: string; entryNo: string; date: string; description: string; sourceType: string; source: string; sourceId: string | null; status: string;
  totalDebit: string; totalCredit: string; postedAt: string | null; createdBy: { id: string; fullName: string } | null;
  reversalOf: { id: string; entryNo: string } | null; reversedBy: { id: string; entryNo: string } | null; canReverse: boolean;
  lines: { id: string; lineNo: number; account: { id: string; code: string; name: string }; debit: string; credit: string; description: string | null; party: { kind: string; id: string; name: string } | null }[];
}

export interface AccountLedger {
  account: Account; from: string; to: string; opening: string; closing: string; totals: { debit: string; credit: string };
  entries: { id: string; entryId: string; entryNo: string; date: string; description: string; source: string; party: string | null; debit: string; credit: string; balance: string }[];
}

export interface ReportLine { id: string; code: string; name: string; amount: string }
export interface ReportGroup { rows: ReportLine[]; total: string }
export interface ProfitLoss {
  from: string; to: string; sales: ReportGroup; costOfSales: ReportGroup; grossProfit: string; salaries: ReportGroup; expenses: ReportGroup; otherIncome: ReportGroup;
  netProfit: string; margin: string | null;
}
export interface BalanceSheet {
  asOf: string; assets: ReportGroup; liabilities: ReportGroup; equity: ReportGroup & { profitToDate: string }; totalLiabilitiesAndEquity: string; balanced: boolean;
}
export interface CashFlow {
  from: string; to: string; opening: string; closing: string; inflow: { key: string; label: string; amount: string }[]; outflow: { key: string; label: string; amount: string }[];
  totalIn: string; totalOut: string; net: string; accounts: { id: string; code: string; name: string; opening: string; closing: string }[];
}
export interface TrialBalance { asOf: string; rows: { id: string; code: string; name: string; type: string; debit: string; credit: string }[]; totals: { debit: string; credit: string; balanced: boolean } }
export interface Period { month: string; label: string; status: 'OPEN' | 'CLOSED' | 'LOCKED'; closedAt: string | null; closedBy: string | null; entries: number; amount: string }
