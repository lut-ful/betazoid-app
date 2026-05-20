import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Role } from './entities/role.entity';
import { UserRole } from './entities/user-role.entity';
import { SuperAdminGuard } from './guards/super-admin.guard';
import { RolesController } from './roles.controller';
import { RolesService } from './roles.service';

@Module({
    imports: [TypeOrmModule.forFeature([Role, UserRole])],
    controllers: [RolesController],
    providers: [RolesService, SuperAdminGuard],
    exports: [RolesService, SuperAdminGuard],
})
export class RolesModule {}
