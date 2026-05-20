import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken, getDataSourceToken } from '@nestjs/typeorm';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { LecturesService } from './lectures.service';
import { Lecture, LectureContentType } from './entities/lecture.entity';
import { Section } from '../sections/entities/section.entity';
import { Course, CourseStatus, CourseLevel } from '../courses/entities/course.entity';

const mockLectureRepo = () => ({
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    count: jest.fn(),
    remove: jest.fn(),
});

const mockSectionRepo = () => ({
    findOne: jest.fn(),
});

const mockDataSource = () => ({
    transaction: jest.fn().mockImplementation(async (cb: (mgr: any) => Promise<void>) => {
        await cb({ save: jest.fn().mockResolvedValue(undefined) });
    }),
});

const ownedCourse = (): Course => ({
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

const ownedSection = (): Section => ({
    section_id: 'section-uuid-1',
    title: 'Introduction',
    order: 0,
    course: ownedCourse(),
    created_at: new Date(),
    updated_at: new Date(),
});

const baseLecture = (): Lecture => ({
    lecture_id: 'lecture-uuid-1',
    title: 'Getting Started',
    content_type: LectureContentType.VIDEO,
    order: 0,
    is_free_preview: false,
    section: ownedSection(),
    created_at: new Date(),
    updated_at: new Date(),
});

// ─────────────────────────────────────────────────────────────────────────────
// create
// ─────────────────────────────────────────────────────────────────────────────

describe('LecturesService — create', () => {
    let service: LecturesService;
    let lectureRepo: ReturnType<typeof mockLectureRepo>;
    let sectionRepo: ReturnType<typeof mockSectionRepo>;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                LecturesService,
                { provide: getRepositoryToken(Lecture), useFactory: mockLectureRepo },
                { provide: getRepositoryToken(Section), useFactory: mockSectionRepo },
                { provide: DataSource, useFactory: mockDataSource },
            ],
        }).compile();

        service = module.get(LecturesService);
        lectureRepo = module.get(getRepositoryToken(Lecture));
        sectionRepo = module.get(getRepositoryToken(Section));
    });

    it('creates a lecture with order equal to existing lecture count', async () => {
        sectionRepo.findOne.mockResolvedValue(ownedSection());
        lectureRepo.count.mockResolvedValue(3);
        const created = { ...baseLecture(), title: 'New Lecture', order: 3 };
        lectureRepo.create.mockReturnValue(created);
        lectureRepo.save.mockResolvedValue(created);

        const result = await service.create(
            'course-uuid-1',
            'section-uuid-1',
            { title: 'New Lecture', content_type: LectureContentType.VIDEO },
            'instructor-uuid-1',
        );

        expect(lectureRepo.create).toHaveBeenCalledWith(
            expect.objectContaining({ title: 'New Lecture', order: 3, content_type: LectureContentType.VIDEO }),
        );
        expect(result.order).toBe(3);
    });

    it('throws NotFoundException when section does not exist', async () => {
        sectionRepo.findOne.mockResolvedValue(null);

        await expect(
            service.create('course-uuid-1', 'nonexistent', { title: 'Lecture', content_type: LectureContentType.VIDEO }, 'instructor-uuid-1'),
        ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws ForbiddenException when instructor does not own the course', async () => {
        sectionRepo.findOne.mockResolvedValue(ownedSection());

        await expect(
            service.create('course-uuid-1', 'section-uuid-1', { title: 'Lecture', content_type: LectureContentType.VIDEO }, 'other-instructor'),
        ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throws ForbiddenException when course is PENDING', async () => {
        const pendingCourse = { ...ownedCourse(), status: CourseStatus.PENDING };
        sectionRepo.findOne.mockResolvedValue({ ...ownedSection(), course: pendingCourse });

        await expect(
            service.create('course-uuid-1', 'section-uuid-1', { title: 'Lecture', content_type: LectureContentType.VIDEO }, 'instructor-uuid-1'),
        ).rejects.toBeInstanceOf(ForbiddenException);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// findBySection
// ─────────────────────────────────────────────────────────────────────────────

describe('LecturesService — findBySection', () => {
    let service: LecturesService;
    let lectureRepo: ReturnType<typeof mockLectureRepo>;
    let sectionRepo: ReturnType<typeof mockSectionRepo>;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                LecturesService,
                { provide: getRepositoryToken(Lecture), useFactory: mockLectureRepo },
                { provide: getRepositoryToken(Section), useFactory: mockSectionRepo },
                { provide: DataSource, useFactory: mockDataSource },
            ],
        }).compile();

        service = module.get(LecturesService);
        lectureRepo = module.get(getRepositoryToken(Lecture));
        sectionRepo = module.get(getRepositoryToken(Section));
    });

    it('returns lectures ordered by order field', async () => {
        sectionRepo.findOne.mockResolvedValue(ownedSection());
        const lectures = [
            { ...baseLecture(), order: 0 },
            { ...baseLecture(), lecture_id: 'lecture-uuid-2', title: 'Advanced', order: 1 },
        ];
        lectureRepo.find.mockResolvedValue(lectures);

        const result = await service.findBySection('course-uuid-1', 'section-uuid-1', 'instructor-uuid-1');

        expect(result).toHaveLength(2);
        expect(lectureRepo.find).toHaveBeenCalledWith(
            expect.objectContaining({ order: { order: 'ASC' } }),
        );
    });

    it('throws NotFoundException when section does not exist', async () => {
        sectionRepo.findOne.mockResolvedValue(null);

        await expect(
            service.findBySection('course-uuid-1', 'nonexistent', 'instructor-uuid-1'),
        ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws ForbiddenException when instructor does not own the course', async () => {
        sectionRepo.findOne.mockResolvedValue(ownedSection());

        await expect(
            service.findBySection('course-uuid-1', 'section-uuid-1', 'other-instructor'),
        ).rejects.toBeInstanceOf(ForbiddenException);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// update
// ─────────────────────────────────────────────────────────────────────────────

describe('LecturesService — update', () => {
    let service: LecturesService;
    let lectureRepo: ReturnType<typeof mockLectureRepo>;
    let sectionRepo: ReturnType<typeof mockSectionRepo>;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                LecturesService,
                { provide: getRepositoryToken(Lecture), useFactory: mockLectureRepo },
                { provide: getRepositoryToken(Section), useFactory: mockSectionRepo },
                { provide: DataSource, useFactory: mockDataSource },
            ],
        }).compile();

        service = module.get(LecturesService);
        lectureRepo = module.get(getRepositoryToken(Lecture));
        sectionRepo = module.get(getRepositoryToken(Section));
    });

    it('renames a lecture', async () => {
        sectionRepo.findOne.mockResolvedValue(ownedSection());
        const lecture = baseLecture();
        lectureRepo.findOne.mockResolvedValue(lecture);
        lectureRepo.save.mockResolvedValue({ ...lecture, title: 'Renamed' });

        const result = await service.update('course-uuid-1', 'section-uuid-1', 'lecture-uuid-1', { title: 'Renamed' }, 'instructor-uuid-1');

        expect(lectureRepo.save).toHaveBeenCalledWith(expect.objectContaining({ title: 'Renamed' }));
        expect(result.title).toBe('Renamed');
    });

    it('updates content type', async () => {
        sectionRepo.findOne.mockResolvedValue(ownedSection());
        const lecture = baseLecture();
        lectureRepo.findOne.mockResolvedValue(lecture);
        lectureRepo.save.mockResolvedValue({ ...lecture, content_type: LectureContentType.ARTICLE });

        const result = await service.update(
            'course-uuid-1', 'section-uuid-1', 'lecture-uuid-1',
            { content_type: LectureContentType.ARTICLE },
            'instructor-uuid-1',
        );

        expect(result.content_type).toBe(LectureContentType.ARTICLE);
    });

    it('throws NotFoundException when lecture does not belong to the section', async () => {
        sectionRepo.findOne.mockResolvedValue(ownedSection());
        lectureRepo.findOne.mockResolvedValue(null);

        await expect(
            service.update('course-uuid-1', 'section-uuid-1', 'nonexistent-lecture', { title: 'X' }, 'instructor-uuid-1'),
        ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws ForbiddenException when instructor does not own the course', async () => {
        sectionRepo.findOne.mockResolvedValue(ownedSection());

        await expect(
            service.update('course-uuid-1', 'section-uuid-1', 'lecture-uuid-1', { title: 'X' }, 'other-instructor'),
        ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throws ForbiddenException when course is PENDING', async () => {
        const pendingCourse = { ...ownedCourse(), status: CourseStatus.PENDING };
        sectionRepo.findOne.mockResolvedValue({ ...ownedSection(), course: pendingCourse });

        await expect(
            service.update('course-uuid-1', 'section-uuid-1', 'lecture-uuid-1', { title: 'X' }, 'instructor-uuid-1'),
        ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('enables free preview on a lecture', async () => {
        sectionRepo.findOne.mockResolvedValue(ownedSection());
        const lecture = baseLecture();
        lectureRepo.findOne.mockResolvedValue(lecture);
        lectureRepo.save.mockResolvedValue({ ...lecture, is_free_preview: true });

        const result = await service.update(
            'course-uuid-1', 'section-uuid-1', 'lecture-uuid-1',
            { is_free_preview: true },
            'instructor-uuid-1',
        );

        expect(lectureRepo.save).toHaveBeenCalledWith(
            expect.objectContaining({ is_free_preview: true }),
        );
        expect(result.is_free_preview).toBe(true);
    });

    it('disables free preview on a lecture', async () => {
        sectionRepo.findOne.mockResolvedValue(ownedSection());
        const lecture = { ...baseLecture(), is_free_preview: true };
        lectureRepo.findOne.mockResolvedValue(lecture);
        lectureRepo.save.mockResolvedValue({ ...lecture, is_free_preview: false });

        const result = await service.update(
            'course-uuid-1', 'section-uuid-1', 'lecture-uuid-1',
            { is_free_preview: false },
            'instructor-uuid-1',
        );

        expect(lectureRepo.save).toHaveBeenCalledWith(
            expect.objectContaining({ is_free_preview: false }),
        );
        expect(result.is_free_preview).toBe(false);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// remove
// ─────────────────────────────────────────────────────────────────────────────

describe('LecturesService — remove', () => {
    let service: LecturesService;
    let lectureRepo: ReturnType<typeof mockLectureRepo>;
    let sectionRepo: ReturnType<typeof mockSectionRepo>;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                LecturesService,
                { provide: getRepositoryToken(Lecture), useFactory: mockLectureRepo },
                { provide: getRepositoryToken(Section), useFactory: mockSectionRepo },
                { provide: DataSource, useFactory: mockDataSource },
            ],
        }).compile();

        service = module.get(LecturesService);
        lectureRepo = module.get(getRepositoryToken(Lecture));
        sectionRepo = module.get(getRepositoryToken(Section));
    });

    it('removes the lecture', async () => {
        sectionRepo.findOne.mockResolvedValue(ownedSection());
        lectureRepo.findOne.mockResolvedValue(baseLecture());
        lectureRepo.remove.mockResolvedValue(undefined);

        await expect(
            service.remove('course-uuid-1', 'section-uuid-1', 'lecture-uuid-1', 'instructor-uuid-1'),
        ).resolves.toBeUndefined();

        expect(lectureRepo.remove).toHaveBeenCalledWith(
            expect.objectContaining({ lecture_id: 'lecture-uuid-1' }),
        );
    });

    it('throws NotFoundException when lecture does not belong to the section', async () => {
        sectionRepo.findOne.mockResolvedValue(ownedSection());
        lectureRepo.findOne.mockResolvedValue(null);

        await expect(
            service.remove('course-uuid-1', 'section-uuid-1', 'nonexistent-lecture', 'instructor-uuid-1'),
        ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws ForbiddenException when instructor does not own the course', async () => {
        sectionRepo.findOne.mockResolvedValue(ownedSection());

        await expect(
            service.remove('course-uuid-1', 'section-uuid-1', 'lecture-uuid-1', 'other-instructor'),
        ).rejects.toBeInstanceOf(ForbiddenException);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// reorder
// ─────────────────────────────────────────────────────────────────────────────

describe('LecturesService — reorder', () => {
    let service: LecturesService;
    let lectureRepo: ReturnType<typeof mockLectureRepo>;
    let sectionRepo: ReturnType<typeof mockSectionRepo>;
    let dataSource: ReturnType<typeof mockDataSource>;

    const twoLectures = (): Lecture[] => [
        { ...baseLecture(), lecture_id: 'lecture-uuid-1', order: 0 },
        { ...baseLecture(), lecture_id: 'lecture-uuid-2', title: 'Part 2', order: 1 },
    ];

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                LecturesService,
                { provide: getRepositoryToken(Lecture), useFactory: mockLectureRepo },
                { provide: getRepositoryToken(Section), useFactory: mockSectionRepo },
                { provide: DataSource, useFactory: mockDataSource },
            ],
        }).compile();

        service = module.get(LecturesService);
        lectureRepo = module.get(getRepositoryToken(Lecture));
        sectionRepo = module.get(getRepositoryToken(Section));
        dataSource = module.get(DataSource) as any;
    });

    it('updates order for all lectures via transaction', async () => {
        sectionRepo.findOne.mockResolvedValue(ownedSection());
        lectureRepo.find
            .mockResolvedValueOnce(twoLectures())
            .mockResolvedValueOnce([
                { ...baseLecture(), lecture_id: 'lecture-uuid-2', order: 0 },
                { ...baseLecture(), lecture_id: 'lecture-uuid-1', order: 1 },
            ]);

        const result = await service.reorder(
            'course-uuid-1',
            'section-uuid-1',
            { orderedIds: ['lecture-uuid-2', 'lecture-uuid-1'] },
            'instructor-uuid-1',
        );

        expect(dataSource.transaction).toHaveBeenCalled();
        expect(result[0].lecture_id).toBe('lecture-uuid-2');
    });

    it('throws BadRequestException when orderedIds count does not match lecture count', async () => {
        sectionRepo.findOne.mockResolvedValue(ownedSection());
        lectureRepo.find.mockResolvedValue(twoLectures());

        await expect(
            service.reorder('course-uuid-1', 'section-uuid-1', { orderedIds: ['lecture-uuid-1'] }, 'instructor-uuid-1'),
        ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws BadRequestException when an ID does not belong to this section', async () => {
        sectionRepo.findOne.mockResolvedValue(ownedSection());
        lectureRepo.find.mockResolvedValue(twoLectures());

        await expect(
            service.reorder('course-uuid-1', 'section-uuid-1', { orderedIds: ['lecture-uuid-1', 'foreign-uuid'] }, 'instructor-uuid-1'),
        ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws ForbiddenException when instructor does not own the course', async () => {
        sectionRepo.findOne.mockResolvedValue(ownedSection());

        await expect(
            service.reorder('course-uuid-1', 'section-uuid-1', { orderedIds: ['lecture-uuid-1', 'lecture-uuid-2'] }, 'other-instructor'),
        ).rejects.toBeInstanceOf(ForbiddenException);
    });
});
