# Database ER Diagram

60 tables in PostgreSQL 16. Source of truth: `apps/backend/prisma/schema.prisma`.
Diagrams are split by domain for readability (GitHub and most Markdown viewers render Mermaid).

## 1. Security, RBAC & system

```mermaid
erDiagram
  users ||--o{ user_roles : has
  roles ||--o{ user_roles : assigned
  roles ||--o{ role_permissions : grants
  permissions ||--o{ role_permissions : in
  users ||--o{ sessions : opens
  users ||--o{ audit_logs : performs
  users ||--o{ notifications : receives
  users ||--o{ sync_operations : pushes
  sync_operations ||--o{ sync_conflicts : raises
  users ||--o{ backup_records : creates
  users ||--o| employees : "may be linked to"
  users { uuid id PK  string email UK  string username UK  string passwordHash  bool isActive  int failedLoginAttempts  timestamp lockedUntil }
  roles { uuid id PK  string code UK  string name UK  bool isSystem }
  permissions { uuid id PK  string code UK  string module  enum action }
  sessions { uuid id PK  string tokenHash UK  string csrfToken  timestamp expiresAt  timestamp revokedAt }
  audit_logs { uuid id PK  string action  string module  string recordId  json oldValues  json newValues  string ipAddress }
  system_settings { string key PK  json value }
  number_sequences { uuid id PK  string key  string period  int nextValue }
  login_attempts { uuid id PK  string identifier  bool success }
  idempotency_keys { string key PK  string endpoint }
  attachments { uuid id PK  string entityType  uuid entityId }
```

## 2. Customers, measurements, orders & production

```mermaid
erDiagram
  customers ||--o{ customer_addresses : has
  customers ||--o{ customer_notes : has
  customers ||--o{ customer_measurements : "measured (versions)"
  measurement_templates ||--o{ measurement_fields : defines
  measurement_templates ||--o{ customer_measurements : uses
  customer_measurements ||--o{ measurement_values : contains
  measurement_fields ||--o{ measurement_values : "value of"
  garments }o--o| measurement_templates : "default template"
  customers ||--o{ orders : places
  orders ||--|{ order_items : contains
  garments ||--o{ order_items : "type of"
  order_items ||--o| garment_measurements : "frozen snapshot"
  customer_measurements ||--o{ garment_measurements : "copied from"
  workflow_stages ||--o{ orders : "current stage"
  workflow_stages ||--o{ order_items : "current stage"
  orders ||--o{ order_status_history : logs
  orders ||--o{ order_deliveries : "partial deliveries"
  order_deliveries ||--|{ order_delivery_items : lists
  orders ||--o{ order_adjustments : "authorised changes"
  order_items ||--o{ employee_assignments : "assigned to"
  employees ||--o{ employee_assignments : works
  employee_assignments ||--o{ production_records : records
  production_records }o--o| payroll_items : "paid in"
  orders { uuid id PK  string orderNumber UK  date orderDate  date expectedDeliveryDate  enum lifecycle  decimal totalAmount  decimal paidAmount  decimal balanceAmount  int version }
  order_items { uuid id PK  int lineNo  int quantity  decimal fabricQuantity  decimal stitchingAmount  decimal lineTotal }
  customer_measurements { uuid id PK  int versionNo  enum unit  bool isLatest }
```

## 3. Inventory, suppliers & purchases

```mermaid
erDiagram
  fabric_categories ||--o{ fabrics : groups
  suppliers ||--o{ fabrics : "usual supplier"
  fabrics ||--o{ inventory_movements : "stock ledger"
  fabrics ||--o{ stock_reservations : reserved
  orders ||--o{ stock_reservations : reserves
  order_items }o--o| fabrics : "shop fabric"
  suppliers ||--o{ purchase_orders : receives
  purchase_orders ||--|{ purchase_order_items : lists
  suppliers ||--o{ purchases : invoices
  purchases ||--|{ purchase_items : lists
  purchases ||--o{ purchase_returns : returned
  purchase_returns ||--|{ purchase_return_items : lists
  suppliers ||--o{ supplier_payments : paid
  suppliers ||--o{ supplier_ledger : ledger
  orders ||--o{ sale_returns : returns
  sale_returns ||--|{ sale_return_items : lists
  fabrics { uuid id PK  string code UK  enum unit  decimal currentStock  decimal reservedStock  decimal averageCost  decimal minimumStock }
  inventory_movements { uuid id PK  enum type  enum direction  decimal quantity  decimal balanceAfter  string idempotencyKey UK }
```

## 4. Employees, attendance & payroll

```mermaid
erDiagram
  employees ||--o{ salary_structures : "salary history"
  employees ||--o{ employment_history : history
  employees ||--o{ attendance : "daily (unique per day)"
  employees ||--o{ leave_records : takes
  employees ||--o{ overtime_records : works
  employees ||--o{ employee_advances : borrows
  employee_advances ||--o{ advance_recoveries : "recovered by"
  payrolls ||--|{ payroll_items : "one per employee"
  employees ||--o{ payroll_items : earns
  payroll_items ||--o{ advance_recoveries : deducts
  payroll_items ||--o{ overtime_records : includes
  payroll_items ||--o{ salary_payments : "paid by"
  payroll_items { uuid id PK  string periodKey  decimal grossAmount  decimal netAmount  decimal paidAmount }
```

## 5. Payments, expenses & accounting

```mermaid
erDiagram
  customers ||--o{ payments : pays
  orders ||--o{ payments : "settled by"
  payments ||--o| payments : "reversal of"
  customers ||--o{ customer_ledger : ledger
  expense_categories ||--o{ expenses : groups
  expense_categories }o--o| chart_of_accounts : "posts to"
  recurring_expenses ||--o{ expenses : generates
  chart_of_accounts ||--o{ chart_of_accounts : parent
  accounting_periods ||--o{ journal_entries : contains
  journal_entries ||--|{ journal_entry_lines : "balanced lines"
  chart_of_accounts ||--o{ journal_entry_lines : account
  journal_entries ||--o| journal_entries : "reversal of"
  journal_entry_lines }o--o| customers : "sub-ledger"
  journal_entry_lines }o--o| suppliers : "sub-ledger"
  journal_entry_lines }o--o| employees : "sub-ledger"
  customers ||--o{ whatsapp_messages : receives
  whatsapp_templates ||--o{ whatsapp_messages : uses
  journal_entries { uuid id PK  string entryNo UK  date entryDate  enum status  string sourceKey UK  decimal totalDebit  decimal totalCredit }
  journal_entry_lines { uuid id PK  decimal debit  decimal credit }
  payments { uuid id PK  string receiptNo UK  decimal amount  enum type  string idempotencyKey UK  enum status }
```
