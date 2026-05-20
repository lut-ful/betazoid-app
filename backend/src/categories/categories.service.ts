import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { Category } from './entities/category.entity';

@Injectable()
export class CategoriesService {
    constructor(
        @InjectRepository(Category)
        private readonly categoryRepo: Repository<Category>,
    ) {}

    async create(dto: CreateCategoryDto): Promise<Category> {
        const existing = await this.categoryRepo.findOne({ where: { name: dto.name } });
        if (existing) throw new ConflictException('A category with this name already exists');

        let parent: Category | null = null;
        if (dto.parentCategoryId) {
            parent = await this.categoryRepo.findOne({
                where: { category_id: dto.parentCategoryId },
            });
            if (!parent) throw new NotFoundException('Parent category not found');
        }

        const category = this.categoryRepo.create({ name: dto.name, parent });
        return this.categoryRepo.save(category);
    }

    async findAll(): Promise<Category[]> {
        return this.categoryRepo.find({
            relations: { parent: true, children: true },
            order: { name: 'ASC' },
        });
    }

    async update(categoryId: string, dto: UpdateCategoryDto): Promise<Category> {
        const category = await this.categoryRepo.findOne({
            where: { category_id: categoryId },
            relations: { parent: true },
        });
        if (!category) throw new NotFoundException('Category not found');

        if (dto.name && dto.name !== category.name) {
            const conflict = await this.categoryRepo.findOne({ where: { name: dto.name } });
            if (conflict) throw new ConflictException('A category with this name already exists');
            category.name = dto.name;
        }

        if (dto.parentCategoryId !== undefined) {
            if (dto.parentCategoryId === null) {
                category.parent = null;
            } else {
                if (dto.parentCategoryId === categoryId) {
                    throw new BadRequestException('A category cannot be its own parent');
                }
                const parent = await this.categoryRepo.findOne({
                    where: { category_id: dto.parentCategoryId },
                });
                if (!parent) throw new NotFoundException('Parent category not found');
                category.parent = parent;
            }
        }

        return this.categoryRepo.save(category);
    }

    async remove(categoryId: string): Promise<void> {
        const category = await this.categoryRepo.findOne({
            where: { category_id: categoryId },
            relations: { children: true },
        });
        if (!category) throw new NotFoundException('Category not found');

        if (category.children.length > 0) {
            throw new BadRequestException(
                `This category has ${category.children.length} subcategor${category.children.length > 1 ? 'ies' : 'y'}. Reassign or delete them first.`,
            );
        }

        await this.categoryRepo.remove(category);
    }
}
