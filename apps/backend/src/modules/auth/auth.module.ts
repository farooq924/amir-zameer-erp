import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { CsrfGuard, PermissionsGuard, SessionAuthGuard } from './guards';
import { PasswordService } from './password.service';
import { SessionService } from './session.service';

@Module({
  controllers: [AuthController],
  providers: [AuthService, PasswordService, SessionService, SessionAuthGuard, CsrfGuard, PermissionsGuard],
  exports: [PasswordService, SessionService, SessionAuthGuard, CsrfGuard, PermissionsGuard],
})
export class AuthModule {}
