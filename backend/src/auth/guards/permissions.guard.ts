import {
    CanActivate,
    ExecutionContext,
    ForbiddenException,
    Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { PERMISSION_KEY } from '../decorators/require-permission.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { RedisService } from '../../redis/redis.service';

const CACHE_TTL = 300; // 5 minutes

@Injectable()
export class PermissionsGuard implements CanActivate {
    constructor(
        private readonly reflector: Reflector,
        @InjectDataSource() private readonly dataSource: DataSource,
        private readonly redisService: RedisService,
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);
        if (isPublic) return true;

        const required = this.reflector.getAllAndOverride<string | undefined>(
            PERMISSION_KEY,
            [context.getHandler(), context.getClass()],
        );

        if (!required) return true;

        const request = context.switchToHttp().getRequest();
        const userId: string | undefined = request.user?.userId;
        if (!userId) throw new ForbiddenException();

        const permissions = await this.loadPermissions(userId);
        if (!permissions.has(required)) throw new ForbiddenException();

        return true;
    }

    async loadPermissions(userId: string): Promise<Set<string>> {
        const cacheKey = `user_perms:${userId}`;

        const cached = await this.redisService.get(cacheKey);
        if (cached) {
            return new Set<string>(JSON.parse(cached) as string[]);
        }

        // user_roles -> role_permissions -> permissions
        const rows = await this.dataSource
            .createQueryBuilder()
            .select('p.name', 'permission_name')
            .from('user_roles', 'ur')
            .innerJoin('role_permissions', 'rp', 'rp.role_id = ur.role_id')
            .innerJoin('permissions', 'p', 'p.permission_id = rp.permission_id')
            .where('ur.user_id = :userId', { userId })
            .getRawMany<{ permission_name: string }>();

        const names = rows.map((r) => r.permission_name);
        await this.redisService.set(cacheKey, JSON.stringify(names), CACHE_TTL);
        return new Set<string>(names);
    }
}
