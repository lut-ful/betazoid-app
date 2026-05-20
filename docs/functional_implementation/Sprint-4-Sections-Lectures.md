# Sprint 4 — Sections & Lectures

**User Stories:** US-16 · US-17 · US-18 · US-19
**Sprint Duration:** 2 weeks
**Backend module(s):** `sections`, `lectures`
**Frontend pages:** `/courses/[id]/sections`, `/courses/[id]/lectures`

---

## Table of Contents

1. [US-16 — Section Management](#1-us-16--section-management)
2. [US-17 — Create Lecture](#2-us-17--create-lecture)

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
