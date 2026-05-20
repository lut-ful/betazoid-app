import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserRole } from '../roles/entities/user-role.entity';
import { SuperAdminGuard } from '../roles/guards/super-admin.guard';
import { Permission } from './entities/permission.entity';
import { PermissionsController } from './permissions.controller';
import { PermissionsService } from './permissions.service';

@Module({
    imports: [TypeOrmModule.forFeature([Permission, UserRole])],
    controllers: [PermissionsController],
    providers: [PermissionsService, SuperAdminGuard],
    exports: [PermissionsService],
})
export class PermissionsModule {}
