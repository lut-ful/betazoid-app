import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { LectureResourcesService } from './lecture-resources.service';
import { LectureResource, ResourceType } from './entities/lecture-resource.entity';
import { Lecture, LectureContentType } from '../lectures/entities/lecture.entity';
import { Section } from '../sections/entities/section.entity';
import { Course, CourseStatus, CourseLevel } from '../courses/entities/course.entity';

const mockResourceRepo = () => ({
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    remove: jest.fn(),
});

const mockLectureRepo = () => ({
    findOne: jest.fn(),
});

const mockSectionRepo = () => ({
    findOne: jest.fn(),
});

const ownedCourse = (): Course => ({
    course_id: 'course-uuid-1',
    title: 'Test Course',
    description: 'desc',
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

const baseResource = (): LectureResource => ({
    resource_id: 'resource-uuid-1',
    title: 'Slide deck',
    resource_type: ResourceType.LINK,
    url: 'https://example.com/slides.pdf',
    original_filename: null,
    lecture: baseLecture(),
    created_at: new Date(),
    updated_at: new Date(),
});

const fileResource = (): LectureResource => ({
    ...baseResource(),
    resource_id: 'resource-uuid-2',
    title: 'Exercise files',
    resource_type: ResourceType.FILE,
    url: '/uploads/resources/file.zip',
    original_filename: 'exercises.zip',
});

// ─────────────────────────────────────────────────────────────────────────────
// addLink
// ─────────────────────────────────────────────────────────────────────────────

describe('LectureResourcesService — addLink', () => {
    let service: LectureResourcesService;
    let resourceRepo: ReturnType<typeof mockResourceRepo>;
    let lectureRepo: ReturnType<typeof mockLectureRepo>;
    let sectionRepo: ReturnType<typeof mockSectionRepo>;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                LectureResourcesService,
                { provide: getRepositoryToken(LectureResource), useFactory: mockResourceRepo },
                { provide: getRepositoryToken(Lecture), useFactory: mockLectureRepo },
                { provide: getRepositoryToken(Section), useFactory: mockSectionRepo },
            ],
        }).compile();

        service = module.get(LectureResourcesService);
        resourceRepo = module.get(getRepositoryToken(LectureResource));
        lectureRepo = module.get(getRepositoryToken(Lecture));
        sectionRepo = module.get(getRepositoryToken(Section));
    });

    it('saves a link resource with correct type and url', async () => {
        sectionRepo.findOne.mockResolvedValue(ownedSection());
        lectureRepo.findOne.mockResolvedValue(baseLecture());
        const created = baseResource();
        resourceRepo.create.mockReturnValue(created);
        resourceRepo.save.mockResolvedValue(created);

        const result = await service.addLink(
            'course-uuid-1',
            'section-uuid-1',
            'lecture-uuid-1',
            { title: 'Slide deck', url: 'https://example.com/slides.pdf' },
            'instructor-uuid-1',
        );

        expect(resourceRepo.create).toHaveBeenCalledWith(
            expect.objectContaining({
                title: 'Slide deck',
                resource_type: ResourceType.LINK,
                url: 'https://example.com/slides.pdf',
                original_filename: null,
            }),
        );
        expect(result.resource_type).toBe(ResourceType.LINK);
    });

    it('throws NotFoundException when section not found', async () => {
        sectionRepo.findOne.mockResolvedValue(null);

        await expect(
            service.addLink('course-uuid-1', 'section-uuid-1', 'lecture-uuid-1', { title: 'A', url: 'https://x.com' }, 'instructor-uuid-1'),
        ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws ForbiddenException when instructor does not own the course', async () => {
        sectionRepo.findOne.mockResolvedValue(ownedSection());

        await expect(
            service.addLink('course-uuid-1', 'section-uuid-1', 'lecture-uuid-1', { title: 'A', url: 'https://x.com' }, 'other-instructor'),
        ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throws ForbiddenException when course is PENDING', async () => {
        const pendingSection = { ...ownedSection(), course: { ...ownedCourse(), status: CourseStatus.PENDING } };
        sectionRepo.findOne.mockResolvedValue(pendingSection);

        await expect(
            service.addLink('course-uuid-1', 'section-uuid-1', 'lecture-uuid-1', { title: 'A', url: 'https://x.com' }, 'instructor-uuid-1'),
        ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throws NotFoundException when lecture not found', async () => {
        sectionRepo.findOne.mockResolvedValue(ownedSection());
        lectureRepo.findOne.mockResolvedValue(null);

        await expect(
            service.addLink('course-uuid-1', 'section-uuid-1', 'nonexistent', { title: 'A', url: 'https://x.com' }, 'instructor-uuid-1'),
        ).rejects.toBeInstanceOf(NotFoundException);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// addFile
// ─────────────────────────────────────────────────────────────────────────────

describe('LectureResourcesService — addFile', () => {
    let service: LectureResourcesService;
    let resourceRepo: ReturnType<typeof mockResourceRepo>;
    let lectureRepo: ReturnType<typeof mockLectureRepo>;
    let sectionRepo: ReturnType<typeof mockSectionRepo>;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                LectureResourcesService,
                { provide: getRepositoryToken(LectureResource), useFactory: mockResourceRepo },
                { provide: getRepositoryToken(Lecture), useFactory: mockLectureRepo },
                { provide: getRepositoryToken(Section), useFactory: mockSectionRepo },
            ],
        }).compile();

        service = module.get(LectureResourcesService);
        resourceRepo = module.get(getRepositoryToken(LectureResource));
        lectureRepo = module.get(getRepositoryToken(Lecture));
        sectionRepo = module.get(getRepositoryToken(Section));
    });

    const fakeFile = (): Express.Multer.File => ({
        fieldname: 'file',
        originalname: 'exercises.zip',
        encoding: '7bit',
        mimetype: 'application/zip',
        size: 1024,
        filename: '1234567890-abc.zip',
        path: '/uploads/resources/1234567890-abc.zip',
        destination: '/uploads/resources',
        buffer: Buffer.from(''),
        stream: null as any,
    });

    it('saves a file resource with type FILE and correct url', async () => {
        sectionRepo.findOne.mockResolvedValue(ownedSection());
        lectureRepo.findOne.mockResolvedValue(baseLecture());
        const created = fileResource();
        resourceRepo.create.mockReturnValue(created);
        resourceRepo.save.mockResolvedValue(created);

        const result = await service.addFile(
            'course-uuid-1',
            'section-uuid-1',
            'lecture-uuid-1',
            fakeFile(),
            'Exercise files',
            'instructor-uuid-1',
        );

        expect(resourceRepo.create).toHaveBeenCalledWith(
            expect.objectContaining({
                title: 'Exercise files',
                resource_type: ResourceType.FILE,
                url: '/uploads/resources/1234567890-abc.zip',
                original_filename: 'exercises.zip',
            }),
        );
        expect(result.resource_type).toBe(ResourceType.FILE);
    });

    it('throws NotFoundException when lecture not found', async () => {
        sectionRepo.findOne.mockResolvedValue(ownedSection());
        lectureRepo.findOne.mockResolvedValue(null);

        await expect(
            service.addFile('course-uuid-1', 'section-uuid-1', 'nonexistent', fakeFile(), 'Title', 'instructor-uuid-1'),
        ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws ForbiddenException when instructor does not own the course', async () => {
        sectionRepo.findOne.mockResolvedValue(ownedSection());

        await expect(
            service.addFile('course-uuid-1', 'section-uuid-1', 'lecture-uuid-1', fakeFile(), 'Title', 'other-instructor'),
        ).rejects.toBeInstanceOf(ForbiddenException);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// findByLecture
// ─────────────────────────────────────────────────────────────────────────────

describe('LectureResourcesService — findByLecture', () => {
    let service: LectureResourcesService;
    let resourceRepo: ReturnType<typeof mockResourceRepo>;
    let lectureRepo: ReturnType<typeof mockLectureRepo>;
    let sectionRepo: ReturnType<typeof mockSectionRepo>;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                LectureResourcesService,
                { provide: getRepositoryToken(LectureResource), useFactory: mockResourceRepo },
                { provide: getRepositoryToken(Lecture), useFactory: mockLectureRepo },
                { provide: getRepositoryToken(Section), useFactory: mockSectionRepo },
            ],
        }).compile();

        service = module.get(LectureResourcesService);
        resourceRepo = module.get(getRepositoryToken(LectureResource));
        lectureRepo = module.get(getRepositoryToken(Lecture));
        sectionRepo = module.get(getRepositoryToken(Section));
    });

    it('returns resources ordered by created_at ASC', async () => {
        sectionRepo.findOne.mockResolvedValue(ownedSection());
        lectureRepo.findOne.mockResolvedValue(baseLecture());
        const resources = [baseResource(), fileResource()];
        resourceRepo.find.mockResolvedValue(resources);

        const result = await service.findByLecture('course-uuid-1', 'section-uuid-1', 'lecture-uuid-1', 'instructor-uuid-1');

        expect(result).toHaveLength(2);
        expect(resourceRepo.find).toHaveBeenCalledWith(
            expect.objectContaining({ order: { created_at: 'ASC' } }),
        );
    });

    it('throws NotFoundException when section not found', async () => {
        sectionRepo.findOne.mockResolvedValue(null);

        await expect(
            service.findByLecture('course-uuid-1', 'section-uuid-1', 'lecture-uuid-1', 'instructor-uuid-1'),
        ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws ForbiddenException when instructor does not own the course', async () => {
        sectionRepo.findOne.mockResolvedValue(ownedSection());

        await expect(
            service.findByLecture('course-uuid-1', 'section-uuid-1', 'lecture-uuid-1', 'other-instructor'),
        ).rejects.toBeInstanceOf(ForbiddenException);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// remove
// ─────────────────────────────────────────────────────────────────────────────

describe('LectureResourcesService — remove', () => {
    let service: LectureResourcesService;
    let resourceRepo: ReturnType<typeof mockResourceRepo>;
    let lectureRepo: ReturnType<typeof mockLectureRepo>;
    let sectionRepo: ReturnType<typeof mockSectionRepo>;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                LectureResourcesService,
                { provide: getRepositoryToken(LectureResource), useFactory: mockResourceRepo },
                { provide: getRepositoryToken(Lecture), useFactory: mockLectureRepo },
                { provide: getRepositoryToken(Section), useFactory: mockSectionRepo },
            ],
        }).compile();

        service = module.get(LectureResourcesService);
        resourceRepo = module.get(getRepositoryToken(LectureResource));
        lectureRepo = module.get(getRepositoryToken(Lecture));
        sectionRepo = module.get(getRepositoryToken(Section));
    });

    it('removes a link resource without touching filesystem', async () => {
        sectionRepo.findOne.mockResolvedValue(ownedSection());
        lectureRepo.findOne.mockResolvedValue(baseLecture());
        resourceRepo.findOne.mockResolvedValue(baseResource());
        resourceRepo.remove.mockResolvedValue(undefined);

        await expect(
            service.remove('course-uuid-1', 'section-uuid-1', 'lecture-uuid-1', 'resource-uuid-1', 'instructor-uuid-1'),
        ).resolves.toBeUndefined();

        expect(resourceRepo.remove).toHaveBeenCalledWith(
            expect.objectContaining({ resource_id: 'resource-uuid-1' }),
        );
    });

    it('removes a file resource (unlink errors are silenced)', async () => {
        sectionRepo.findOne.mockResolvedValue(ownedSection());
        lectureRepo.findOne.mockResolvedValue(baseLecture());
        resourceRepo.findOne.mockResolvedValue(fileResource());
        resourceRepo.remove.mockResolvedValue(undefined);

        await expect(
            service.remove('course-uuid-1', 'section-uuid-1', 'lecture-uuid-1', 'resource-uuid-2', 'instructor-uuid-1'),
        ).resolves.toBeUndefined();

        expect(resourceRepo.remove).toHaveBeenCalled();
    });

    it('throws NotFoundException when resource does not belong to the lecture', async () => {
        sectionRepo.findOne.mockResolvedValue(ownedSection());
        lectureRepo.findOne.mockResolvedValue(baseLecture());
        resourceRepo.findOne.mockResolvedValue(null);

        await expect(
            service.remove('course-uuid-1', 'section-uuid-1', 'lecture-uuid-1', 'nonexistent', 'instructor-uuid-1'),
        ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws ForbiddenException when instructor does not own the course', async () => {
        sectionRepo.findOne.mockResolvedValue(ownedSection());

        await expect(
            service.remove('course-uuid-1', 'section-uuid-1', 'lecture-uuid-1', 'resource-uuid-1', 'other-instructor'),
        ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throws NotFoundException when lecture not found', async () => {
        sectionRepo.findOne.mockResolvedValue(ownedSection());
        lectureRepo.findOne.mockResolvedValue(null);

        await expect(
            service.remove('course-uuid-1', 'section-uuid-1', 'nonexistent', 'resource-uuid-1', 'instructor-uuid-1'),
        ).rejects.toBeInstanceOf(NotFoundException);
    });
});
