import {
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { unlinkSync } from 'fs';
import { join } from 'path';
import { LectureResource, ResourceType } from './entities/lecture-resource.entity';
import { Lecture } from '../lectures/entities/lecture.entity';
import { Section } from '../sections/entities/section.entity';
import { CourseStatus } from '../courses/entities/course.entity';
import { AddLinkDto } from './dto/add-link.dto';

@Injectable()
export class LectureResourcesService {
    constructor(
        @InjectRepository(LectureResource)
        private readonly resourceRepo: Repository<LectureResource>,
        @InjectRepository(Lecture)
        private readonly lectureRepo: Repository<Lecture>,
        @InjectRepository(Section)
        private readonly sectionRepo: Repository<Section>,
    ) {}

    private async verifyLectureOwnership(
        courseId: string,
        sectionId: string,
        lectureId: string,
        instructorId: string,
    ): Promise<Lecture> {
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

        const lecture = await this.lectureRepo.findOne({
            where: { lecture_id: lectureId, section: { section_id: sectionId } },
        });
        if (!lecture) throw new NotFoundException('Lecture not found');
        return lecture;
    }

    async addLink(
        courseId: string,
        sectionId: string,
        lectureId: string,
        dto: AddLinkDto,
        instructorId: string,
    ): Promise<LectureResource> {
        const lecture = await this.verifyLectureOwnership(courseId, sectionId, lectureId, instructorId);

        const resource = this.resourceRepo.create({
            title: dto.title,
            resource_type: ResourceType.LINK,
            url: dto.url,
            original_filename: null,
            lecture,
        });
        return this.resourceRepo.save(resource);
    }

    async addFile(
        courseId: string,
        sectionId: string,
        lectureId: string,
        file: Express.Multer.File,
        title: string,
        instructorId: string,
    ): Promise<LectureResource> {
        const lecture = await this.verifyLectureOwnership(courseId, sectionId, lectureId, instructorId);

        const resource = this.resourceRepo.create({
            title,
            resource_type: ResourceType.FILE,
            url: `/uploads/resources/${file.filename}`,
            original_filename: file.originalname,
            lecture,
        });
        return this.resourceRepo.save(resource);
    }

    async findByLecture(
        courseId: string,
        sectionId: string,
        lectureId: string,
        instructorId: string,
    ): Promise<LectureResource[]> {
        await this.verifyLectureOwnership(courseId, sectionId, lectureId, instructorId);

        return this.resourceRepo.find({
            where: { lecture: { lecture_id: lectureId } },
            order: { created_at: 'ASC' },
        });
    }

    async remove(
        courseId: string,
        sectionId: string,
        lectureId: string,
        resourceId: string,
        instructorId: string,
    ): Promise<void> {
        await this.verifyLectureOwnership(courseId, sectionId, lectureId, instructorId);

        const resource = await this.resourceRepo.findOne({
            where: { resource_id: resourceId, lecture: { lecture_id: lectureId } },
        });
        if (!resource) throw new NotFoundException('Resource not found');

        if (resource.resource_type === ResourceType.FILE) {
            try {
                unlinkSync(join(process.cwd(), resource.url));
            } catch {
                // file may already be gone — ignore
            }
        }

        await this.resourceRepo.remove(resource);
    }
}
