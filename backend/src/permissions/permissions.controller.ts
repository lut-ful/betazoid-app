import { Controller, Get, UseGuards } from '@nestjs/common';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { SuperAdminGuard } from '../roles/guards/super-admin.guard';
import { PermissionsService } from './permissions.service';

@Controller('permissions')
@UseGuards(SuperAdminGuard)
export class PermissionsController {
    constructor(private readonly permissionsService: PermissionsService) {}

    @Get()
    @RequirePermission('read:permissions')
    findAll() {
        return this.permissionsService.findAll();
    }
}
