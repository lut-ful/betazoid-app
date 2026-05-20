import {
    Body,
    Controller,
    Get,
    HttpCode,
    HttpStatus,
    Param,
    ParseUUIDPipe,
    Post,
    Put,
    UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AssignPermissionsDto } from './dto/assign-permissions.dto';
import { CreateRoleDto } from './dto/create-role.dto';
import { SuperAdminGuard } from './guards/super-admin.guard';
import { RolesService } from './roles.service';

@Controller('roles')
@UseGuards(JwtAuthGuard, SuperAdminGuard)
export class RolesController {
    constructor(private readonly rolesService: RolesService) {}

    @Post()
    @HttpCode(HttpStatus.CREATED)
    create(@Body() dto: CreateRoleDto) {
        return this.rolesService.create(dto);
    }

    @Get()
    findAll() {
        return this.rolesService.findAll();
    }

    @Get(':id/permissions')
    findRoleWithPermissions(@Param('id', ParseUUIDPipe) id: string) {
        return this.rolesService.findRoleWithPermissions(id);
    }

    @Put(':id/permissions')
    @HttpCode(HttpStatus.OK)
    assignPermissions(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: AssignPermissionsDto,
    ) {
        return this.rolesService.assignPermissions(id, dto);
    }
}
