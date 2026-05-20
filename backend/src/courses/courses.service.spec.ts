import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { CoursesService } from './courses.service';
import { Course, CourseStatus, CourseLevel } from './entities/course.entity';
import { Category } from '../categories/entities/category.entity';
import { Section } from '../sections/entities/section.entity';
import { Lecture, LectureContentType } from '../lectures/entities/lecture.entity';
import { MailService } from '../mail/mail.service';
import { RejectCourseDto } from './dto/reject-course.dto';
import { SearchCoursesDto } from './dto/search-courses.dto';

const mockQueryBuilder = () => ({
    leftJoin: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue([]),
});

const mockCourseRepo = () => ({
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    exists: jest.fn(),
    createQueryBuilder: jest.fn(() => mockQueryBuilder()),
});

const mockCategoryRepo = () => ({
    findOne: jest.fn(),
});

const mockSectionRepo = () => ({
    find: jest.fn(),
});

const mockLectureRepo = () => ({
    find: jest.fn(),
});

const mockMailService = () => ({
    sendCourseSubmittedNotification: jest.fn().mockResolvedValue(undefined),
    sendCourseApprovedNotification: jest.fn().mockResolvedValue(undefined),
    sendCourseRejectedNotification: jest.fn().mockResolvedValue(undefined),
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
    rating: 0,
    rejection_reason: null,
    instructor: { user_id: 'instructor-uuid-1', full_name: 'Jane Doe', email: 'jane@example.com' } as any,
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
                { provide: getRepositoryToken(Section), useFactory: mockSectionRepo },
                { provide: getRepositoryToken(Lecture), useFactory: mockLectureRepo },
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

describe('CoursesService — approveCourse', () => {
    let service: CoursesService;
    let courseRepo: ReturnType<typeof mockCourseRepo>;
    let mailService: ReturnType<typeof mockMailService>;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                CoursesService,
                { provide: getRepositoryToken(Course), useFactory: mockCourseRepo },
                { provide: getRepositoryToken(Category), useFactory: mockCategoryRepo },
                { provide: getRepositoryToken(Section), useFactory: mockSectionRepo },
                { provide: getRepositoryToken(Lecture), useFactory: mockLectureRepo },
                { provide: MailService, useFactory: mockMailService },
                { provide: ConfigService, useFactory: mockConfigService },
            ],
        }).compile();

        service = module.get(CoursesService);
        courseRepo = module.get(getRepositoryToken(Course));
        mailService = module.get(MailService);
    });

    it('transitions a PENDING course to PUBLISHED', async () => {
        const course = { ...baseCourse(), status: CourseStatus.PENDING };
        courseRepo.findOne.mockResolvedValue(course);
        courseRepo.save.mockResolvedValue({ ...course, status: CourseStatus.PUBLISHED, rejection_reason: null });

        const result = await service.approveCourse('course-uuid-1');

        expect(result.status).toBe(CourseStatus.PUBLISHED);
        expect(courseRepo.save).toHaveBeenCalledWith(
            expect.objectContaining({ status: CourseStatus.PUBLISHED, rejection_reason: null }),
        );
    });

    it('sends approval email to instructor', async () => {
        const course = { ...baseCourse(), status: CourseStatus.PENDING };
        courseRepo.findOne.mockResolvedValue(course);
        courseRepo.save.mockResolvedValue({ ...course, status: CourseStatus.PUBLISHED });

        await service.approveCourse('course-uuid-1');
        await new Promise(process.nextTick);

        expect(mailService.sendCourseApprovedNotification).toHaveBeenCalledWith(
            'jane@example.com',
            'Jane Doe',
            'Test Course',
        );
    });

    it('throws BadRequestException when course is not PENDING', async () => {
        const course = { ...baseCourse(), status: CourseStatus.DRAFT };
        courseRepo.findOne.mockResolvedValue(course);

        await expect(service.approveCourse('course-uuid-1')).rejects.toBeInstanceOf(
            BadRequestException,
        );
    });

    it('throws BadRequestException when course is already PUBLISHED', async () => {
        const course = { ...baseCourse(), status: CourseStatus.PUBLISHED };
        courseRepo.findOne.mockResolvedValue(course);

        await expect(service.approveCourse('course-uuid-1')).rejects.toBeInstanceOf(
            BadRequestException,
        );
    });

    it('throws NotFoundException when course does not exist', async () => {
        courseRepo.findOne.mockResolvedValue(null);

        await expect(service.approveCourse('nonexistent-id')).rejects.toBeInstanceOf(
            NotFoundException,
        );
    });
});

describe('CoursesService — rejectCourse', () => {
    let service: CoursesService;
    let courseRepo: ReturnType<typeof mockCourseRepo>;
    let mailService: ReturnType<typeof mockMailService>;

    const rejectDto: RejectCourseDto = { reason: 'Content needs more detail' };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                CoursesService,
                { provide: getRepositoryToken(Course), useFactory: mockCourseRepo },
                { provide: getRepositoryToken(Category), useFactory: mockCategoryRepo },
                { provide: getRepositoryToken(Section), useFactory: mockSectionRepo },
                { provide: getRepositoryToken(Lecture), useFactory: mockLectureRepo },
                { provide: MailService, useFactory: mockMailService },
                { provide: ConfigService, useFactory: mockConfigService },
            ],
        }).compile();

        service = module.get(CoursesService);
        courseRepo = module.get(getRepositoryToken(Course));
        mailService = module.get(MailService);
    });

    it('transitions a PENDING course to REJECTED and stores the reason', async () => {
        const course = { ...baseCourse(), status: CourseStatus.PENDING };
        courseRepo.findOne.mockResolvedValue(course);
        courseRepo.save.mockResolvedValue({
            ...course,
            status: CourseStatus.REJECTED,
            rejection_reason: rejectDto.reason,
        });

        const result = await service.rejectCourse('course-uuid-1', rejectDto);

        expect(result.status).toBe(CourseStatus.REJECTED);
        expect(result.rejection_reason).toBe(rejectDto.reason);
        expect(courseRepo.save).toHaveBeenCalledWith(
            expect.objectContaining({
                status: CourseStatus.REJECTED,
                rejection_reason: rejectDto.reason,
            }),
        );
    });

    it('sends rejection email to instructor with the reason', async () => {
        const course = { ...baseCourse(), status: CourseStatus.PENDING };
        courseRepo.findOne.mockResolvedValue(course);
        courseRepo.save.mockResolvedValue({ ...course, status: CourseStatus.REJECTED });

        await service.rejectCourse('course-uuid-1', rejectDto);
        await new Promise(process.nextTick);

        expect(mailService.sendCourseRejectedNotification).toHaveBeenCalledWith(
            'jane@example.com',
            'Jane Doe',
            'Test Course',
            rejectDto.reason,
        );
    });

    it('throws BadRequestException when course is not PENDING', async () => {
        const course = { ...baseCourse(), status: CourseStatus.DRAFT };
        courseRepo.findOne.mockResolvedValue(course);

        await expect(service.rejectCourse('course-uuid-1', rejectDto)).rejects.toBeInstanceOf(
            BadRequestException,
        );
    });

    it('throws BadRequestException when course is already REJECTED', async () => {
        const course = { ...baseCourse(), status: CourseStatus.REJECTED };
        courseRepo.findOne.mockResolvedValue(course);

        await expect(service.rejectCourse('course-uuid-1', rejectDto)).rejects.toBeInstanceOf(
            BadRequestException,
        );
    });

    it('throws NotFoundException when course does not exist', async () => {
        courseRepo.findOne.mockResolvedValue(null);

        await expect(service.rejectCourse('nonexistent-id', rejectDto)).rejects.toBeInstanceOf(
            NotFoundException,
        );
    });
});

describe('CoursesService — search', () => {
    let service: CoursesService;
    let courseRepo: ReturnType<typeof mockCourseRepo>;

    const publishedCourse = (): Course => ({
        ...baseCourse(),
        status: CourseStatus.PUBLISHED,
        instructor: { user_id: 'instructor-uuid-1', full_name: 'Jane Doe', email: 'jane@example.com' } as any,
        category: { category_id: 'cat-1', name: 'Programming' } as any,
    });

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                CoursesService,
                { provide: getRepositoryToken(Course), useFactory: mockCourseRepo },
                { provide: getRepositoryToken(Category), useFactory: mockCategoryRepo },
                { provide: getRepositoryToken(Section), useFactory: mockSectionRepo },
                { provide: getRepositoryToken(Lecture), useFactory: mockLectureRepo },
                { provide: MailService, useFactory: mockMailService },
                { provide: ConfigService, useFactory: mockConfigService },
            ],
        }).compile();

        service = module.get(CoursesService);
        courseRepo = module.get(getRepositoryToken(Course));
    });

    it('returns mapped search results for published courses', async () => {
        const course = publishedCourse();
        const qb = mockQueryBuilder();
        qb.getMany.mockResolvedValue([course]);
        courseRepo.createQueryBuilder.mockReturnValue(qb);

        const dto: SearchCoursesDto = {};
        const results = await service.search(dto);

        expect(results).toHaveLength(1);
        expect(results[0]).toMatchObject({
            course_id: course.course_id,
            title: course.title,
            instructor_name: 'Jane Doe',
            category_name: 'Programming',
            level: CourseLevel.BEGINNER,
            language: 'English',
        });
    });

    it('applies keyword filter when q is provided', async () => {
        const qb = mockQueryBuilder();
        qb.getMany.mockResolvedValue([]);
        courseRepo.createQueryBuilder.mockReturnValue(qb);

        await service.search({ q: 'javascript' });

        expect(qb.andWhere).toHaveBeenCalledWith(
            expect.stringContaining('plainto_tsquery'),
            expect.objectContaining({ q: 'javascript' }),
        );
    });

    it('applies category filter when category is provided', async () => {
        const qb = mockQueryBuilder();
        qb.getMany.mockResolvedValue([]);
        courseRepo.createQueryBuilder.mockReturnValue(qb);

        await service.search({ category: 'cat-uuid-1' });

        expect(qb.andWhere).toHaveBeenCalledWith(
            expect.stringContaining('category.category_id'),
            expect.objectContaining({ category: 'cat-uuid-1' }),
        );
    });

    it('applies level filter when level is provided', async () => {
        const qb = mockQueryBuilder();
        qb.getMany.mockResolvedValue([]);
        courseRepo.createQueryBuilder.mockReturnValue(qb);

        await service.search({ level: CourseLevel.BEGINNER });

        expect(qb.andWhere).toHaveBeenCalledWith(
            expect.stringContaining('course.level'),
            expect.objectContaining({ level: CourseLevel.BEGINNER }),
        );
    });

    it('applies price range filters when minPrice and maxPrice are provided', async () => {
        const qb = mockQueryBuilder();
        qb.getMany.mockResolvedValue([]);
        courseRepo.createQueryBuilder.mockReturnValue(qb);

        await service.search({ minPrice: 10, maxPrice: 50 });

        expect(qb.andWhere).toHaveBeenCalledWith(
            expect.stringContaining('minPrice'),
            expect.objectContaining({ minPrice: 10 }),
        );
        expect(qb.andWhere).toHaveBeenCalledWith(
            expect.stringContaining('maxPrice'),
            expect.objectContaining({ maxPrice: 50 }),
        );
    });

    it('skips keyword filter when q is empty', async () => {
        const qb = mockQueryBuilder();
        qb.getMany.mockResolvedValue([]);
        courseRepo.createQueryBuilder.mockReturnValue(qb);

        await service.search({ q: '  ' });

        const ftsCallArgs = (qb.andWhere as jest.Mock).mock.calls.find(
            ([sql]: [string]) => typeof sql === 'string' && sql.includes('plainto_tsquery'),
        );
        expect(ftsCallArgs).toBeUndefined();
    });

    it('returns empty array when no published courses match', async () => {
        const qb = mockQueryBuilder();
        qb.getMany.mockResolvedValue([]);
        courseRepo.createQueryBuilder.mockReturnValue(qb);

        const results = await service.search({ q: 'nonexistent topic' });

        expect(results).toEqual([]);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// findPublicDetail
// ─────────────────────────────────────────────────────────────────────────────

describe('CoursesService — findPublicDetail', () => {
    let service: CoursesService;
    let courseRepo: ReturnType<typeof mockCourseRepo>;
    let sectionRepo: ReturnType<typeof mockSectionRepo>;
    let lectureRepo: ReturnType<typeof mockLectureRepo>;

    const publishedCourse = (): Course => ({
        ...baseCourse(),
        status: CourseStatus.PUBLISHED,
        instructor: { user_id: 'instructor-uuid-1', full_name: 'Jane Doe', email: 'jane@example.com' } as any,
        category: { category_id: 'cat-1', name: 'Programming' } as any,
    });

    const baseSection = (): Section => ({
        section_id: 'section-uuid-1',
        title: 'Introduction',
        order: 0,
        course: publishedCourse(),
        created_at: new Date(),
        updated_at: new Date(),
    });

    const baseLecture = (): Lecture => ({
        lecture_id: 'lecture-uuid-1',
        title: 'Getting Started',
        content_type: LectureContentType.VIDEO,
        order: 0,
        is_free_preview: true,
        section: baseSection(),
        created_at: new Date(),
        updated_at: new Date(),
    });

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                CoursesService,
                { provide: getRepositoryToken(Course), useFactory: mockCourseRepo },
                { provide: getRepositoryToken(Category), useFactory: mockCategoryRepo },
                { provide: getRepositoryToken(Section), useFactory: mockSectionRepo },
                { provide: getRepositoryToken(Lecture), useFactory: mockLectureRepo },
                { provide: MailService, useFactory: mockMailService },
                { provide: ConfigService, useFactory: mockConfigService },
            ],
        }).compile();

        service = module.get(CoursesService);
        courseRepo = module.get(getRepositoryToken(Course));
        sectionRepo = module.get(getRepositoryToken(Section));
        lectureRepo = module.get(getRepositoryToken(Lecture));
    });

    it('returns course detail with sections and lectures', async () => {
        courseRepo.findOne.mockResolvedValue(publishedCourse());
        sectionRepo.find.mockResolvedValue([baseSection()]);
        lectureRepo.find.mockResolvedValue([baseLecture()]);

        const result = await service.findPublicDetail('course-uuid-1');

        expect(result.course_id).toBe('course-uuid-1');
        expect(result.instructor_name).toBe('Jane Doe');
        expect(result.category_name).toBe('Programming');
        expect(result.sections).toHaveLength(1);
        expect(result.sections[0].lectures).toHaveLength(1);
        expect(result.sections[0].lectures[0].is_free_preview).toBe(true);
    });

    it('marks non-preview lectures with is_free_preview false', async () => {
        courseRepo.findOne.mockResolvedValue(publishedCourse());
        sectionRepo.find.mockResolvedValue([baseSection()]);
        lectureRepo.find.mockResolvedValue([{ ...baseLecture(), is_free_preview: false }]);

        const result = await service.findPublicDetail('course-uuid-1');

        expect(result.sections[0].lectures[0].is_free_preview).toBe(false);
    });

    it('returns empty sections array when course has no sections', async () => {
        courseRepo.findOne.mockResolvedValue(publishedCourse());
        sectionRepo.find.mockResolvedValue([]);

        const result = await service.findPublicDetail('course-uuid-1');

        expect(result.sections).toEqual([]);
    });

    it('throws NotFoundException when course is not published', async () => {
        courseRepo.findOne.mockResolvedValue(null);

        await expect(
            service.findPublicDetail('course-uuid-1'),
        ).rejects.toBeInstanceOf(NotFoundException);
    });
});
