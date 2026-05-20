import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateRoleDto } from './dto/create-role.dto';
import { Role } from './entities/role.entity';

@Injectable()
export class RolesService {
    constructor(
        @InjectRepository(Role)
        private readonly roleRepo: Repository<Role>,
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
}
