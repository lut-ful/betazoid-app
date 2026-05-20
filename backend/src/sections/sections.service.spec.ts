import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getDataSourceToken } from '@nestjs/typeorm';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { SectionsService } from './sections.service';
import { Section } from './entities/section.entity';
import { Course, CourseStatus, CourseLevel } from '../courses/entities/course.entity';

const mockSectionRepo = () => ({
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    count: jest.fn(),
    remove: jest.fn(),
});

const mockCourseRepo = () => ({
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

const baseSection = (): Section => ({
    section_id: 'section-uuid-1',
    title: 'Introduction',
    order: 0,
    course: ownedCourse(),
    created_at: new Date(),
    updated_at: new Date(),
});

describe('SectionsService — create', () => {
    let service: SectionsService;
    let sectionRepo: ReturnType<typeof mockSectionRepo>;
    let courseRepo: ReturnType<typeof mockCourseRepo>;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                SectionsService,
                { provide: getRepositoryToken(Section), useFactory: mockSectionRepo },
                { provide: getRepositoryToken(Course), useFactory: mockCourseRepo },
                { provide: DataSource, useFactory: mockDataSource },
            ],
        }).compile();

        service = module.get(SectionsService);
        sectionRepo = module.get(getRepositoryToken(Section));
        courseRepo = module.get(getRepositoryToken(Course));
    });

    it('creates a section with order equal to existing section count', async () => {
        const course = ownedCourse();
        courseRepo.findOne.mockResolvedValue(course);
        sectionRepo.count.mockResolvedValue(2);
        const created = { ...baseSection(), title: 'New Section', order: 2 };
        sectionRepo.create.mockReturnValue(created);
        sectionRepo.save.mockResolvedValue(created);

        const result = await service.create('course-uuid-1', { title: 'New Section' }, 'instructor-uuid-1');

        expect(sectionRepo.create).toHaveBeenCalledWith(expect.objectContaining({ title: 'New Section', order: 2 }));
        expect(result.order).toBe(2);
    });

    it('throws NotFoundException when course does not exist', async () => {
        courseRepo.findOne.mockResolvedValue(null);

        await expect(
            service.create('nonexistent', { title: 'Section' }, 'instructor-uuid-1'),
        ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws ForbiddenException when instructor does not own the course', async () => {
        courseRepo.findOne.mockResolvedValue(ownedCourse());

        await expect(
            service.create('course-uuid-1', { title: 'Section' }, 'other-instructor'),
        ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throws ForbiddenException when course is PENDING', async () => {
        const course = { ...ownedCourse(), status: CourseStatus.PENDING };
        courseRepo.findOne.mockResolvedValue(course);

        await expect(
            service.create('course-uuid-1', { title: 'Section' }, 'instructor-uuid-1'),
        ).rejects.toBeInstanceOf(ForbiddenException);
    });
});

describe('SectionsService — findByCourse', () => {
    let service: SectionsService;
    let sectionRepo: ReturnType<typeof mockSectionRepo>;
    let courseRepo: ReturnType<typeof mockCourseRepo>;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                SectionsService,
                { provide: getRepositoryToken(Section), useFactory: mockSectionRepo },
                { provide: getRepositoryToken(Course), useFactory: mockCourseRepo },
                { provide: DataSource, useFactory: mockDataSource },
            ],
        }).compile();

        service = module.get(SectionsService);
        sectionRepo = module.get(getRepositoryToken(Section));
        courseRepo = module.get(getRepositoryToken(Course));
    });

    it('returns sections ordered by order field', async () => {
        courseRepo.findOne.mockResolvedValue(ownedCourse());
        const sections = [
            { ...baseSection(), order: 0 },
            { ...baseSection(), section_id: 'section-uuid-2', title: 'Advanced', order: 1 },
        ];
        sectionRepo.find.mockResolvedValue(sections);

        const result = await service.findByCourse('course-uuid-1', 'instructor-uuid-1');

        expect(result).toHaveLength(2);
        expect(sectionRepo.find).toHaveBeenCalledWith(
            expect.objectContaining({ order: { order: 'ASC' } }),
        );
    });

    it('throws NotFoundException when course does not exist', async () => {
        courseRepo.findOne.mockResolvedValue(null);

        await expect(
            service.findByCourse('nonexistent', 'instructor-uuid-1'),
        ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws ForbiddenException when instructor does not own the course', async () => {
        courseRepo.findOne.mockResolvedValue(ownedCourse());

        await expect(
            service.findByCourse('course-uuid-1', 'other-instructor'),
        ).rejects.toBeInstanceOf(ForbiddenException);
    });
});

describe('SectionsService — update', () => {
    let service: SectionsService;
    let sectionRepo: ReturnType<typeof mockSectionRepo>;
    let courseRepo: ReturnType<typeof mockCourseRepo>;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                SectionsService,
                { provide: getRepositoryToken(Section), useFactory: mockSectionRepo },
                { provide: getRepositoryToken(Course), useFactory: mockCourseRepo },
                { provide: DataSource, useFactory: mockDataSource },
            ],
        }).compile();

        service = module.get(SectionsService);
        sectionRepo = module.get(getRepositoryToken(Section));
        courseRepo = module.get(getRepositoryToken(Course));
    });

    it('renames a section', async () => {
        courseRepo.findOne.mockResolvedValue(ownedCourse());
        const section = baseSection();
        sectionRepo.findOne.mockResolvedValue(section);
        sectionRepo.save.mockResolvedValue({ ...section, title: 'Renamed' });

        const result = await service.update('course-uuid-1', 'section-uuid-1', { title: 'Renamed' }, 'instructor-uuid-1');

        expect(sectionRepo.save).toHaveBeenCalledWith(expect.objectContaining({ title: 'Renamed' }));
        expect(result.title).toBe('Renamed');
    });

    it('throws NotFoundException when section does not belong to the course', async () => {
        courseRepo.findOne.mockResolvedValue(ownedCourse());
        sectionRepo.findOne.mockResolvedValue(null);

        await expect(
            service.update('course-uuid-1', 'nonexistent-section', { title: 'X' }, 'instructor-uuid-1'),
        ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws ForbiddenException when instructor does not own the course', async () => {
        courseRepo.findOne.mockResolvedValue(ownedCourse());

        await expect(
            service.update('course-uuid-1', 'section-uuid-1', { title: 'X' }, 'other-instructor'),
        ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throws ForbiddenException when course is PENDING', async () => {
        const course = { ...ownedCourse(), status: CourseStatus.PENDING };
        courseRepo.findOne.mockResolvedValue(course);

        await expect(
            service.update('course-uuid-1', 'section-uuid-1', { title: 'X' }, 'instructor-uuid-1'),
        ).rejects.toBeInstanceOf(ForbiddenException);
    });
});

describe('SectionsService — remove', () => {
    let service: SectionsService;
    let sectionRepo: ReturnType<typeof mockSectionRepo>;
    let courseRepo: ReturnType<typeof mockCourseRepo>;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                SectionsService,
                { provide: getRepositoryToken(Section), useFactory: mockSectionRepo },
                { provide: getRepositoryToken(Course), useFactory: mockCourseRepo },
                { provide: DataSource, useFactory: mockDataSource },
            ],
        }).compile();

        service = module.get(SectionsService);
        sectionRepo = module.get(getRepositoryToken(Section));
        courseRepo = module.get(getRepositoryToken(Course));
    });

    it('removes the section', async () => {
        courseRepo.findOne.mockResolvedValue(ownedCourse());
        sectionRepo.findOne.mockResolvedValue(baseSection());
        sectionRepo.remove.mockResolvedValue(undefined);

        await expect(
            service.remove('course-uuid-1', 'section-uuid-1', 'instructor-uuid-1'),
        ).resolves.toBeUndefined();

        expect(sectionRepo.remove).toHaveBeenCalledWith(expect.objectContaining({ section_id: 'section-uuid-1' }));
    });

    it('throws NotFoundException when section does not belong to the course', async () => {
        courseRepo.findOne.mockResolvedValue(ownedCourse());
        sectionRepo.findOne.mockResolvedValue(null);

        await expect(
            service.remove('course-uuid-1', 'nonexistent-section', 'instructor-uuid-1'),
        ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws ForbiddenException when instructor does not own the course', async () => {
        courseRepo.findOne.mockResolvedValue(ownedCourse());

        await expect(
            service.remove('course-uuid-1', 'section-uuid-1', 'other-instructor'),
        ).rejects.toBeInstanceOf(ForbiddenException);
    });
});

describe('SectionsService — reorder', () => {
    let service: SectionsService;
    let sectionRepo: ReturnType<typeof mockSectionRepo>;
    let courseRepo: ReturnType<typeof mockCourseRepo>;
    let dataSource: ReturnType<typeof mockDataSource>;

    const twoSections = (): Section[] => [
        { ...baseSection(), section_id: 'section-uuid-1', order: 0 },
        { ...baseSection(), section_id: 'section-uuid-2', title: 'Advanced', order: 1 },
    ];

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                SectionsService,
                { provide: getRepositoryToken(Section), useFactory: mockSectionRepo },
                { provide: getRepositoryToken(Course), useFactory: mockCourseRepo },
                { provide: DataSource, useFactory: mockDataSource },
            ],
        }).compile();

        service = module.get(SectionsService);
        sectionRepo = module.get(getRepositoryToken(Section));
        courseRepo = module.get(getRepositoryToken(Course));
        dataSource = module.get(DataSource) as any;
    });

    it('updates order for all sections via transaction', async () => {
        courseRepo.findOne.mockResolvedValue(ownedCourse());
        sectionRepo.find
            .mockResolvedValueOnce(twoSections())
            .mockResolvedValueOnce([
                { ...baseSection(), section_id: 'section-uuid-2', order: 0 },
                { ...baseSection(), section_id: 'section-uuid-1', order: 1 },
            ]);

        const result = await service.reorder(
            'course-uuid-1',
            { orderedIds: ['section-uuid-2', 'section-uuid-1'] },
            'instructor-uuid-1',
        );

        expect(dataSource.transaction).toHaveBeenCalled();
        expect(result[0].section_id).toBe('section-uuid-2');
    });

    it('throws BadRequestException when orderedIds count does not match section count', async () => {
        courseRepo.findOne.mockResolvedValue(ownedCourse());
        sectionRepo.find.mockResolvedValue(twoSections());

        await expect(
            service.reorder(
                'course-uuid-1',
                { orderedIds: ['section-uuid-1'] },
                'instructor-uuid-1',
            ),
        ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws BadRequestException when an ID does not belong to this course', async () => {
        courseRepo.findOne.mockResolvedValue(ownedCourse());
        sectionRepo.find.mockResolvedValue(twoSections());

        await expect(
            service.reorder(
                'course-uuid-1',
                { orderedIds: ['section-uuid-1', 'foreign-uuid'] },
                'instructor-uuid-1',
            ),
        ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws ForbiddenException when instructor does not own the course', async () => {
        courseRepo.findOne.mockResolvedValue(ownedCourse());

        await expect(
            service.reorder(
                'course-uuid-1',
                { orderedIds: ['section-uuid-1', 'section-uuid-2'] },
                'other-instructor',
            ),
        ).rejects.toBeInstanceOf(ForbiddenException);
    });
});
