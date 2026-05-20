import {
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    HttpStatus,
    Param,
    ParseUUIDPipe,
    Patch,
    Post,
    Put,
    Query,
    UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AssignPermissionsDto } from './dto/assign-permissions.dto';
import { AssignRolesDto } from './dto/assign-roles.dto';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
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

    @Get('users')
    searchUsers(@Query('search') search: string = '') {
        return this.rolesService.searchUsers(search);
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

    @Patch(':id')
    @HttpCode(HttpStatus.OK)
    update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateRoleDto) {
        return this.rolesService.update(id, dto);
    }

    @Delete(':id')
    @HttpCode(HttpStatus.NO_CONTENT)
    remove(@Param('id', ParseUUIDPipe) id: string) {
        return this.rolesService.remove(id);
    }

    @Put('users/:userId/roles')
    @HttpCode(HttpStatus.OK)
    assignRolesToUser(
        @Param('userId', ParseUUIDPipe) userId: string,
        @Body() dto: AssignRolesDto,
    ) {
        return this.rolesService.assignRolesToUser(userId, dto);
    }
}
