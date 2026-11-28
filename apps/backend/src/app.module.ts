import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { CommonModule } from './common/common.module';
import { PrismaModule } from './common/prisma/prisma.module';
import { AuditLogsModule } from './modules/audit-logs/audit-logs.module';
import { AuthModule } from './modules/auth/auth.module';
import { CustomersModule } from './modules/customers/customers.module';
import { GarmentsModule } from './modules/garments/garments.module';
import { MeasurementsModule } from './modules/measurements/measurements.module';
import { OrdersModule } from './modules/orders/orders.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { PurchasesModule } from './modules/purchases/purchases.module';
import { SuppliersModule } from './modules/suppliers/suppliers.module';
import { AttendanceModule } from './modules/attendance/attendance.module';
import { EmployeesModule } from './modules/employees/employees.module';
import { PayrollModule } from './modules/payroll/payroll.module';
import { ProductionModule } from './modules/production/production.module';
import { AccountingModule } from './modules/accounting/accounting.module';
import { ExpensesModule } from './modules/expenses/expenses.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { ReportsModule } from './modules/reports/reports.module';
import { WhatsAppModule } from './modules/whatsapp/whatsapp.module';
import { SyncModule } from './modules/sync/sync.module';
import { BackupModule } from './modules/backup/backup.module';
import { SecurityModule } from './modules/security/security.module';
import { CsrfGuard, PermissionsGuard, SessionAuthGuard } from './modules/auth/guards';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { HealthController } from './modules/health/health.controller';
import { RolesModule } from './modules/roles/roles.module';
import { SettingsModule } from './modules/settings/settings.module';
import { UsersModule } from './modules/users/users.module';

@Module({
  imports: [
    // Global API rate limit: 300 requests / minute / IP. Login has a stricter limit.
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 300 }]),
    PrismaModule,
    CommonModule,
    AuthModule,
    UsersModule,
    RolesModule,
    AuditLogsModule,
    SettingsModule,
    DashboardModule,
    CustomersModule,
    MeasurementsModule,
    GarmentsModule,
    OrdersModule,
    InventoryModule,
    SuppliersModule,
    PurchasesModule,
    EmployeesModule,
    AttendanceModule,
    ProductionModule,
    PayrollModule,
    AccountingModule,
    ExpensesModule,
    PaymentsModule,
    ReportsModule,
    WhatsAppModule,
    SyncModule,
    BackupModule,
    SecurityModule,
  ],
  controllers: [HealthController],
  providers: [
    // Order matters: rate limit -> session -> CSRF -> permissions.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useExisting: SessionAuthGuard },
    { provide: APP_GUARD, useExisting: CsrfGuard },
    { provide: APP_GUARD, useExisting: PermissionsGuard },
  ],
})
export class AppModule {}
