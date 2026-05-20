import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { CoursesService } from './courses.service';
import { Course, CourseStatus, CourseLevel } from './entities/course.entity';
import { Category } from '../categories/entities/category.entity';
import { MailService } from '../mail/mail.service';

const mockCourseRepo = () => ({
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    exists: jest.fn(),
});

const mockCategoryRepo = () => ({
    findOne: jest.fn(),
});

const mockMailService = () => ({
    sendCourseSubmittedNotification: jest.fn().mockResolvedValue(undefined),
});

const mockConfigService = () => ({
    get: jest.fn(),
});

const baseCourse = (): Course => ({
    course_id: 'course-uuid-1',
    title: 'Test Course',
    description: 'A test course',
    price: 29.99,
    thumbnail_url: null,
    language: 'English',
    level: CourseLevel.BEGINNER,
    status: CourseStatus.DRAFT,
    instructor: { user_id: 'instructor-uuid-1', full_name: 'Jane Doe' } as any,
    category: null,
    created_at: new Date(),
    updated_at: new Date(),
});

describe('CoursesService — submitForReview', () => {
    let service: CoursesService;
    let courseRepo: ReturnType<typeof mockCourseRepo>;
    let mailService: ReturnType<typeof mockMailService>;
    let configService: ReturnType<typeof mockConfigService>;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                CoursesService,
                { provide: getRepositoryToken(Course), useFactory: mockCourseRepo },
                { provide: getRepositoryToken(Category), useFactory: mockCategoryRepo },
                { provide: MailService, useFactory: mockMailService },
                { provide: ConfigService, useFactory: mockConfigService },
            ],
        }).compile();

        service = module.get(CoursesService);
        courseRepo = module.get(getRepositoryToken(Course));
        mailService = module.get(MailService);
        configService = module.get(ConfigService);
    });

    it('transitions a DRAFT course to PENDING', async () => {
        const course = baseCourse();
        courseRepo.exists.mockResolvedValue(true);
        courseRepo.findOne
            .mockResolvedValueOnce(course)
            .mockResolvedValueOnce({ ...course, instructor: { full_name: 'Jane Doe' } });
        courseRepo.save.mockResolvedValue({ ...course, status: CourseStatus.PENDING });
        configService.get.mockReturnValue('admin@betazoid.com');

        const result = await service.submitForReview('course-uuid-1', 'instructor-uuid-1');

        expect(result.status).toBe(CourseStatus.PENDING);
        expect(courseRepo.save).toHaveBeenCalledWith(
            expect.objectContaining({ status: CourseStatus.PENDING }),
        );
    });

    it('transitions a REJECTED course to PENDING', async () => {
        const course = { ...baseCourse(), status: CourseStatus.REJECTED };
        courseRepo.exists.mockResolvedValue(true);
        courseRepo.findOne
            .mockResolvedValueOnce(course)
            .mockResolvedValueOnce({ ...course, instructor: { full_name: 'Jane Doe' } });
        courseRepo.save.mockResolvedValue({ ...course, status: CourseStatus.PENDING });
        configService.get.mockReturnValue('admin@betazoid.com');

        const result = await service.submitForReview('course-uuid-1', 'instructor-uuid-1');

        expect(result.status).toBe(CourseStatus.PENDING);
    });

    it('sends the admin notification email on submit', async () => {
        const course = baseCourse();
        courseRepo.exists.mockResolvedValue(true);
        courseRepo.findOne
            .mockResolvedValueOnce(course)
            .mockResolvedValueOnce({ ...course, instructor: { full_name: 'Jane Doe' } });
        courseRepo.save.mockResolvedValue({ ...course, status: CourseStatus.PENDING });
        configService.get.mockReturnValue('admin@betazoid.com');

        await service.submitForReview('course-uuid-1', 'instructor-uuid-1');

        // allow the fire-and-forget promise to settle
        await new Promise(process.nextTick);

        expect(mailService.sendCourseSubmittedNotification).toHaveBeenCalledWith(
            'admin@betazoid.com',
            'Jane Doe',
            'Test Course',
            'course-uuid-1',
        );
    });

    it('skips email when ADMIN_EMAIL is not configured', async () => {
        const course = baseCourse();
        courseRepo.exists.mockResolvedValue(true);
        courseRepo.findOne.mockResolvedValueOnce(course);
        courseRepo.save.mockResolvedValue({ ...course, status: CourseStatus.PENDING });
        configService.get.mockReturnValue(undefined);

        await service.submitForReview('course-uuid-1', 'instructor-uuid-1');
        await new Promise(process.nextTick);

        expect(mailService.sendCourseSubmittedNotification).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when course is already PENDING', async () => {
        const course = { ...baseCourse(), status: CourseStatus.PENDING };
        courseRepo.exists.mockResolvedValue(true);
        courseRepo.findOne.mockResolvedValueOnce(course);

        await expect(
            service.submitForReview('course-uuid-1', 'instructor-uuid-1'),
        ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws BadRequestException when course is already PUBLISHED', async () => {
        const course = { ...baseCourse(), status: CourseStatus.PUBLISHED };
        courseRepo.exists.mockResolvedValue(true);
        courseRepo.findOne.mockResolvedValueOnce(course);

        await expect(
            service.submitForReview('course-uuid-1', 'instructor-uuid-1'),
        ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws NotFoundException when the course does not exist', async () => {
        courseRepo.exists.mockResolvedValue(false);

        await expect(
            service.submitForReview('nonexistent-id', 'instructor-uuid-1'),
        ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws ForbiddenException when the course belongs to a different instructor', async () => {
        courseRepo.exists.mockResolvedValue(true);
        courseRepo.findOne.mockResolvedValueOnce(null);

        await expect(
            service.submitForReview('course-uuid-1', 'other-instructor-uuid'),
        ).rejects.toBeInstanceOf(ForbiddenException);
    });
});
