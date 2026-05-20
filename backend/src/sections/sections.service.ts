import {
    BadRequestException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Section } from './entities/section.entity';
import { Course, CourseStatus } from '../courses/entities/course.entity';
import { CreateSectionDto } from './dto/create-section.dto';
import { UpdateSectionDto } from './dto/update-section.dto';
import { ReorderSectionsDto } from './dto/reorder-sections.dto';

@Injectable()
export class SectionsService {
    constructor(
        @InjectRepository(Section)
        private readonly sectionRepo: Repository<Section>,
        @InjectRepository(Course)
        private readonly courseRepo: Repository<Course>,
        private readonly dataSource: DataSource,
    ) {}

    private async verifyCourseOwnership(courseId: string, instructorId: string): Promise<Course> {
        const course = await this.courseRepo.findOne({
            where: { course_id: courseId },
            relations: ['instructor'],
        });
        if (!course) throw new NotFoundException('Course not found');
        if (course.instructor.user_id !== instructorId) throw new ForbiddenException('Access denied');
        if (course.status === CourseStatus.PENDING) {
            throw new ForbiddenException('Course cannot be edited while it is pending review');
        }
        return course;
    }

    async create(courseId: string, dto: CreateSectionDto, instructorId: string): Promise<Section> {
        const course = await this.verifyCourseOwnership(courseId, instructorId);

        const count = await this.sectionRepo.count({
            where: { course: { course_id: courseId } },
        });

        const section = this.sectionRepo.create({
            title: dto.title,
            order: count,
            course,
        });

        return this.sectionRepo.save(section);
    }

    async findByCourse(courseId: string, instructorId: string): Promise<Section[]> {
        await this.verifyCourseOwnership(courseId, instructorId);

        return this.sectionRepo.find({
            where: { course: { course_id: courseId } },
            order: { order: 'ASC' },
        });
    }

    async update(
        courseId: string,
        sectionId: string,
        dto: UpdateSectionDto,
        instructorId: string,
    ): Promise<Section> {
        await this.verifyCourseOwnership(courseId, instructorId);

        const section = await this.sectionRepo.findOne({
            where: { section_id: sectionId, course: { course_id: courseId } },
        });
        if (!section) throw new NotFoundException('Section not found');

        if (dto.title !== undefined) section.title = dto.title;

        return this.sectionRepo.save(section);
    }

    async remove(courseId: string, sectionId: string, instructorId: string): Promise<void> {
        await this.verifyCourseOwnership(courseId, instructorId);

        const section = await this.sectionRepo.findOne({
            where: { section_id: sectionId, course: { course_id: courseId } },
        });
        if (!section) throw new NotFoundException('Section not found');

        await this.sectionRepo.remove(section);
    }

    async reorder(
        courseId: string,
        dto: ReorderSectionsDto,
        instructorId: string,
    ): Promise<Section[]> {
        await this.verifyCourseOwnership(courseId, instructorId);

        const sections = await this.sectionRepo.find({
            where: { course: { course_id: courseId } },
        });

        if (dto.orderedIds.length !== sections.length) {
            throw new BadRequestException(
                'orderedIds must contain all section IDs for this course',
            );
        }

        const sectionMap = new Map(sections.map((s) => [s.section_id, s]));

        for (const id of dto.orderedIds) {
            if (!sectionMap.has(id)) {
                throw new BadRequestException(`Section ${id} does not belong to this course`);
            }
        }

        await this.dataSource.transaction(async (manager) => {
            for (let i = 0; i < dto.orderedIds.length; i++) {
                const section = sectionMap.get(dto.orderedIds[i])!;
                section.order = i;
                await manager.save(Section, section);
            }
        });

        return this.sectionRepo.find({
            where: { course: { course_id: courseId } },
            order: { order: 'ASC' },
        });
    }
}
