import {
    BadRequestException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Lecture } from './entities/lecture.entity';
import { Section } from '../sections/entities/section.entity';
import { CourseStatus } from '../courses/entities/course.entity';
import { CreateLectureDto } from './dto/create-lecture.dto';
import { UpdateLectureDto } from './dto/update-lecture.dto';
import { ReorderLecturesDto } from './dto/reorder-lectures.dto';

@Injectable()
export class LecturesService {
    constructor(
        @InjectRepository(Lecture)
        private readonly lectureRepo: Repository<Lecture>,
        @InjectRepository(Section)
        private readonly sectionRepo: Repository<Section>,
        private readonly dataSource: DataSource,
    ) {}

    private async verifySectionOwnership(
        courseId: string,
        sectionId: string,
        instructorId: string,
    ): Promise<Section> {
        const section = await this.sectionRepo.findOne({
            where: { section_id: sectionId, course: { course_id: courseId } },
            relations: ['course', 'course.instructor'],
        });
        if (!section) throw new NotFoundException('Section not found');
        if (section.course.instructor.user_id !== instructorId) {
            throw new ForbiddenException('Access denied');
        }
        if (section.course.status === CourseStatus.PENDING) {
            throw new ForbiddenException('Course cannot be edited while it is pending review');
        }
        return section;
    }

    async create(
        courseId: string,
        sectionId: string,
        dto: CreateLectureDto,
        instructorId: string,
    ): Promise<Lecture> {
        const section = await this.verifySectionOwnership(courseId, sectionId, instructorId);

        const count = await this.lectureRepo.count({
            where: { section: { section_id: sectionId } },
        });

        const lecture = this.lectureRepo.create({
            title: dto.title,
            content_type: dto.content_type,
            order: count,
            section,
        });

        return this.lectureRepo.save(lecture);
    }

    async findBySection(
        courseId: string,
        sectionId: string,
        instructorId: string,
    ): Promise<Lecture[]> {
        await this.verifySectionOwnership(courseId, sectionId, instructorId);

        return this.lectureRepo.find({
            where: { section: { section_id: sectionId } },
            order: { order: 'ASC' },
        });
    }

    async update(
        courseId: string,
        sectionId: string,
        lectureId: string,
        dto: UpdateLectureDto,
        instructorId: string,
    ): Promise<Lecture> {
        await this.verifySectionOwnership(courseId, sectionId, instructorId);

        const lecture = await this.lectureRepo.findOne({
            where: { lecture_id: lectureId, section: { section_id: sectionId } },
        });
        if (!lecture) throw new NotFoundException('Lecture not found');

        if (dto.title !== undefined) lecture.title = dto.title;
        if (dto.content_type !== undefined) lecture.content_type = dto.content_type;
        if (dto.is_free_preview !== undefined) lecture.is_free_preview = dto.is_free_preview;

        return this.lectureRepo.save(lecture);
    }

    async remove(
        courseId: string,
        sectionId: string,
        lectureId: string,
        instructorId: string,
    ): Promise<void> {
        await this.verifySectionOwnership(courseId, sectionId, instructorId);

        const lecture = await this.lectureRepo.findOne({
            where: { lecture_id: lectureId, section: { section_id: sectionId } },
        });
        if (!lecture) throw new NotFoundException('Lecture not found');

        await this.lectureRepo.remove(lecture);
    }

    async reorder(
        courseId: string,
        sectionId: string,
        dto: ReorderLecturesDto,
        instructorId: string,
    ): Promise<Lecture[]> {
        await this.verifySectionOwnership(courseId, sectionId, instructorId);

        const lectures = await this.lectureRepo.find({
            where: { section: { section_id: sectionId } },
        });

        if (dto.orderedIds.length !== lectures.length) {
            throw new BadRequestException(
                'orderedIds must contain all lecture IDs for this section',
            );
        }

        const lectureMap = new Map(lectures.map((l) => [l.lecture_id, l]));

        for (const id of dto.orderedIds) {
            if (!lectureMap.has(id)) {
                throw new BadRequestException(`Lecture ${id} does not belong to this section`);
            }
        }

        await this.dataSource.transaction(async (manager) => {
            for (let i = 0; i < dto.orderedIds.length; i++) {
                const lecture = lectureMap.get(dto.orderedIds[i])!;
                lecture.order = i;
                await manager.save(Lecture, lecture);
            }
        });

        return this.lectureRepo.find({
            where: { section: { section_id: sectionId } },
            order: { order: 'ASC' },
        });
    }
}
