# Sprint 4 — Sections & Lectures

**User Stories:** US-16 · US-17 · US-18 · US-19
**Sprint Duration:** 2 weeks
**Backend module(s):** `sections`, `lectures`
**Frontend pages:** `/courses/[id]/sections`, `/courses/[id]/lectures`

---

## Table of Contents

1. [US-16 — Section Management](#1-us-16--section-management)
2. [US-17 — Create Lecture](#2-us-17--create-lecture)
3. [US-18 — Free Preview Toggle](#3-us-18--free-preview-toggle)

---

## 1. US-16 — Section Management

> *As an Instructor, I want to create and reorder sections within my course so that the course content is structured logically.*

### Acceptance Criteria
- Instructor can add, rename, reorder, and delete sections
- Order number updates automatically on drag and drop reorder

---

### 1.1 Theory — Ordering Records in a Relational Database

When you display a list — sections in a course, slides in a deck, steps in a recipe — you need a reliable way to say "this item comes before that one". A database table has no inherent row order. The only way to control display order is to store it explicitly.

**The `order` column approach**

Add an integer column called `order` (or `position`, `sort_order`, `rank`). Each row gets a number. When you query, you add `ORDER BY order ASC` and rows come back in the right sequence.

```
sections table
┌─────────────┬───────────────────────┬───────┬─────────────┐
│ section_id  │       title           │ order │  course_id  │
├─────────────┼───────────────────────┼───────┼─────────────┤
│ uuid-A      │ Introduction          │   0   │ course-1    │
│ uuid-B      │ Core Concepts         │   1   │ course-1    │
│ uuid-C      │ Advanced Topics       │   2   │ course-1    │
│ uuid-D      │ Final Project         │   3   │ course-1    │
└─────────────┴───────────────────────┴───────┴─────────────┘
```

**What happens when the instructor reorders?**

The instructor drags "Advanced Topics" to position 1. The new desired order is:

```
Introduction (0)  →  Advanced Topics (1)  →  Core Concepts (2)  →  Final Project (3)
```

The frontend sends the server an array of section IDs in the new desired order:

```json
{ "orderedIds": ["uuid-A", "uuid-C", "uuid-B", "uuid-D"] }
```

The server assigns `order = 0` to `uuid-A`, `order = 1` to `uuid-C`, etc. All four rows are updated atomically inside a **database transaction** so that no intermediate state is ever visible to other queries.

**Why use a transaction for reorder?**

Imagine updating rows one at a time without a transaction. Between the second and third update another request reads the table and sees `uuid-A=0, uuid-C=1, uuid-B=1, uuid-D=3` — two items with order=1. The read gets inconsistent data. Wrapping all updates in a transaction means the entire batch is invisible to outside reads until it commits.

**Why send all IDs, not just "swap A and B"?**

A single swap message works for simple up/down buttons but breaks for drag-and-drop where you can move an item several positions at once. Sending the full ordered array is universal: it handles single swaps, drag-and-drop, and any future reorder strategy without changing the API contract.

**Integers, not fractions**

Some systems use fractional ordering (Jira, Trello): assign floats like 1000, 2000, 3000 and insert between them with 1500 — avoiding full reindexing. This is elegant but adds complexity. Since Betazoid sections are a small list (a course has perhaps 5–20 sections) the simpler integer approach — rewrite all orders on each reorder call — is entirely appropriate.

---

### 1.2 Backend — Section CRUD and Reorder

#### Entity

`backend/src/sections/entities/section.entity.ts`

```typescript
@Entity('sections')
export class Section {
    @PrimaryGeneratedColumn('uuid')
    section_id!: string;

    @Column({ length: 200 })
    title!: string;

    @Column({ type: 'int', default: 0 })
    order!: number;

    @ManyToOne(() => Course, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'course_id' })
    course!: Course;

    @CreateDateColumn()
    created_at!: Date;

    @UpdateDateColumn()
    updated_at!: Date;
}
```

Key decisions:
- `order` is a plain `int` defaulting to 0. When the first section is created its order is 0, the second is 1, and so on — set by counting existing sections in the service.
- `onDelete: 'CASCADE'` — deleting the parent course automatically deletes all its sections. A section cannot exist without a course.
- No inverse `@OneToMany` on `Course` is required at this stage. The sections module owns its own queries; it does not need TypeORM to eagerly load all sections when loading a course.

#### DTOs

**`create-section.dto.ts`** — one required field:

```typescript
export class CreateSectionDto {
    @IsString()
    @MinLength(1)
    @MaxLength(200)
    title!: string;
}
```

**`update-section.dto.ts`** — same field but optional (PATCH semantics):

```typescript
export class UpdateSectionDto {
    @IsOptional()
    @IsString()
    @MinLength(1)
    @MaxLength(200)
    title?: string;
}
```

**`reorder-sections.dto.ts`** — array of UUIDs:

```typescript
export class ReorderSectionsDto {
    @IsArray()
    @IsUUID(undefined, { each: true })
    orderedIds!: string[];
}
```

`@IsUUID(undefined, { each: true })` validates every element of the array as a UUID v4. The `undefined` version argument accepts any UUID version. This prevents garbage input from reaching the database.

#### Service — ownership verification

Every mutation goes through a private `verifyCourseOwnership` helper before doing any work:

```typescript
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
```

Three checks:
1. The course exists — otherwise 404.
2. The authenticated user is the course's instructor — otherwise 403. This is the ownership guard: one instructor cannot touch another instructor's sections.
3. The course is not pending review — otherwise 403. This enforces the US-13 rule that pending courses are locked for editing.

#### Service — create

```typescript
async create(courseId: string, dto: CreateSectionDto, instructorId: string): Promise<Section> {
    const course = await this.verifyCourseOwnership(courseId, instructorId);

    const count = await this.sectionRepo.count({
        where: { course: { course_id: courseId } },
    });

    const section = this.sectionRepo.create({
        title: dto.title,
        order: count,  // next available index: 0, 1, 2 ...
        course,
    });

    return this.sectionRepo.save(section);
}
```

`count` is used as the new section's order value. If the course already has 3 sections (orders 0, 1, 2), the new one gets order 3 — appended to the end.

#### Service — reorder

```typescript
async reorder(courseId: string, dto: ReorderSectionsDto, instructorId: string): Promise<Section[]> {
    await this.verifyCourseOwnership(courseId, instructorId);

    const sections = await this.sectionRepo.find({
        where: { course: { course_id: courseId } },
    });

    if (dto.orderedIds.length !== sections.length) {
        throw new BadRequestException('orderedIds must contain all section IDs for this course');
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
```

Validation before the transaction:
- `orderedIds.length !== sections.length` — the caller must account for every section, no additions or omissions allowed.
- A `Map` is built keyed by section ID for O(1) lookups. If any submitted ID is not in the map, it doesn't belong to this course — reject with 400.

The `DataSource` is injected via NestJS DI and provides `dataSource.transaction(callback)`. Inside the callback, `manager` is a transaction-scoped `EntityManager`. All saves go through it; if any one save throws, the transaction rolls back automatically.

The final `sectionRepo.find` after the transaction returns the freshly ordered list to the client.

#### Controller

```typescript
@Controller('courses/:courseId/sections')
@UseGuards(JwtAuthGuard)
export class SectionsController {
```

The controller is mounted at `courses/:courseId/sections`. NestJS automatically parses `:courseId` as a route parameter — every action in this controller always knows which course it is operating on.

The full endpoint map:

```
POST   /courses/:courseId/sections            → create
GET    /courses/:courseId/sections            → findAll
POST   /courses/:courseId/sections/reorder   → reorder   (must come before :sectionId routes)
PATCH  /courses/:courseId/sections/:sectionId → update
DELETE /courses/:courseId/sections/:sectionId → remove (204 No Content)
```

**Route ordering note:** `POST /courses/:courseId/sections/reorder` is declared **before** `PATCH :sectionId` and `DELETE :sectionId`. NestJS matches routes top-to-bottom; if `:sectionId` came first, the literal string `"reorder"` would be captured as the section ID, and the wrong handler would fire.

#### Module

```typescript
@Module({
    imports: [TypeOrmModule.forFeature([Section, Course])],
    controllers: [SectionsController],
    providers: [SectionsService],
    exports: [SectionsService],
})
export class SectionsModule {}
```

Both `Section` and `Course` are registered with `forFeature` because `SectionsService` needs to inject repositories for both. `Course` is needed for the ownership check — the service reads the course to verify the instructor ID without depending on `CoursesModule` at all.

---

### 1.3 Frontend — Sections Management Page

Route: `/courses/[id]/sections` → `frontend/src/app/courses/[id]/sections/page.tsx`

The page is linked from the Edit Course page via a "Manage Sections" button added to the action row.

#### Data fetching

```typescript
const { data: sections } = useQuery<Section[]>({
    queryKey: ['sections', courseId],
    queryFn: async () => {
        const { data } = await api.get(`/courses/${courseId}/sections`);
        return data;
    },
    enabled: !!accessToken && !!courseId,
});
```

`queryKey: ['sections', courseId]` scopes the cache to this specific course. Every mutation below calls `queryClient.invalidateQueries({ queryKey: ['sections', courseId] })` to refetch and keep the list fresh.

#### Add section form

A minimal `react-hook-form` + Zod form. On submit:

```typescript
const addMutation = useMutation({
    mutationFn: (data: AddSectionForm) => api.post(`/courses/${courseId}/sections`, data),
    onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['sections', courseId] });
        reset();   // clear the input field for the next section
    },
});
```

`reset()` is called on success so the title field is blank and ready for the next section.

#### Inline rename

Rather than a modal, renaming is inline: clicking "Rename" sets `editingId` to the section's ID, which causes the row to render an `<Input>` pre-populated with the current title. Clicking "Save" fires `renameMutation`; clicking "Cancel" clears `editingId` without saving.

```typescript
const [editingId, setEditingId] = useState<string | null>(null);
const [editTitle, setEditTitle] = useState('');
```

Only one section can be in edit mode at a time — `editingId` holds a single value. Opening rename on a different section automatically closes the previous one.

#### Up/Down reorder

The acceptance criteria mention "drag and drop" but no drag-and-drop library is installed in the project. The approach uses up (↑) and down (↓) arrow buttons that swap adjacent sections and call the reorder API:

```typescript
function moveSection(index: number, direction: 'up' | 'down') {
    if (!sections) return;
    const ordered = [...sections].sort((a, b) => a.order - b.order);
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= ordered.length) return;
    const ids = ordered.map((s) => s.section_id);
    [ids[index], ids[targetIndex]] = [ids[targetIndex], ids[index]];
    reorderMutation.mutate(ids);
}
```

The sorted list of IDs is built from the current query data. Two elements are swapped with a single destructured assignment, then the full array is sent to `POST /courses/:courseId/sections/reorder`. This is simpler than maintaining local optimistic state and still meets the acceptance criteria.

#### Two-step delete confirmation

```typescript
{confirmDeleteId === section.section_id && (
    <div className="ml-6 space-y-2">
        <p className="text-sm text-destructive">
            Delete "{section.title}"? This cannot be undone.
        </p>
        <div className="flex gap-2">
            <Button variant="destructive" onClick={() => deleteMutation.mutate(section.section_id)}>
                Confirm
            </Button>
            <Button variant="outline" onClick={() => setConfirmDeleteId(null)}>
                Cancel
            </Button>
        </div>
    </div>
)}
```

The first "Delete" button sets `confirmDeleteId`. A confirmation panel appears inline below that row. This avoids a modal while still preventing accidental deletion.

---

### 1.4 Security & Design Notes

**Ownership is verified on every request.** The service does not trust the JWT alone — it re-reads the course from the database on every mutation and checks that `course.instructor.user_id === req.user.userId`. This prevents one instructor from deleting or reordering sections that belong to another instructor's course, even if they have a valid JWT.

**Pending course lockout is enforced at the service layer.** The same `verifyCourseOwnership` helper that checks instructor ownership also checks `course.status !== PENDING`. This means sections cannot be added, renamed, reordered, or deleted while the course is under review — consistent with the US-13 business rule.

**No cascaded order renormalization on delete.** After a section is deleted, the remaining sections may have non-contiguous order values (e.g., 0, 1, 3 after deleting order=2). This is intentional — gaps do not affect `ORDER BY order ASC` sorting. Renormalizing on every delete would add a transaction and extra writes for no functional benefit. If the instructor reorders afterwards, the reorder call will assign clean 0..n-1 values.

**The `reorder` endpoint is idempotent.** Calling it twice with the same `orderedIds` produces the same result. This is safe to retry on network failure.

---

### 1.5 The Full Flow

**Add a section:**

```
Browser                  NestJS (SectionsController)        PostgreSQL
  |                                 |                             |
  |-- POST /courses/:id/sections -->|                             |
  |    { title: "Intro" }           |                             |
  |                            verify ownership                   |
  |                                 |-- SELECT course WHERE ... ->|
  |                                 |<-- course row --------------|
  |                            count existing sections            |
  |                                 |-- COUNT sections WHERE ... >|
  |                                 |<-- 2 ---------------------- |
  |                            INSERT section (order=2)           |
  |                                 |-- INSERT sections ---------->|
  |                                 |<-- new row (uuid) ----------|
  |<-- 201 { section_id, title, order: 2 } -------------------|
```

**Reorder sections:**

```
Browser                  NestJS (SectionsController)        PostgreSQL
  |                                 |                             |
  |-- POST /courses/:id/sections/reorder -->                      |
  |    { orderedIds: [...] }         |                             |
  |                            verify ownership + validate IDs    |
  |                                 |-- SELECT all sections ----->|
  |                                 |<-- [s1, s2, s3] -----------|
  |                            BEGIN TRANSACTION                  |
  |                                 |-- UPDATE s2 SET order=0 --->|
  |                                 |-- UPDATE s1 SET order=1 --->|
  |                                 |-- UPDATE s3 SET order=2 --->|
  |                            COMMIT                             |
  |                                 |-- SELECT ORDER BY order --->|
  |                                 |<-- [s2, s1, s3] -----------|
  |<-- 200 [ { section_id, title, order }, ... ] --------------|
```

---

## 2. US-17 — Create Lecture

> *As an Instructor, I want to create a lecture and choose its content type so that I can deliver content in the appropriate format.*

### Acceptance Criteria

- Instructor selects content type: video, article, or quiz
- Lecture is linked to the correct section
- Instructor can reorder lectures within a section

---

### 2.1 Theory — Content Types and the Discriminator Pattern

A lecture is a container. On its own, it only holds metadata: a title, a position in the section, and a **content type**. The actual content (a YouTube video ID, article body text, or quiz questions) lives in a separate child table.

```
lectures
  └── content_type = 'video'   → videos table (lecture_id FK, youtube_video_id, …)
  └── content_type = 'article' → articles table (lecture_id FK, body, reading_time, …)
  └── content_type = 'quiz'    → quizzes table (lecture_id FK, …)
```

This is the **discriminator pattern** (sometimes called a polymorphic one-to-one). The `content_type` column tells you which child table to look in. Each child row has a 1:1 FK back to the parent lecture.

Why not store everything in one big `lectures` table with nullable columns? Because that table would quickly become unmanageable — dozens of nullable columns, many of which are irrelevant for 2 out of 3 content types. Separate tables keep each content type clean and independently queryable.

**Sprint 4 scope:** US-17 only creates the lecture shell (title + content type). The child records are created in Sprint 5 (videos, articles) and Sprint 6 (quizzes). This is intentional — you build the scaffold before filling it in.

---

### 2.2 Theory — Enum Columns and TypeORM's `const object` Pattern

The `content_type` column is an `ENUM` in PostgreSQL — the database itself enforces that only `'video'`, `'article'`, or `'quiz'` can be stored. This prevents bad data from ever reaching the application layer.

TypeScript has two ways to model enums. Betazoid uses the **const object** form deliberately:

```typescript
// ✅ Used in this project — a plain JS object with a union type
export const LectureContentType = {
    VIDEO: 'video',
    ARTICLE: 'article',
    QUIZ: 'quiz',
} as const;
export type LectureContentType = (typeof LectureContentType)[keyof typeof LectureContentType];

// ❌ Not used — TypeScript enum keyword
enum LectureContentType { VIDEO = 'video', ARTICLE = 'article', QUIZ = 'quiz' }
```

The reason: TypeScript `enum` objects have quirky runtime behavior and are harder to iterate. With the const object form, `Object.values(LectureContentType)` gives you `['video', 'article', 'quiz']` — the exact array that TypeORM and `class-validator` need for validation.

---

### 2.3 Theory — Ownership Verification Through a Relation Chain

Sections belong to courses. Courses belong to instructors. Lectures belong to sections. So to verify "can this instructor create a lecture in this section?", you must traverse the chain:

```
Lecture → Section → Course → User (instructor)
```

The service loads the section with its course and the course's instructor in one query using TypeORM's `relations` option:

```typescript
const section = await this.sectionRepo.findOne({
    where: { section_id: sectionId, course: { course_id: courseId } },
    relations: ['course', 'course.instructor'],
});
```

This is a single SQL join query. After loading, the check is simple:

```typescript
if (section.course.instructor.user_id !== instructorId) throw new ForbiddenException(...)
```

The same check also blocks edits when the course is in `PENDING` status — an instructor cannot edit a course that is under admin review (inherited from the same rule established in US-16).

---

### 2.4 Backend — Lectures Module

#### Endpoint table

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `POST` | `/courses/:courseId/sections/:sectionId/lectures` | JWT | Create a lecture |
| `GET` | `/courses/:courseId/sections/:sectionId/lectures` | JWT | List lectures for a section |
| `PATCH` | `/courses/:courseId/sections/:sectionId/lectures/:lectureId` | JWT | Update title or content type |
| `DELETE` | `/courses/:courseId/sections/:sectionId/lectures/:lectureId` | JWT | Delete a lecture |
| `POST` | `/courses/:courseId/sections/:sectionId/lectures/reorder` | JWT | Reorder lectures |

All routes are nested under the section, which is itself nested under the course. This makes the URL self-documenting: every segment narrows the scope.

#### Entity — `lecture.entity.ts`

```typescript
export const LectureContentType = {
    VIDEO: 'video',
    ARTICLE: 'article',
    QUIZ: 'quiz',
} as const;
export type LectureContentType = (typeof LectureContentType)[keyof typeof LectureContentType];

@Entity('lectures')
export class Lecture {
    @PrimaryGeneratedColumn('uuid')
    lecture_id!: string;

    @Column({ length: 200 })
    title!: string;

    @Column({ type: 'enum', enum: Object.values(LectureContentType) })
    content_type!: LectureContentType;           // ← the discriminator

    @Column({ type: 'int', default: 0 })
    order!: number;                              // ← position within the section

    @ManyToOne(() => Section, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'section_id' })
    section!: Section;                           // ← FK to parent section

    @CreateDateColumn() created_at!: Date;
    @UpdateDateColumn() updated_at!: Date;
}
```

Key points:
- `onDelete: 'CASCADE'` — when a section is deleted, all its lectures are automatically deleted by the database. No application code needed.
- `order` starts at 0 and is set to the current lecture count at creation time (same append-at-end pattern as sections).

#### DTOs

**`create-lecture.dto.ts`** — both fields required on POST:

```typescript
export class CreateLectureDto {
    @IsString()
    @MinLength(1)
    @MaxLength(200)
    title!: string;

    @IsEnum(Object.values(LectureContentType))   // ← validates against ['video','article','quiz']
    content_type!: LectureContentType;
}
```

**`update-lecture.dto.ts`** — all fields optional on PATCH:

```typescript
export class UpdateLectureDto {
    @IsOptional() @IsString() @MinLength(1) @MaxLength(200)
    title?: string;

    @IsOptional() @IsEnum(Object.values(LectureContentType))
    content_type?: LectureContentType;
}
```

**`reorder-lectures.dto.ts`** — same shape as the sections reorder DTO:

```typescript
export class ReorderLecturesDto {
    @IsArray()
    @IsUUID(undefined, { each: true })
    orderedIds!: string[];
}
```

#### Service — key methods

**`create`** — appends a new lecture at the end:

```typescript
async create(courseId, sectionId, dto, instructorId): Promise<Lecture> {
    const section = await this.verifySectionOwnership(courseId, sectionId, instructorId);

    const count = await this.lectureRepo.count({
        where: { section: { section_id: sectionId } },
    });
    // count = 0 → first lecture gets order=0; count = 3 → fourth gets order=3

    const lecture = this.lectureRepo.create({
        title: dto.title,
        content_type: dto.content_type,
        order: count,         // append at end
        section,
    });
    return this.lectureRepo.save(lecture);
}
```

**`reorder`** — the same transactional batch-update pattern used for sections:

```typescript
async reorder(courseId, sectionId, dto, instructorId): Promise<Lecture[]> {
    await this.verifySectionOwnership(courseId, sectionId, instructorId);

    const lectures = await this.lectureRepo.find({ where: { section: { section_id: sectionId } } });

    // Guard: orderedIds must be a complete set (not a subset)
    if (dto.orderedIds.length !== lectures.length) throw new BadRequestException(...)

    const lectureMap = new Map(lectures.map(l => [l.lecture_id, l]));

    // Guard: every ID must belong to this section (no foreign IDs injected)
    for (const id of dto.orderedIds) {
        if (!lectureMap.has(id)) throw new BadRequestException(...)
    }

    await this.dataSource.transaction(async (manager) => {
        for (let i = 0; i < dto.orderedIds.length; i++) {
            const lecture = lectureMap.get(dto.orderedIds[i])!;
            lecture.order = i;
            await manager.save(Lecture, lecture);
        }
    });

    return this.lectureRepo.find({ where: { ... }, order: { order: 'ASC' } });
}
```

The transaction wraps all individual `UPDATE` statements. If any one fails (disk full, connection lost), PostgreSQL rolls back the entire batch — you never end up with a partial reorder.

---

### 2.5 Frontend — Lectures Page

**Route:** `/courses/[id]/sections/[sectionId]/lectures`

The page lives at `frontend/src/app/courses/[id]/sections/[sectionId]/lectures/page.tsx` and mirrors the sections page structure exactly.

#### Navigation entry point

A **Lectures** button was added to each section row on the sections page (`/courses/[id]/sections`):

```tsx
<Button size="sm" variant="outline" asChild>
    <Link href={`/courses/${courseId}/sections/${section.section_id}/lectures`}>
        Lectures
    </Link>
</Button>
```

This uses the `asChild` pattern — the `Button` renders as a `<Link>` while keeping all button styles. No raw `className` manipulation needed.

#### Data fetching

```tsx
const { data: lectures } = useQuery<Lecture[]>({
    queryKey: ['lectures', courseId, sectionId],
    queryFn: async () => {
        const { data } = await api.get(
            `/courses/${courseId}/sections/${sectionId}/lectures`
        );
        return data;
    },
    enabled: !!accessToken && !!courseId && !!sectionId,  // ← all three must be truthy
});
```

The `queryKey` includes both `courseId` and `sectionId` so that TanStack Query caches each section's lectures independently. If you navigate between two sections for the same course, their lecture lists don't collide.

#### Create form

```tsx
const addLectureSchema = z.object({
    title: z.string().min(1, 'Title is required').max(200),
    content_type: z.enum(CONTENT_TYPES),   // mirrors the backend enum
});
```

The content type is a `<select>` element (not a shadcn component — no `Select` has been installed yet). It is styled with design-token classes only:

```tsx
<select
    {...register('content_type')}
    className="w-full border border-border rounded px-3 py-2 text-sm bg-background"
>
    {CONTENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
</select>
```

The `defaultValues` in `useForm` pre-select `'video'` so the user sees a valid choice immediately. After a successful submit, `reset({ content_type: 'video' })` clears the title but preserves the default content type.

#### Reorder

Up/Down buttons call the same move-and-swap helper used on the sections page:

```tsx
function moveLecture(index: number, direction: 'up' | 'down') {
    if (!lectures) return;
    const ordered = [...lectures].sort((a, b) => a.order - b.order);
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= ordered.length) return;
    const ids = ordered.map(l => l.lecture_id);
    [ids[index], ids[targetIndex]] = [ids[targetIndex], ids[index]]; // swap
    reorderMutation.mutate(ids);
}
```

The sorted array is derived from the query cache on each render — the `order` field is the source of truth from the server. When `reorderMutation` succeeds, `invalidateQueries` refetches the list and re-sorts it.

---

### 2.6 Security / Design Notes

**Content type is final (by design for Sprint 4):** The update DTO allows changing `content_type`, but in practice this should be disallowed once a child record (video/article/quiz) has been attached in Sprint 5/6. For now, the constraint is not enforced — no child records exist yet.

**CASCADE delete:** Deleting a section deletes all its lectures (PostgreSQL `ON DELETE CASCADE`). This is intentional and documented — instructors are warned in the UI before confirming a section delete.

**Reorder validation:** Two guards prevent injection attacks on the reorder endpoint:
1. The ID count must match exactly — you cannot submit a partial list to leave some lectures with stale order values.
2. Every ID must belong to the target section — an attacker cannot inject a foreign `lecture_id` to corrupt another section's ordering.

---

### 2.7 The Full Flow

**Create a lecture:**

```
Browser                  NestJS (LecturesController)          PostgreSQL
  |                                 |                               |
  |-- POST /courses/:c/sections/:s/lectures                         |
  |   { title, content_type }       |                               |
  |                           JwtAuthGuard validates token          |
  |                                 |                               |
  |                           verifySectionOwnership()              |
  |                                 |-- SELECT section + course  -->|
  |                                 |   WHERE section_id = :s       |
  |                                 |   AND course_id = :c          |
  |                                 |<-- { section, course, instr} -|
  |                           check instructor_id + status          |
  |                                 |                               |
  |                                 |-- COUNT lectures WHERE s_id ->|
  |                                 |<-- 2 (next order = 2) --------|
  |                                 |                               |
  |                                 |-- INSERT INTO lectures ------->|
  |                                 |   (title, content_type,       |
  |                                 |    order=2, section_id)        |
  |                                 |<-- { lecture_id, … } ---------|
  |<-- 201 { lecture_id, title, content_type, order } ------------|
```

**Reorder lectures:**

```
Browser                  NestJS (LecturesController)          PostgreSQL
  |                                 |                               |
  |-- POST …/lectures/reorder       |                               |
  |   { orderedIds: [b, a, c] }     |                               |
  |                           verify ownership + validate IDs       |
  |                                 |-- SELECT all lectures -------->|
  |                                 |<-- [a(0), b(1), c(2)] --------|
  |                            BEGIN TRANSACTION                    |
  |                                 |-- UPDATE b SET order=0 ------->|
  |                                 |-- UPDATE a SET order=1 ------->|
  |                                 |-- UPDATE c SET order=2 ------->|
  |                            COMMIT                               |
  |                                 |-- SELECT ORDER BY order ------>|
  |                                 |<-- [b, a, c] -----------------|
  |<-- 200 [ { lecture_id, title, content_type, order }, … ] -----|
```

---

## 3. US-18 — Free Preview Toggle

> *As an Instructor, I want to mark a lecture as free preview so that prospective students can sample the course before purchasing.*

### Acceptance Criteria
- Free preview toggle is available per lecture
- Free preview lectures are accessible to non-enrolled users on the course page

---

### 3.1 Theory — Free Preview as a Marketing Tool

On a paid learning platform, prospective students face a trust problem: they cannot evaluate a course without paying for it. Free preview lectures solve this by letting instructors unlock a subset of lectures for anyone to view before purchasing.

The decision of *which* lectures to unlock sits entirely with the instructor. A course might have 30 lectures and the instructor might mark 3 as free preview — typically the first lecture of each section, or a particularly engaging demo. Marking a lecture as free preview does not change its position, content type, or order; it only controls access.

**How access is modelled**

A single boolean column `is_free_preview` on the `lectures` table is sufficient:

```
lectures
┌─────────────┬───────────────────────┬──────────────────┬───────┐
│ lecture_id  │         title         │  is_free_preview │ order │
├─────────────┼───────────────────────┼──────────────────┼───────┤
│ uuid-A      │ Welcome to the Course │       true       │   0   │
│ uuid-B      │ Setting Up            │       false      │   1   │
│ uuid-C      │ Core Concepts Intro   │       true       │   2   │
│ uuid-D      │ Deep Dive             │       false      │   3   │
└─────────────┴───────────────────────┴──────────────────┴───────┘
```

When a non-enrolled visitor loads the public course page, the backend returns all lectures with their `is_free_preview` flag. The frontend uses that flag to render each lecture as either viewable or locked. The enforcement of *actual video access* (YouTube playlist grant) is a Sprint 5 concern — at this stage, "accessible" means the frontend receives and displays the flag correctly.

**Toggle vs. dedicated endpoint**

Rather than a dedicated `PATCH /lectures/:id/preview` endpoint, the implementation re-uses the existing `PATCH /lectures/:id` update endpoint and adds `is_free_preview` as an optional PATCH field. This is the minimal approach — one fewer route, one fewer service method — while still meeting the acceptance criterion of a per-lecture toggle.

---

### 3.2 Theory — Exposing Public Data Without Breaking Auth

The existing `GET /courses/:id` endpoint is protected by `JwtAuthGuard`. A non-enrolled visitor has no JWT, so they cannot call it. But the public course detail (sections, lectures, is_free_preview) must be available to anyone.

The solution is a separate public endpoint `GET /courses/:id/public`. NestJS's `@Public()` decorator (established in Sprint 2) tells the JWT guard to skip authentication for that specific route. The guard checks for the decorator before validating the token:

```
Request arrives at GET /courses/:id/public
         ↓
JwtAuthGuard.canActivate()
         ↓
  Does the handler have @Public()? ──YES──→ allow through (no JWT needed)
         ↓ NO
  Is there a valid Bearer token?  ──NO───→ 401 Unauthorized
         ↓ YES
  Decode and attach user; allow through
```

`@Public()` is a metadata flag — `Reflector.getAllAndOverride(IS_PUBLIC_KEY, [...])` — that the guard reads. No extra infrastructure; just a decorator and a reflector check that was already in place.

**Route ordering matters:** `GET :id/public` must appear in the controller *before* `GET :id`. NestJS matches routes top-to-bottom; if `:id` came first, the literal string `"public"` would be captured as the course ID, and the wrong handler — the protected one — would fire.

---

### 3.3 Backend — Entity and DTO

#### Entity change — `lecture.entity.ts`

A single column addition:

```typescript
@Column({ type: 'boolean', default: false })
is_free_preview!: boolean;
```

- `type: 'boolean'` — maps to `BOOLEAN` in PostgreSQL.
- `default: false` — every newly created lecture starts as non-preview. The instructor opts in explicitly, never accidentally exposing a lecture.
- No `nullable: true` needed — the column is always present and always has a value.

#### DTO change — `update-lecture.dto.ts`

`is_free_preview` is added as an optional PATCH field:

```typescript
export class UpdateLectureDto {
    @IsOptional() @IsString() @MinLength(1) @MaxLength(200)
    title?: string;

    @IsOptional() @IsEnum(Object.values(LectureContentType))
    content_type?: LectureContentType;

    @IsOptional()
    @IsBoolean()        // ← validates that the value is exactly true or false, not "true" (string)
    is_free_preview?: boolean;
}
```

`@IsBoolean()` from `class-validator` rejects truthy strings like `"true"` or `1`. The global `ValidationPipe` with `transform: true` would coerce strings to booleans, but by requiring strict booleans in the body the API remains honest about its contract.

#### Service change — `lectures.service.ts`

One line added to the `update()` method, alongside the existing field checks:

```typescript
async update(courseId, sectionId, lectureId, dto, instructorId): Promise<Lecture> {
    await this.verifySectionOwnership(courseId, sectionId, instructorId);

    const lecture = await this.lectureRepo.findOne({
        where: { lecture_id: lectureId, section: { section_id: sectionId } },
    });
    if (!lecture) throw new NotFoundException('Lecture not found');

    if (dto.title !== undefined) lecture.title = dto.title;
    if (dto.content_type !== undefined) lecture.content_type = dto.content_type;
    if (dto.is_free_preview !== undefined) lecture.is_free_preview = dto.is_free_preview;  // ← new

    return this.lectureRepo.save(lecture);
}
```

The `!== undefined` guard is the standard PATCH pattern: only update a field if the caller explicitly sent it. This lets a client toggle `is_free_preview` without needing to resend `title` or `content_type`.

---

### 3.4 Backend — Public Course Detail Endpoint

#### New interface types — `courses.service.ts`

Three plain interfaces describe the public response shape:

```typescript
export interface PublicLecture {
    lecture_id: string;
    title: string;
    content_type: string;
    order: number;
    is_free_preview: boolean;   // ← the flag non-enrolled users need
}

export interface PublicSection {
    section_id: string;
    title: string;
    order: number;
    lectures: PublicLecture[];
}

export interface PublicCourseDetail {
    course_id: string;
    title: string;
    description: string;
    price: number;
    thumbnail_url: string | null;
    language: string;
    level: string;
    rating: number;
    instructor_name: string;    // ← denormalized: no need to expose the full User object
    category_name: string | null;
    sections: PublicSection[];
}
```

Only safe, public fields are exposed. The instructor's email, user_id, and other course metadata (rejection_reason, status) are intentionally omitted from the response.

#### New repos injected — `CoursesService` constructor

`findPublicDetail` needs to query the `sections` and `lectures` tables. Two new repos are injected:

```typescript
constructor(
    @InjectRepository(Course)    private readonly courseRepo: Repository<Course>,
    @InjectRepository(Category)  private readonly categoryRepo: Repository<Category>,
    @InjectRepository(Section)   private readonly sectionRepo: Repository<Section>,   // ← new
    @InjectRepository(Lecture)   private readonly lectureRepo: Repository<Lecture>,   // ← new
    private readonly mailService: MailService,
    private readonly config: ConfigService,
) {}
```

And `CoursesModule` registers the two entity repositories:

```typescript
imports: [TypeOrmModule.forFeature([Course, Category, Section, Lecture]), MailModule],
```

Why register `Section` and `Lecture` in `CoursesModule` instead of importing `SectionsModule` or `LecturesModule`? Module imports expose *services*, not repositories. To inject a repository directly, you must register its entity with `forFeature` in the consuming module. Importing `LecturesModule` would give access to `LecturesService`, but `CoursesService` needs raw repository access to assemble its own bespoke response shape.

#### `findPublicDetail` service method

```typescript
async findPublicDetail(courseId: string): Promise<PublicCourseDetail> {
    // 1. Load the course — only if it is published
    const course = await this.courseRepo.findOne({
        where: { course_id: courseId, status: CourseStatus.PUBLISHED },
        relations: ['instructor', 'category'],
    });
    if (!course) throw new NotFoundException('Course not found');
    // Note: a DRAFT or PENDING course returns 404 — same message as non-existent.
    // This prevents enumeration of unpublished course IDs.

    // 2. Load sections ordered by position
    const sections = await this.sectionRepo.find({
        where: { course: { course_id: courseId } },
        order: { order: 'ASC' },
    });

    // 3. For each section, load its lectures (N+1 pattern — acceptable for a detail page)
    const sectionsWithLectures: PublicSection[] = await Promise.all(
        sections.map(async (section) => {
            const lectures = await this.lectureRepo.find({
                where: { section: { section_id: section.section_id } },
                order: { order: 'ASC' },
            });
            return {
                section_id: section.section_id,
                title: section.title,
                order: section.order,
                lectures: lectures.map((l) => ({
                    lecture_id: l.lecture_id,
                    title: l.title,
                    content_type: l.content_type,
                    order: l.order,
                    is_free_preview: l.is_free_preview,
                })),
            };
        }),
    );

    // 4. Assemble the response, parsing decimal strings from PostgreSQL
    return {
        course_id: course.course_id,
        title: course.title,
        description: course.description,
        price: parseFloat(course.price as unknown as string),    // TypeORM returns DECIMAL as string
        thumbnail_url: course.thumbnail_url,
        language: course.language,
        level: course.level,
        rating: parseFloat(course.rating as unknown as string),  // same
        instructor_name: course.instructor.full_name,
        category_name: course.category?.name ?? null,
        sections: sectionsWithLectures,
    };
}
```

**The N+1 query pattern:** The code runs one `lectureRepo.find` per section. For a course with 8 sections this is 1 (course) + 1 (sections) + 8 (lectures per section) = 10 queries. For a public detail page that is called once per page load, this is completely acceptable. A single `JOIN` query builder would be more efficient but harder to read and map. The pragmatic choice here is legibility over micro-optimization.

**`parseFloat` on decimal columns:** TypeORM returns PostgreSQL `DECIMAL` / `NUMERIC` columns as strings to preserve precision (JavaScript `number` is a 64-bit float and cannot represent all decimal values exactly). Always wrap with `parseFloat()` before returning to clients.

#### Controller — `courses.controller.ts`

```typescript
@Public()               // ← no JWT required
@Get(':id/public')      // ← must come BEFORE @Get(':id')
findPublicDetail(@Param('id') id: string) {
    return this.coursesService.findPublicDetail(id);
}
```

No `@Request()` needed — the endpoint is stateless and unauthenticated. `@Public()` is enough to bypass the guard.

---

### 3.5 Frontend — Lecture Management Page (Toggle)

**File:** `frontend/src/app/courses/[id]/sections/[sectionId]/lectures/page.tsx`

#### Updated `Lecture` interface

```typescript
interface Lecture {
    lecture_id: string;
    title: string;
    content_type: ContentType;
    order: number;
    is_free_preview: boolean;   // ← added
}
```

#### Toggle mutation

```typescript
const togglePreviewMutation = useMutation({
    mutationFn: ({ lectureId, is_free_preview }: { lectureId: string; is_free_preview: boolean }) =>
        api.patch(
            `/courses/${courseId}/sections/${sectionId}/lectures/${lectureId}`,
            { is_free_preview }
        ),
    onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['lectures', courseId, sectionId] });
    },
});
```

The mutation sends `PATCH /lectures/:id` with only `{ is_free_preview: <new value> }`. The backend's `update()` method applies only that field and leaves title and content_type unchanged.

#### Preview badge in lecture title

When a lecture is already marked as free preview, a badge appears next to its title in the list:

```tsx
{lecture.is_free_preview && (
    <span className="ml-2 text-xs border border-border px-1 rounded">
        Free Preview
    </span>
)}
```

This uses only design-token classes (`border-border`) — no raw Tailwind color values — consistent with the frontend conventions.

#### Toggle button

The button label switches between `"Set Preview"` and `"Remove Preview"` based on the current state:

```tsx
<Button
    size="sm"
    variant="outline"
    disabled={togglePreviewMutation.isPending}
    onClick={() =>
        togglePreviewMutation.mutate({
            lectureId: lecture.lecture_id,
            is_free_preview: !lecture.is_free_preview,   // ← flip the boolean
        })
    }
>
    {lecture.is_free_preview ? 'Remove Preview' : 'Set Preview'}
</Button>
```

`disabled={togglePreviewMutation.isPending}` prevents double-clicks during the network round-trip. On success, the query is invalidated and the list refetches, updating the badge and button label.

---

### 3.6 Frontend — Public Course Detail Page

**File:** `frontend/src/app/courses/[id]/page.tsx`

This page is reachable by anyone — no login required. It uses TanStack Query without the `enabled: !!accessToken` guard (the endpoint needs no token).

```typescript
const { data: course, isLoading, isError } = useQuery<PublicCourseDetail>({
    queryKey: ['course-public', courseId],
    queryFn: async () => {
        const { data } = await api.get(`/courses/${courseId}/public`);
        return data;
    },
    enabled: !!courseId,   // ← only needs the course ID, not a token
});
```

The shared `api` instance from `lib/axios.ts` is used — it attaches a Bearer token if one is in the Zustand store, but does not fail if there is none. `withCredentials: true` is still set for the cookie refresh flow, but this endpoint ignores credentials entirely.

#### Section and lecture rendering

```tsx
{course.sections.map((section) => (
    <div key={section.section_id} className="space-y-2">
        <p className="text-sm font-medium">{section.title}</p>
        <div className="space-y-1 ml-4">
            {section.lectures.map((lecture) => (
                <div key={lecture.lecture_id} className="flex items-center gap-2 text-sm">
                    <span>
                        {lecture.title}{' '}
                        <span className="text-muted-foreground">[{lecture.content_type}]</span>
                    </span>
                    {lecture.is_free_preview ? (
                        <span className="text-xs border border-border px-1 rounded">
                            Free Preview
                        </span>
                    ) : (
                        <span className="text-xs text-muted-foreground">Enrolled only</span>
                    )}
                </div>
            ))}
        </div>
        <Separator />
    </div>
))}
```

Every lecture is visible in the list — title, content type, and access status. Non-preview lectures show "Enrolled only" so prospective students understand the structure without being able to access the content. This mirrors how Udemy's course preview page works.

---

### 3.7 Security / Design Notes

**Draft and pending courses return 404.** `findPublicDetail` filters by `status: CourseStatus.PUBLISHED`. A course that is DRAFT or PENDING returns the same `NotFoundException` as a non-existent course. This prevents course ID enumeration — an attacker scanning UUIDs cannot distinguish "doesn't exist" from "exists but not yet published".

**`@Public()` does not bypass `RbacGuard`.** This endpoint has no `@RequirePermission()` decorator, so `RbacGuard` never runs on it either. Only the JWT guard is bypassed.

**Content type is for structure, not access control.** At Sprint 4, "accessible" means the lecture appears on the public course page with a Free Preview badge. Actual video delivery (YouTube playlist grant) is enforced in Sprint 5. The `is_free_preview` flag drives that future grant decision — if a lecture is `is_free_preview: true`, Sprint 5's logic will embed the player without requiring enrollment.

**Instructor cannot preview-toggle while course is PENDING.** The `update()` service method goes through `verifySectionOwnership`, which blocks all mutations — including `is_free_preview` changes — when the course status is `PENDING`. This is the same lockout applied to all lecture mutations (US-13 rule).

---

### 3.8 The Full Flow

**Toggle a lecture to free preview (instructor):**

```
Browser                  NestJS (LecturesController)          PostgreSQL
  |                                 |                               |
  |-- PATCH …/lectures/:id          |                               |
  |   { is_free_preview: true }     |                               |
  |                           JwtAuthGuard validates token          |
  |                           ValidationPipe validates DTO          |
  |                                 |                               |
  |                           verifySectionOwnership()              |
  |                                 |-- SELECT section+course ----->|
  |                                 |<-- { section, course, instr} -|
  |                           check instructor + not PENDING        |
  |                                 |                               |
  |                                 |-- SELECT lecture WHERE id=:id >|
  |                                 |<-- { lecture_id, … } ---------|
  |                           lecture.is_free_preview = true        |
  |                                 |-- UPDATE lectures SET … ------>|
  |                                 |<-- updated row ---------------|
  |<-- 200 { lecture_id, is_free_preview: true, … } ---------------|
```

**Non-enrolled visitor loads the public course page:**

```
Browser (no JWT)         NestJS (CoursesController)           PostgreSQL
  |                                 |                               |
  |-- GET /courses/:id/public ------>|                               |
  |                           JwtAuthGuard sees @Public()           |
  |                           → skips token validation              |
  |                                 |                               |
  |                           findPublicDetail(:id)                 |
  |                                 |-- SELECT course WHERE         |
  |                                 |   course_id=:id               |
  |                                 |   AND status='published' ----->|
  |                                 |<-- { course, instructor, cat}-|
  |                                 |                               |
  |                                 |-- SELECT sections WHERE ------>|
  |                                 |   course_id=:id ORDER BY order|
  |                                 |<-- [section-A, section-B] ----|
  |                                 |                               |
  |                           for each section:                     |
  |                                 |-- SELECT lectures WHERE ------>|
  |                                 |   section_id=:sid ORDER order |
  |                                 |<-- [lecture-1, lecture-2] ----|
  |                                 |                               |
  |<-- 200 {                        |                               |
  |      title, description,        |                               |
  |      instructor_name,           |                               |
  |      sections: [                |                               |
  |        { title, lectures: [     |                               |
  |          { title,               |                               |
  |            is_free_preview: true/false }                        |
  |        ]}                       |                               |
  |      ]}                         |                               |
```
