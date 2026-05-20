import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, In, Repository } from 'typeorm';
import { Permission } from '../permissions/entities/permission.entity';
import { User } from '../users/entities/user.entity';
import { AssignPermissionsDto } from './dto/assign-permissions.dto';
import { AssignRolesDto } from './dto/assign-roles.dto';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { Role } from './entities/role.entity';
import { UserRole } from './entities/user-role.entity';

@Injectable()
export class RolesService {
    constructor(
        @InjectRepository(Role)
        private readonly roleRepo: Repository<Role>,
        @InjectRepository(Permission)
        private readonly permissionRepo: Repository<Permission>,
        @InjectRepository(User)
        private readonly userRepo: Repository<User>,
        @InjectRepository(UserRole)
        private readonly userRoleRepo: Repository<UserRole>,
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
        return this.roleRepo
            .createQueryBuilder('role')
            .loadRelationCountAndMap('role.userCount', 'role.userRoles')
            .orderBy('role.created_at', 'ASC')
            .getMany();
    }

    async update(roleId: string, dto: UpdateRoleDto): Promise<Role> {
        const role = await this.roleRepo.findOne({ where: { role_id: roleId } });
        if (!role) throw new NotFoundException('Role not found');

        if (dto.name && dto.name !== role.name) {
            const conflict = await this.roleRepo.findOne({ where: { name: dto.name } });
            if (conflict) throw new ConflictException('A role with this name already exists');
            role.name = dto.name;
        }

        if (dto.description !== undefined) {
            role.description = dto.description ?? null;
        }

        return this.roleRepo.save(role);
    }

    async remove(roleId: string): Promise<void> {
        const role = await this.roleRepo.findOne({ where: { role_id: roleId } });
        if (!role) throw new NotFoundException('Role not found');
        await this.roleRepo.remove(role);
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

    async searchUsers(query: string): Promise<Partial<User>[]> {
        const where = query
            ? [{ full_name: ILike(`%${query}%`) }, { email: ILike(`%${query}%`) }]
            : undefined;

        return this.userRepo.find({
            select: {
                user_id: true,
                full_name: true,
                email: true,
                gmail: true,
                bio: true,
                profile_photo_url: true,
                is_email_verified: true,
                created_at: true,
                updated_at: true,
                userRoles: {
                    user_role_id: true,
                    created_at: true,
                    role: { role_id: true, name: true },
                },
            },
            where,
            relations: { userRoles: { role: true } },
            order: { full_name: 'ASC' },
            take: 50,
        });
    }

    async assignRolesToUser(userId: string, dto: AssignRolesDto): Promise<void> {
        const user = await this.userRepo.findOne({ where: { user_id: userId } });
        if (!user) throw new NotFoundException('User not found');

        const roles =
            dto.roleIds.length > 0
                ? await this.roleRepo.findBy({ role_id: In(dto.roleIds) })
                : [];

        if (dto.roleIds.length > 0 && roles.length !== dto.roleIds.length) {
            throw new NotFoundException('One or more roles not found');
        }

        await this.userRoleRepo
            .createQueryBuilder()
            .delete()
            .from(UserRole)
            .where('user_id = :userId', { userId })
            .execute();

        if (roles.length > 0) {
            const userRoles = roles.map((role) => this.userRoleRepo.create({ user, role }));
            await this.userRoleRepo.save(userRoles);
        }
    }
}
