import { Module } from '@nestjs/common';
import { RolesController } from './roles.controller';
import { RolesService } from './roles.service';

/** AuthorizationModule: roles, permission catalogue and role-permission matrix. */
@Module({ controllers: [RolesController], providers: [RolesService] })
export class RolesModule {}
