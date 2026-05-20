import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Permission } from '../permissions/entities/permission.entity';
import { AssignPermissionsDto } from './dto/assign-permissions.dto';
import { CreateRoleDto } from './dto/create-role.dto';
import { Role } from './entities/role.entity';

@Injectable()
export class RolesService {
    constructor(
        @InjectRepository(Role)
        private readonly roleRepo: Repository<Role>,
        @InjectRepository(Permission)
        private readonly permissionRepo: Repository<Permission>,
    ) {}

    async create(dto: CreateRoleDto): Promise<Role> {
        const existing = await this.roleRepo.findOne({ where: { name: dto.name } });
        if (existing) throw new ConflictException('A role with this name already exists');

        const role = this.roleRepo.create({
            name: dto.name,
            description: dto.description ?? null,
        });
        return this.roleRepo.save(role);
    }

    async findAll(): Promise<Role[]> {
        return this.roleRepo.find({ order: { created_at: 'ASC' } });
    }

    async findRoleWithPermissions(roleId: string): Promise<Role> {
        const role = await this.roleRepo.findOne({
            where: { role_id: roleId },
            relations: ['permissions'],
        });
        if (!role) throw new NotFoundException('Role not found');
        return role;
    }

    async assignPermissions(roleId: string, dto: AssignPermissionsDto): Promise<Role> {
        const role = await this.roleRepo.findOne({
            where: { role_id: roleId },
            relations: ['permissions'],
        });
        if (!role) throw new NotFoundException('Role not found');

        const permissions =
            dto.permissionIds.length > 0
                ? await this.permissionRepo.findBy({ permission_id: In(dto.permissionIds) })
                : [];
        role.permissions = permissions;
        return this.roleRepo.save(role);
    }
}
