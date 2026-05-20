import {
    BadRequestException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Course, CourseStatus } from './entities/course.entity';
import { CreateCourseDto } from './dto/create-course.dto';
import { UpdateCourseDto } from './dto/update-course.dto';
import { Category } from '../categories/entities/category.entity';
import { MailService } from '../mail/mail.service';

@Injectable()
export class CoursesService {
    constructor(
        @InjectRepository(Course)
        private readonly courseRepo: Repository<Course>,
        @InjectRepository(Category)
        private readonly categoryRepo: Repository<Category>,
        private readonly mailService: MailService,
        private readonly config: ConfigService,
    ) {}

    async create(dto: CreateCourseDto, instructorId: string): Promise<Course> {
        let category: Category | null = null;
        if (dto.categoryId) {
            category = await this.categoryRepo.findOne({
                where: { category_id: dto.categoryId },
            });
            if (!category) {
                throw new NotFoundException('Category not found');
            }
        }

        const course = this.courseRepo.create({
            title: dto.title,
            description: dto.description,
            price: dto.price,
            thumbnail_url: dto.thumbnail_url ?? null,
            language: dto.language,
            level: dto.level,
            status: CourseStatus.DRAFT,
            instructor: { user_id: instructorId } as any,
            category,
        });

        return this.courseRepo.save(course);
    }

    async findByInstructor(instructorId: string): Promise<Course[]> {
        return this.courseRepo.find({
            where: { instructor: { user_id: instructorId } },
            relations: ['category'],
            order: { created_at: 'DESC' },
        });
    }

    async findOne(courseId: string, instructorId: string): Promise<Course> {
        const exists = await this.courseRepo.exists({ where: { course_id: courseId } });
        if (!exists) throw new NotFoundException('Course not found');

        const course = await this.courseRepo.findOne({
            where: { course_id: courseId, instructor: { user_id: instructorId } },
            relations: ['category'],
        });
        if (!course) throw new ForbiddenException('Access denied');

        return course;
    }

    async update(
        courseId: string,
        dto: UpdateCourseDto,
        instructorId: string,
    ): Promise<Course> {
        const course = await this.findOne(courseId, instructorId);

        if (course.status === CourseStatus.PENDING) {
            throw new ForbiddenException(
                'Course cannot be edited while it is pending review',
            );
        }

        if (dto.categoryId !== undefined) {
            if (dto.categoryId === null) {
                course.category = null;
            } else {
                const category = await this.categoryRepo.findOne({
                    where: { category_id: dto.categoryId },
                });
                if (!category) throw new NotFoundException('Category not found');
                course.category = category;
            }
        }

        if (dto.title !== undefined) course.title = dto.title;
        if (dto.description !== undefined) course.description = dto.description;
        if (dto.price !== undefined) course.price = dto.price;
        if (dto.thumbnail_url !== undefined) course.thumbnail_url = dto.thumbnail_url;
        if (dto.language !== undefined) course.language = dto.language;
        if (dto.level !== undefined) course.level = dto.level;

        return this.courseRepo.save(course);
    }

    async submitForReview(courseId: string, instructorId: string): Promise<Course> {
        const course = await this.findOne(courseId, instructorId);

        if (course.status !== CourseStatus.DRAFT && course.status !== CourseStatus.REJECTED) {
            throw new BadRequestException(
                'Only draft or rejected courses can be submitted for review',
            );
        }

        course.status = CourseStatus.PENDING;
        const saved = await this.courseRepo.save(course);

        const adminEmail = this.config.get<string>('ADMIN_EMAIL');
        if (adminEmail) {
            const withInstructor = await this.courseRepo.findOne({
                where: { course_id: courseId },
                relations: ['instructor'],
            });
            this.mailService
                .sendCourseSubmittedNotification(
                    adminEmail,
                    withInstructor?.instructor.full_name ?? 'Instructor',
                    course.title,
                    courseId,
                )
                .catch(() => {});
        }

        return saved;
    }
}
