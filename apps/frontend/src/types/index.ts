export interface AuthUser {
  id: string;
  fullName: string;
  email: string;
  username: string;
  isOwner: boolean;
  roles: { code: string; name: string }[];
  permissions: string[];
  sessionId: string;
}

export interface Paginated<T> {
  data: T[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}

export interface RoleSummary {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  isActive: boolean;
  userCount: number;
  permissions: string[];
}

export interface PermissionGroup {
  module: string;
  label: string;
  phase: number;
  permissions: { code: string; action: string; description: string | null }[];
}

export interface UserRow {
  id: string;
  fullName: string;
  email: string;
  username: string;
  isActive: boolean;
  lastLoginAt: string | null;
  lockedUntil: string | null;
  createdAt: string;
  roles: { id: string; code: string; name: string }[];
}

export interface AuditLogRow {
  id: string;
  action: string;
  module: string;
  recordId: string | null;
  oldValues: unknown;
  newValues: unknown;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  user: { id: string; fullName: string; username: string } | null;
}

export interface DashboardSummary {
  range: { preset: string; from: string; to: string };
  cards: {
    totalSales: string; stitchingRevenue: string; fabricSales: string; totalOrders: number; cancelledOrders: number;
    pendingOrders: number; completedOrders: number; deliveredOrders: number; customerOutstanding: string;
    totalExpenses: string; cashReceived: string; netProfit: string; fabricStockValue: string; lowStockItems: number;
  };
}

export interface DashboardCharts {
  range: { preset: string; from: string; to: string };
  dailySales: { date: string; total: string; stitching: string; fabric: string }[];
  monthlyRevenue: { month: string; total: string; stitching: string; fabric: string }[];
  monthlyExpenses: { month: string; total: string }[];
  profitTrend: { month: string; income: string; expense: string; profit: string }[];
  orderStatus: { code: string; name: string; color: string; count: number }[];
  employeeProduction: { employeeId: string; name: string; completed: number; rejected: number }[];
}

export type SettingsMap = Record<string, Record<string, unknown>>;

export type CustomerType = 'WALK_IN' | 'REGULAR' | 'VIP' | 'CORPORATE';
export type CustomerStatus = 'ACTIVE' | 'INACTIVE' | 'BLOCKED';

export interface Customer {
  id: string;
  code: string;
  name: string;
  mobile: string;
  whatsapp: string | null;
  email: string | null;
  city: string | null;
  address: string | null;
  customerType: CustomerType;
  registrationDate: string;
  notes: string | null;
  status: CustomerStatus;
  openingBalance: string;
  whatsappOptIn: boolean;
  version: number;
  createdAt: string;
  outstanding?: string;
}

export interface CustomerProfile extends Customer {
  stats: {
    totalOrders: number; openOrders: number; totalBilled: string; totalPaid: string; outstanding: string;
    measurementVersions: number; lastMeasurementAt: string | null; lastOrderDate: string | null;
  };
}

export interface DuplicateMatch { id: string; code: string; name: string; mobile: string; city: string | null; reason: 'MOBILE' | 'WHATSAPP' | 'NAME' }

export interface TemplateField { id: string; key: string; label: string; sortOrder: number; isRequired: boolean; isActive: boolean }
export interface MeasurementTemplate {
  id: string; code: string; name: string; garmentCategory: string; defaultUnit: 'INCH' | 'CM'; isSystem: boolean; isActive: boolean; fields: TemplateField[];
}

export interface MeasurementValue { fieldKey: string; fieldLabel: string; isCustom: boolean; value: string | null; textValue: string | null }
export interface Measurement {
  id: string;
  customer: { id: string; code: string; name: string; mobile: string };
  template: { id: string; code: string; name: string; garmentCategory: string };
  versionNo: number;
  unit: 'INCH' | 'CM';
  isLatest: boolean;
  takenAt: string;
  takenByName: string | null;
  notes: string | null;
  createdBy: { id: string; fullName: string } | null;
  values: MeasurementValue[];
}

export interface MeasurementComparison {
  unit: 'INCH' | 'CM';
  from: { id: string; versionNo: number; unit: string; takenAt: string; template: { name: string } };
  to: { id: string; versionNo: number; unit: string; takenAt: string; template: { name: string } };
  sameTemplate: boolean;
  fields: { fieldKey: string; fieldLabel: string; from: string | null; to: string | null; fromText: string | null; toText: string | null; difference: string | null; changed: boolean }[];
}

export interface LedgerResponse {
  customer: { id: string; code: string; name: string };
  entries: { id: string; date: string; entryType: string; description: string | null; debit: string; credit: string; balance: string }[];
  totals: { debit: string; credit: string; balance: string };
}

// ---------------------------------------------------------------- Phase 3: orders & garments

export interface StageRef { id: string; code: string; name: string; color: string; sortOrder: number }
export interface WorkflowStage extends StageRef { isTerminal: boolean; isSystem: boolean; isActive: boolean; openItems: number }

export interface Garment {
  id: string; code: string; name: string; category: string; isActive: boolean;
  measurementTemplate: { id: string; code: string; name: string } | null;
  defaultStitchingPrice: string; defaultFabricConsumption: string; defaultPieceRate: string; piecesOrdered?: number;
}

export type OrderLifecycle = 'OPEN' | 'PARTIALLY_DELIVERED' | 'DELIVERED' | 'CANCELLED';
export type PaymentStatus = 'UNPAID' | 'PARTIAL' | 'PAID' | 'OVERPAID';

export interface OrderListRow {
  id: string; orderNumber: string; orderType: string; customer: { id: string; code: string; name: string; mobile: string };
  orderDate: string; expectedDeliveryDate: string | null; stage: StageRef; lifecycle: OrderLifecycle; paymentStatus: PaymentStatus;
  totalAmount: string; paidAmount: string; balanceAmount: string; garments: string; totalPieces: number; deliveredPieces: number; isOverdue: boolean;
}

export interface OrderSummary {
  openOrders: number; overdue: number; dueToday: number; dueTomorrow: number; outstanding: string;
  stages: (StageRef & { count: number })[];
}

export interface SnapshotValue { key: string; label: string; value: string | null; text: string | null }
export interface EmployeeRef { id: string; code: string; name: string; designation?: string | null }

export interface OrderItem {
  id: string; lineNo: number; garmentTypeId: string | null; garmentType: { id: string; code: string; name: string; measurementTemplateId: string | null } | null;
  garmentName: string; quantity: number; deliveredQuantity: number; fabricSource: 'SHOP' | 'CUSTOMER'; fabricDescription: string | null;
  fabricQuantity: string; fabricPerPiece: string; fabricRate: string; fabricAmount: string; stitchingPrice: string; stitchingAmount: string;
  additionalCharges: string; lineTotal: string; notes: string | null; stage: StageRef; assignedEmployee: EmployeeRef | null; canRemove: boolean;
  measurement: { id: string; sourceMeasurementId: string | null; templateName: string; unit: 'INCH' | 'CM'; notes: string | null; takenAt: string; values: SnapshotValue[] } | null;
}

export interface OrderPayment {
  id: string; receiptNo: string; paymentDate: string; amount: string; method: string; type: string; status: string;
  reference: string | null; notes: string | null; createdBy: { id: string; fullName: string } | null;
}

export interface OrderDetail {
  id: string; orderNumber: string; orderType: string;
  customer: { id: string; code: string; name: string; mobile: string; whatsapp: string | null; city: string | null; status: CustomerStatus };
  orderDate: string; expectedDeliveryDate: string | null; actualDeliveryDate: string | null; stage: StageRef; lifecycle: OrderLifecycle; paymentStatus: PaymentStatus;
  stitchingTotal: string; fabricTotal: string; additionalCharges: string; discount: string; subtotal: string; totalAmount: string;
  adjustmentsTotal: string; effectiveTotal: string; paidAmount: string; balanceAmount: string; isOverdue: boolean;
  assignedEmployee: EmployeeRef | null; specialInstructions: string | null; revisionNo: number; duplicatedFrom: { id: string; orderNumber: string } | null;
  cancelledAt: string | null; cancelReason: string | null; version: number; createdBy: { id: string; fullName: string } | null; createdAt: string;
  items: OrderItem[]; totalPieces: number; deliveredPieces: number;
  statusHistory: { id: string; fromStage: StageRef | null; toStage: StageRef; notes: string | null; changedBy: { fullName: string } | null; changedAt: string; item: { id: string; lineNo: number; garmentName: string } | null }[];
  deliveries: { id: string; deliveryNo: number; deliveredAt: string; receivedBy: string | null; notes: string | null; items: { orderItemId: string; garmentName: string; lineNo: number; quantity: number }[] }[];
  adjustments: { id: string; type: string; amount: string; reason: string; createdAt: string }[];
  payments: OrderPayment[];
  activity: { id: string; action: string; createdAt: string; user: { fullName: string } | null; note: string | null }[];
}

export interface OrderFormOptions {
  garments: Garment[];
  stages: (StageRef & { isTerminal: boolean })[];
  employees: EmployeeRef[];
  settings: { defaultDeliveryDays?: number; requireAdvancePayment?: boolean; minimumAdvancePercent?: number };
  today: string;
}

export interface CustomerMeasurementRef { id: string; templateId: string; templateName: string; versionNo: number; isLatest: boolean; takenAt: string; unit: 'INCH' | 'CM' }
