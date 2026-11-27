import { REPORT_KEYS } from '@az/shared';
import { ReportBuilder } from '../report-kit';
import { customerLedger, customerOutstanding, customerPayments } from './customers';
import { advanceRegister, dailyWages, employeeAttendance, employeeProduction, employeeSalary, overtime } from './staff';
import { auditLog, balanceSheet, cashFlow, expenseRegister, expenseSummary, generalLedger, profitLoss, trialBalance } from './finance';
import { fabricConsumption, fabricStock, purchaseRegister, stockMovements, supplierLedger } from './inventory';
import { dailySales, delayedOrders, deliveredOrders, fabricSales, monthlySales, orderRegister, pendingOrders, stitchingRevenue } from './sales';

/** Report key -> query. One entry for each of the 30 reports in the shared catalogue. */
export const BUILDERS: Record<string, ReportBuilder> = {
  'daily-sales': dailySales,
  'monthly-sales': monthlySales,
  'stitching-revenue': stitchingRevenue,
  'fabric-sales': fabricSales,
  'order-register': orderRegister,
  'pending-orders': pendingOrders,
  'delivered-orders': deliveredOrders,
  'delayed-orders': delayedOrders,
  'customer-ledger': customerLedger,
  'customer-outstanding': customerOutstanding,
  'customer-payments': customerPayments,
  'fabric-stock': fabricStock,
  'stock-movements': stockMovements,
  'fabric-consumption': fabricConsumption,
  'supplier-ledger': supplierLedger,
  'purchase-register': purchaseRegister,
  'employee-attendance': employeeAttendance,
  'employee-production': employeeProduction,
  'employee-salary': employeeSalary,
  'daily-wages': dailyWages,
  'advance-register': advanceRegister,
  overtime,
  'expense-register': expenseRegister,
  'expense-summary': expenseSummary,
  'profit-loss': profitLoss,
  'cash-flow': cashFlow,
  'balance-sheet': balanceSheet,
  'trial-balance': trialBalance,
  'general-ledger': generalLedger,
  'audit-log': auditLog,
};

const missing = REPORT_KEYS.filter((k) => !BUILDERS[k]);
if (missing.length) throw new Error(`Reports without a query: ${missing.join(', ')}`);
