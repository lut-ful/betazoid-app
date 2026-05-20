import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Permission } from './entities/permission.entity';

const SEED_PERMISSIONS = [
    'create:users', 'read:users', 'update:users', 'delete:users',
    'create:roles', 'read:roles', 'update:roles', 'delete:roles',
    'assign:permissions', 'read:permissions',
    'create:courses', 'read:courses', 'update:courses', 'delete:courses', 'publish:courses',
    'create:categories', 'read:categories', 'update:categories', 'delete:categories',
    'create:sections', 'read:sections', 'update:sections', 'delete:sections',
    'create:lectures', 'read:lectures', 'update:lectures', 'delete:lectures',
    'create:enrollments', 'read:enrollments', 'delete:enrollments',
    'create:orders', 'read:orders', 'update:orders',
    'create:coupons', 'read:coupons', 'update:coupons', 'delete:coupons',
    'read:progress', 'update:progress',
    'read:certificates', 'delete:certificates',
    'create:reviews', 'read:reviews', 'delete:reviews',
    'read:payouts', 'update:payouts',
];

@Injectable()
export class PermissionsService implements OnApplicationBootstrap {
    constructor(
        @InjectRepository(Permission)
        private readonly permissionRepo: Repository<Permission>,
    ) {}

    async onApplicationBootstrap(): Promise<void> {
        await this.seedPermissions();
    }

    private async seedPermissions(): Promise<void> {
        const existing = await this.permissionRepo.find({ select: ['name'] });
        const existingNames = new Set(existing.map((p) => p.name));
        const toInsert = SEED_PERMISSIONS.filter((name) => !existingNames.has(name));
        if (toInsert.length === 0) return;
        const entities = toInsert.map((name) => this.permissionRepo.create({ name }));
        await this.permissionRepo.save(entities);
    }

    findAll(): Promise<Permission[]> {
        return this.permissionRepo.find({ order: { name: 'ASC' } });
    }

    findByIds(ids: string[]): Promise<Permission[]> {
        if (ids.length === 0) return Promise.resolve([]);
        return this.permissionRepo.findBy({ permission_id: In(ids) });
    }
}
