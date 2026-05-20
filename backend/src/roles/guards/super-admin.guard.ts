import {
    CanActivate,
    ExecutionContext,
    ForbiddenException,
    Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserRole } from '../entities/user-role.entity';

@Injectable()
export class SuperAdminGuard implements CanActivate {
    constructor(
        @InjectRepository(UserRole)
        private readonly userRoleRepo: Repository<UserRole>,
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest();
        const userId: string | undefined = request.user?.userId;

        if (!userId) throw new ForbiddenException();

        const record = await this.userRoleRepo
            .createQueryBuilder('ur')
            .innerJoin('ur.role', 'role')
            .where('ur.user_id = :userId', { userId })
            .andWhere('role.name = :name', { name: 'Super Admin' })
            .getOne();

        if (!record) throw new ForbiddenException();
        return true;
    }
}
