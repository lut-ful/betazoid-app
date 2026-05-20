# Sprint 3 — Categories & Courses

**User Stories:** US-11 · US-12 · US-13 · US-14 · US-15
**Sprint Duration:** 2 weeks
**Backend module(s):** `categories`, `courses`
**Frontend pages:** `/admin/categories`, `/courses`, `/admin/courses`

---

## Table of Contents

1. [US-11 — Category Management](#1-us-11--category-management)
2. [US-12 — Create Course](#2-us-12--create-course)
3. [US-13 — Submit Course for Review](#3-us-13--submit-course-for-review)

---

## 1. US-11 — Category Management

> *As an Admin, I want to create and manage course categories and subcategories so that courses are organized logically.*

### Acceptance Criteria
- Categories can have an optional parent category
- Categories can be renamed or deleted
- Deleting a parent category prompts reassignment of subcategories

---

### 1.1 Theory — Self-Referential Database Relationships

A **self-referential relationship** is when a database table holds a foreign key that points back to the same table. It is the standard way to store hierarchical data — trees, folders, categories, org charts — without needing multiple tables.

For categories the structure looks like this:

```
categories table
┌─────────────┬──────────────────────────┬──────────────────────────┐
│ category_id │         name             │   parent_category_id     │
├─────────────┼──────────────────────────┼──────────────────────────┤
│ uuid-1      │ Programming              │ NULL                     │  ← top-level
│ uuid-2      │ Web Development          │ uuid-1                   │  ← child of uuid-1
│ uuid-3      │ Mobile Development       │ uuid-1                   │  ← child of uuid-1
│ uuid-4      │ Design                   │ NULL                     │  ← top-level
│ uuid-5      │ UI / UX                  │ uuid-4                   │  ← child of uuid-4
└─────────────┴──────────────────────────┴──────────────────────────┘
```

`parent_category_id` is a foreign key that references `categories.category_id` **in the same table**. A `NULL` value means "no parent — this is a top-level category."

**Why not just use a string like `parent_name`?**  
Because names can change. A foreign key to `category_id` (a UUID that never changes) guarantees referential integrity even when a category is renamed.

**What is `onDelete: 'RESTRICT'`?**  
The PostgreSQL foreign key constraint has four deletion behaviours:

| Behaviour   | What happens when the referenced row is deleted         |
|-------------|--------------------------------------------------------|
| `CASCADE`   | Child rows are deleted automatically                   |
| `SET NULL`  | Child's FK column is set to NULL                       |
| `RESTRICT`  | Deletion is **blocked** if any child row references it |
| `NO ACTION` | Same as RESTRICT, checked at end of transaction        |

`RESTRICT` means the database itself refuses to delete a parent category that still has children. This is a safety net at the storage layer — our service layer checks first and returns a proper 400 error message to the user, but `RESTRICT` ensures that even a rogue direct SQL query cannot accidentally orphan subcategories.

**The TypeORM self-join pattern:**

```
@ManyToOne  — "this category has one parent"
@OneToMany  — "this category can have many children"
Both decorators reference the same entity (Category)
```

You define both sides on the same entity class, crossing over:

```
@ManyToOne(() => Category, (cat) => cat.children, ...)
parent: Category | null;

@OneToMany(() => Category, (cat) => cat.parent)
children: Category[];
```

The first argument is the related entity (same class). The second argument is the *inverse property* — the property on the other side of the relation. That cross-wiring lets TypeORM understand the bidirectional link.

---

### 1.2 Backend — Category CRUD

#### Routes

```
GET    /api/v1/categories          — public, lists all categories with parent + children
POST   /api/v1/categories          — requires permission: create:categories
PATCH  /api/v1/categories/:id      — requires permission: update:categories
DELETE /api/v1/categories/:id      — requires permission: delete:categories
```

The read route is `@Public()` because students and instructors need to browse categories (for example when filtering courses). Write operations are gated by the RBAC permission guard established in Sprint 2.

---

#### Entity — `category.entity.ts`

```typescript
@Entity('categories')
export class Category {
    @PrimaryGeneratedColumn('uuid')
    category_id!: string;

    @Column({ length: 100, unique: true })
    name!: string;

    // Self-referential ManyToOne — "I have one parent"
    @ManyToOne(() => Category, (cat) => cat.children, { nullable: true, onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'parent_category_id' })
    parent!: Category | null;

    // Self-referential OneToMany — "I can have many children"
    @OneToMany(() => Category, (cat) => cat.parent)
    children!: Category[];

    @CreateDateColumn()
    created_at!: Date;

    @UpdateDateColumn()
    updated_at!: Date;
}
```

Key points:
- `unique: true` on `name` — category names must be globally unique. The service also checks this in code to return a friendly 409 message rather than a raw DB constraint error.
- `nullable: true` in `@ManyToOne` — tells TypeORM that `parent_category_id` may be NULL (top-level categories have no parent).
- `@JoinColumn({ name: 'parent_category_id' })` — explicitly names the FK column in the database. Without this, TypeORM would generate a name like `parentCategoryId`.
- `onDelete: 'RESTRICT'` — DB-level safety net: cannot delete a parent that has children referencing it.

---

#### DTOs

**`create-category.dto.ts`**

```typescript
export class CreateCategoryDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(100)
    name!: string;                 // required; max 100 chars to match entity column

    @IsOptional()
    @IsUUID()
    parentCategoryId?: string;     // omit = top-level; provide = subcategory
}
```

**`update-category.dto.ts`**

```typescript
export class UpdateCategoryDto {
    @IsOptional()
    @IsString()
    @IsNotEmpty()
    @MaxLength(100)
    name?: string;                 // undefined = don't change the name

    @IsOptional()
    @ValidateIf((_, val) => val !== null)   // skip @IsUUID check when value is null
    @IsUUID()
    parentCategoryId?: string | null;
    // Three distinct meanings:
    //   undefined  → leave the parent unchanged
    //   null       → remove the parent (make top-level)
    //   "uuid..."  → set a new parent
}
```

The `parentCategoryId` field in the update DTO uses a three-way value strategy. `undefined` (field omitted entirely) means "don't touch the parent". `null` (field sent explicitly as `null`) means "clear the parent". A UUID string means "reassign to this parent". This is why the service checks `dto.parentCategoryId !== undefined` before acting — it distinguishes "not sent" from "sent as null".

The `@ValidateIf((_, val) => val !== null)` decorator means: run the `@IsUUID()` validation *unless* the value is exactly `null`. Without it, `null` would fail the UUID format check.

---

#### Service — `categories.service.ts`

**`create(dto)`**

```
1. Check if a category with dto.name already exists → 409 ConflictException
2. If dto.parentCategoryId is provided:
     a. Load the parent entity from DB → 404 if not found
3. Create the entity with { name, parent } and save
4. Return the saved entity (TypeORM auto-populates created_at, updated_at)
```

```typescript
async create(dto: CreateCategoryDto): Promise<Category> {
    const existing = await this.categoryRepo.findOne({ where: { name: dto.name } });
    if (existing) throw new ConflictException('A category with this name already exists');

    let parent: Category | null = null;
    if (dto.parentCategoryId) {
        parent = await this.categoryRepo.findOne({
            where: { category_id: dto.parentCategoryId },
        });
        if (!parent) throw new NotFoundException('Parent category not found');
    }

    const category = this.categoryRepo.create({ name: dto.name, parent });
    return this.categoryRepo.save(category);
}
```

Notice that the service passes `parent` (a full `Category` entity) to `categoryRepo.create()`, not a raw UUID. TypeORM's repository understands relations: if you pass an entity object for a relation property, it writes the correct FK value into the column.

**`findAll()`**

```typescript
async findAll(): Promise<Category[]> {
    return this.categoryRepo.find({
        relations: { parent: true, children: true },  // eager-load both directions
        order: { name: 'ASC' },
    });
}
```

`relations: { parent: true, children: true }` tells TypeORM to perform JOIN queries for both the parent relation and the children relation in a single `find()` call. Without this, `category.parent` and `category.children` would be `undefined` at runtime (TypeORM relations are lazy by default unless eager loading is configured).

**`update(categoryId, dto)`**

```
1. Load category (with parent relation) → 404 if not found
2. If dto.name is provided and different from current name:
     a. Check for name conflict → 409
     b. Update category.name
3. If dto.parentCategoryId is not undefined (i.e. was explicitly sent):
     a. null → set category.parent = null
     b. same id as categoryId → 400 "cannot be its own parent"
     c. uuid → load parent entity → 404 if not found → set category.parent
4. Save and return
```

The self-parent guard (`dto.parentCategoryId === categoryId`) prevents a circular reference at the single level. Note: it does not guard against deeper cycles (A → B → A). Implementing full cycle detection would require a recursive query; for this platform's two-level category structure, the guard is sufficient.

**`remove(categoryId)`**

```
1. Load category WITH children relation → 404 if not found
2. If category.children.length > 0 → 400 with count in message
3. categoryRepo.remove(category)
```

The key insight: you must load the `children` relation before checking — TypeORM does not automatically populate relations. If you skip `relations: { children: true }`, `category.children` will be `undefined`, and `.length` will throw at runtime.

---

#### Controller — `categories.controller.ts`

```typescript
@Controller('categories')
export class CategoriesController {
    @Public()
    @Get()                                          // no auth required
    findAll() { ... }

    @Post()
    @HttpCode(HttpStatus.CREATED)
    @RequirePermission('create:categories')         // RBAC guard from Sprint 2
    create(@Body() dto: CreateCategoryDto) { ... }

    @Patch(':id')
    @HttpCode(HttpStatus.OK)
    @RequirePermission('update:categories')
    update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCategoryDto) { ... }

    @Delete(':id')
    @HttpCode(HttpStatus.NO_CONTENT)
    @RequirePermission('delete:categories')
    remove(@Param('id', ParseUUIDPipe) id: string) { ... }
}
```

`ParseUUIDPipe` on `@Param('id')` validates the path parameter is a valid UUID v4 format before the handler even runs. If the caller passes a non-UUID string, NestJS returns a 400 immediately — the service never sees it.

`@HttpCode(HttpStatus.NO_CONTENT)` on `DELETE` means the response has status 204 and no body. NestJS defaults to 200; you must override it explicitly.

`@RequirePermission('create:categories')` sets metadata that the global `PermissionsGuard` (Sprint 2) reads. The guard checks whether the authenticated user's roles include a permission with that exact name in the database. No permission = 403. No JWT at all = 401 (from the global `JwtAuthGuard` which runs first).

---

### 1.3 Frontend — `/admin/categories`

The page (`frontend/src/app/admin/categories/page.tsx`) has three responsibilities:
1. Display all categories with their parent and child count
2. Provide a create form
3. Provide per-category inline edit and delete

**Auth guard:**

```typescript
const accessToken = useAuthStore((s) => s.accessToken);

useEffect(() => {
    if (!accessToken) router.push('/login');
}, [accessToken, router]);
```

This redirects unauthenticated users to `/login`. The `useQuery` also has `enabled: !!accessToken` which prevents the GET request from firing until the user is confirmed authenticated. (Note: GET `/categories` is public — the `enabled` guard here is about not making API calls while unauthenticated on this admin page, not about the server rejecting the request.)

**Fetching categories:**

```typescript
const { data: categories, isLoading, isError } = useQuery<Category[]>({
    queryKey: ['categories'],
    queryFn: async () => {
        const { data } = await api.get('/categories');
        return data;
    },
    enabled: !!accessToken,
});
```

The `queryKey: ['categories']` is a cache key. Every mutation's `onSuccess` calls `queryClient.invalidateQueries({ queryKey: ['categories'] })` which discards the cached response and triggers a fresh fetch. This is how the list automatically updates after a create, rename, or delete without manual state management.

**Create mutation:**

```typescript
const createMutation = useMutation({
    mutationFn: (data: CategoryFormData) =>
        api.post('/categories', {
            name: data.name,
            parentCategoryId: data.parentCategoryId || undefined,
            //                                       ^^^^^^^^^^^
            // The select returns "" for "None" — convert to undefined
            // so the DTO treats it as "no parent" rather than sending an empty string
        }),
    onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['categories'] });
        reset();   // clear the form
    },
});
```

The `data.parentCategoryId || undefined` conversion is important. HTML `<select>` elements always return a string — an empty string `""` when the "None" option is selected. If we sent `""` to the backend, class-validator would reject it as not a valid UUID. Converting to `undefined` causes the field to be omitted from the JSON body entirely, which `@IsOptional()` on the DTO silently ignores.

**Edit form component (`EditCategoryForm`):**

This is a separate component that receives the `category` object (pre-filled defaults) and the full `allCategories` list (to populate the parent dropdown):

```typescript
const eligibleParents = allCategories.filter(
    (c) => c.category_id !== category.category_id,
);
```

A category cannot be its own parent, so the current category is excluded from the dropdown options. The backend also enforces this (400), but filtering here prevents the user from even selecting it.

The update mutation sends `parentCategoryId: data.parentCategoryId || null`. When the user picks "None", the empty string becomes `null`, which the backend interprets as "clear the parent".

**Delete button component (`DeleteCategoryButton`):**

Uses the two-step inline confirmation pattern from the frontend conventions:

```typescript
const [confirmDelete, setConfirmDelete] = useState(false);

if (!confirmDelete) {
    return <Button variant="destructive" onClick={() => setConfirmDelete(true)}>Delete</Button>;
}
// second render: show warning + Confirm / Cancel
```

The component proactively warns the user when `category.children.length > 0`:

```tsx
{category.children.length > 0 && (
    <p className="text-sm text-destructive">
        Warning: this category has {category.children.length} subcategor
        {category.children.length > 1 ? 'ies' : 'y'}. Reassign or delete them first.
    </p>
)}
```

This warning appears even before the user clicks Confirm, so they know the request will fail. When they do confirm, the backend returns a 400 with the same message, and the mutation's `isError` state displays it.

---

### 1.4 Security & Design Notes

**Why permission-based rather than role-based?**  
The controller uses `@RequirePermission('create:categories')` instead of a hardcoded `SuperAdminGuard`. This keeps category management within the dynamic RBAC system: a Super Admin can grant `create:categories` to a new "Content Manager" role at runtime without touching code.

**Two-level limit:**  
The current implementation allows any category to be a child of any other. It does not prevent grandchildren (subcategory of a subcategory). The acceptance criteria only require "optional parent category," so two-level depth is the intended design. The self-parent guard only catches immediate cycles; deep cycles (A → B → A) are not guarded.

**Name uniqueness is global:**  
Category names are globally unique, not scoped to a parent. You cannot have two categories named "JavaScript" even if they are under different parents. This is enforced by `unique: true` on the column and a code-level check returning a friendly 409.

**`onDelete: 'RESTRICT'` as a double guard:**  
The service checks `children.length > 0` before calling `remove()`. If that check somehow passes (e.g. a race condition), the database FK constraint with `RESTRICT` will still reject the deletion. The user would see a 500 in that scenario — acceptable for an edge case that should never happen in practice.

---

### 1.5 The Full Flow

**Create a subcategory:**

```
Browser (admin)           NestJS                        PostgreSQL
     |                       |                               |
     |-- POST /categories --->|                               |
     |   { name, parentId }  |                               |
     |                  ValidationPipe                        |
     |                  (DTO validates)                       |
     |                  JwtAuthGuard ✓                        |
     |                  PermissionsGuard                      |
     |                  (checks create:categories in Redis/DB)|
     |                       |                               |
     |                  CategoriesService.create()            |
     |                       |--- SELECT * FROM categories -->|
     |                       |    WHERE name = ?              |
     |                       |<-- [] (no conflict) ----------|
     |                       |--- SELECT * FROM categories -->|
     |                       |    WHERE category_id = parentId|
     |                       |<-- { parent entity } ---------|
     |                       |--- INSERT INTO categories ---->|
     |                       |    (name, parent_category_id)  |
     |                       |<-- { saved category } ---------|
     |<-- 201 + category obj-|                               |
     |                       |                               |
```

**Delete a parent (blocked):**

```
Browser (admin)           NestJS                        PostgreSQL
     |                       |                               |
     |-- DELETE /categories/id->|                            |
     |                  JwtAuthGuard ✓                        |
     |                  PermissionsGuard ✓                    |
     |                       |                               |
     |                  CategoriesService.remove()            |
     |                       |--- SELECT * FROM categories -->|
     |                       |    WHERE id = ?, JOIN children |
     |                       |<-- { children: [WebDev] } ----|
     |                  children.length > 0                   |
     |                  → throw BadRequestException           |
     |<-- 400 "This category has 1 subcategory..." ----------|
```

---

## 2. US-12 — Create Course

> *As an Instructor, I want to create a new course with basic details so that I can begin building my course content.*

### Acceptance Criteria
- Instructor fills in title, description, price, thumbnail, language, level, and category
- Course is saved in Draft status by default
- Instructor can return and continue editing a draft

---

### 2.1 Theory — Course Lifecycle and the Status State Machine

A course on Betazoid goes through a defined sequence of states from the moment an instructor starts building it to the moment a student can enrol:

```
  ┌──────────────────────────────────────────────────────────┐
  │                    COURSE LIFECYCLE                       │
  │                                                           │
  │   Instructor                Admin/Moderator               │
  │       |                          |                        │
  │  [Creates course]           [Reviews course]              │
  │       ↓                          |                        │
  │    DRAFT ──[submits]──→ PENDING ─┤─[approves]──→ PUBLISHED│
  │       ↑                          │                        │
  │       └──────────────────[rejects, with reason]           │
  │                            REJECTED                       │
  └──────────────────────────────────────────────────────────┘
```

**Why enforce this with a status column rather than separate tables?**  
All four lifecycle stages are still the same conceptual object — a course. Using a single `status` column keeps the data model simple (one table, one query to load a course) while still encoding the lifecycle rules in the service layer. Separate tables would force JOINs everywhere and complicate cascade deletes.

**Why can't an instructor edit while Pending?**  
If the instructor could change the content after submission, the admin would be reviewing a moving target. The pending lock is a workflow constraint: once submitted, the course is frozen until the admin acts. This is enforced at two levels:
1. The service returns `403 Forbidden` if the instructor tries to PATCH a pending course
2. The frontend shows a read-only view instead of the edit form when `status === 'pending'`

**Why `as const` instead of TypeScript's `enum` keyword?**  

TypeScript's built-in `enum` keyword has a subtle incompatibility with TypeORM's schema sync: TypeORM calls `Object.values()` on the enum to build the `CHECK` constraint in PostgreSQL, but a TypeScript `enum` produces numeric indices by default (0, 1, 2…) when iterated. Even string enums can cause reflection issues in some setups.

The `as const` pattern avoids all of this:

```typescript
// ❌ TypeScript enum — risky with TypeORM
enum CourseStatus { DRAFT = 'draft', PENDING = 'pending' }
Object.values(CourseStatus) // → ['draft', 'pending'] but enum emits extra JS

// ✅ as const object — safe, tree-shakeable, zero runtime overhead
export const CourseStatus = { DRAFT: 'draft', PENDING: 'pending' } as const;
export type CourseStatus = (typeof CourseStatus)[keyof typeof CourseStatus];
// The type resolves to: 'draft' | 'pending'
```

The exported `type` is derived mechanically from the object. When you use `CourseStatus.DRAFT` in code, TypeScript knows the value is `'draft'` and can enforce it — but at runtime it is just a plain string, nothing special. `Object.values(CourseStatus)` reliably returns `['draft', 'pending', 'published', 'rejected']` for the TypeORM column definition.

**Why `decimal(10,2)` for price and not `float`?**  

`float` in most databases is a binary floating-point type. Binary floats cannot represent all decimal fractions exactly:

```
0.1 + 0.2 in binary float = 0.30000000000000004
```

For monetary values you must use `decimal` (also called `numeric`) — a base-10 fixed-point type that stores exact values. `precision: 10` means up to 10 significant digits total; `scale: 2` means exactly 2 digits after the decimal point. So the valid range is `0.00` to `99,999,999.99`.

One practical consequence: TypeORM returns `decimal` columns from PostgreSQL **as strings**, not numbers. The value `49.99` comes back as the string `"49.99"`. If you need to do arithmetic (display formatted price, compare totals), you must call `parseFloat(course.price)` first. This is why the edit page's `reset()` call uses `parseFloat(course.price)` when pre-filling the form.

---

### 2.2 Backend — Course CRUD

#### Routes

```
POST   /api/v1/courses          — create a new course (instructor only)
GET    /api/v1/courses          — list the authenticated instructor's courses
GET    /api/v1/courses/:id      — get one course (owner-only)
PATCH  /api/v1/courses/:id      — update a draft course (owner-only, blocked if pending)
```

All four routes require a valid JWT. There is no public read for courses at this stage — public browsing is added in US-15 (course search).

---

#### Entity — `course.entity.ts`

```typescript
export const CourseStatus = {
    DRAFT: 'draft',
    PENDING: 'pending',
    PUBLISHED: 'published',
    REJECTED: 'rejected',
} as const;
export type CourseStatus = (typeof CourseStatus)[keyof typeof CourseStatus];
// Derived type: 'draft' | 'pending' | 'published' | 'rejected'

export const CourseLevel = {
    BEGINNER: 'beginner',
    INTERMEDIATE: 'intermediate',
    ADVANCED: 'advanced',
} as const;
export type CourseLevel = (typeof CourseLevel)[keyof typeof CourseLevel];

@Entity('courses')
export class Course {
    @PrimaryGeneratedColumn('uuid')
    course_id!: string;

    @Column({ length: 200 })
    title!: string;

    @Column({ type: 'text' })          // text = unlimited length in Postgres
    description!: string;

    @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
    price!: number;                    // returned as string from DB — always parseFloat()

    @Column({ type: 'varchar', nullable: true })
    thumbnail_url!: string | null;     // nullable — three-part pattern (see typeorm.md)

    @Column({ length: 100 })
    language!: string;

    @Column({ type: 'enum', enum: Object.values(CourseLevel) })
    level!: CourseLevel;

    @Column({
        type: 'enum',
        enum: Object.values(CourseStatus),
        default: CourseStatus.DRAFT,   // DB column default = 'draft'
    })
    status!: CourseStatus;

    @ManyToOne(() => User, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'instructor_id' })
    instructor!: User;                 // deleting a user deletes all their courses

    @ManyToOne(() => Category, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'category_id' })
    category!: Category | null;        // deleting a category nullifies course.category_id
}
```

**Relation deletion strategies:**
- `instructor` uses `onDelete: 'CASCADE'` — a course with no instructor is meaningless; it should be removed with the user.
- `category` uses `onDelete: 'SET NULL'` — if a category is deleted, the course still exists; it just becomes uncategorised. Courses are valuable; categories are organisational metadata.

**Why are `enum` columns defined with `Object.values(CourseStatus)`?**  
TypeORM needs an array of the allowed string values to write the PostgreSQL `CHECK` constraint. Using `Object.values()` on the const object ensures the array always mirrors the TypeScript type — you cannot add a status to one without updating the other.

---

#### DTOs

**`create-course.dto.ts`** — all fields required except `thumbnail_url` and `categoryId`:

```typescript
export class CreateCourseDto {
    @IsString() @IsNotEmpty() @MaxLength(200)
    title!: string;

    @IsString() @IsNotEmpty()
    description!: string;              // no max length — text column is unlimited

    @IsNumber() @Min(0)
    price!: number;                    // 0 is valid (free courses)

    @IsString() @IsOptional()
    thumbnail_url?: string;            // URL-only for now; file upload deferred to S3

    @IsString() @IsNotEmpty() @MaxLength(100)
    language!: string;

    @IsEnum(CourseLevel)
    level!: CourseLevel;               // validates the string is one of the three values

    @IsUUID() @IsOptional()
    categoryId?: string;               // omit = no category
}
```

**`update-course.dto.ts`** — all fields `@IsOptional()`:  
Every field in a PATCH DTO should be optional because the caller sends only what changed. The service then checks each field for `!== undefined` before overwriting the entity — this is the standard NestJS partial-update pattern.

`status` is **not** in the update DTO. Instructors cannot directly set a course's status. Status transitions are controlled by dedicated endpoints in US-13 (submit for review) and US-14 (admin approve/reject).

---

#### Service — `courses.service.ts`

**`create(dto, instructorId)`**

```
1. If dto.categoryId is provided:
     → load Category from DB → 404 if not found
2. Build the Course entity:
     - all fields from dto
     - status: CourseStatus.DRAFT  (hardcoded — instructor cannot override this)
     - instructor: { user_id: instructorId }  (partial entity reference)
     - category: loaded entity or null
3. Save and return
```

The instructor is set as a partial entity reference `{ user_id: instructorId } as any`. TypeORM understands this pattern: when saving, it sees a ManyToOne relation with a `user_id` value and writes that UUID into the `instructor_id` column. This avoids a database round-trip to load the full User object just to write a FK value.

**`findOne(courseId, instructorId)`**

```typescript
async findOne(courseId: string, instructorId: string): Promise<Course> {
    // Step 1: Does the course exist at all?
    const exists = await this.courseRepo.exists({ where: { course_id: courseId } });
    if (!exists) throw new NotFoundException('Course not found');

    // Step 2: Does this instructor own it?
    const course = await this.courseRepo.findOne({
        where: { course_id: courseId, instructor: { user_id: instructorId } },
        relations: ['category'],
    });
    if (!course) throw new ForbiddenException('Access denied');

    return course;
}
```

This two-step pattern is deliberate. Without step 1, the API would return `403 Access denied` even when the course simply does not exist — which leaks information (the caller learns that a resource *exists* but is owned by someone else). With the split, the caller receives:
- `404` → course does not exist
- `403` → course exists but you do not own it
- `200` → course found and you own it

Notice that `findOne` only loads `relations: ['category']`, not `relations: ['instructor']`. Loading the instructor relation would return the full `User` object including `password_hash`, `refresh_token_hash`, and other sensitive columns in the response. Ownership is verified by querying with the instructor's ID in the `WHERE` clause — we never need to send the instructor object to the caller.

**`update(courseId, dto, instructorId)`**

```
1. Call findOne() — handles 404 and 403 in one place
2. If course.status === PENDING → throw 403 (frozen for review)
3. Category update (three-way logic):
     - dto.categoryId is undefined → skip (field not sent in request)
     - dto.categoryId is null      → course.category = null (remove category)
     - dto.categoryId is a UUID    → load and assign new category
4. For every other field: if not undefined, overwrite course property
5. Save and return
```

The category uses the same three-way `undefined` / `null` / UUID pattern from US-11's `UpdateCategoryDto`. The key is checking `dto.categoryId !== undefined` — not `!dto.categoryId` — because `null` is a valid intentional value that must not be treated as "omitted".

---

#### Controller — `courses.controller.ts`

```typescript
@Controller('courses')
@UseGuards(JwtAuthGuard)           // applied to the whole class — every route is protected
export class CoursesController {

    @Post()
    @HttpCode(HttpStatus.CREATED)  // 201, not 200
    create(@Body() dto: CreateCourseDto, @Request() req: any) {
        return this.coursesService.create(dto, req.user.userId);
        //                                       ^^^^^^^^^^^^
        // JWT strategy's validate() returns { userId, email }
        // req.user is that object, not a DB entity
    }

    @Get()
    findMyCourses(@Request() req: any) {
        return this.coursesService.findByInstructor(req.user.userId);
    }

    @Get(':id')
    findOne(@Param('id') id: string, @Request() req: any) {
        return this.coursesService.findOne(id, req.user.userId);
    }

    @Patch(':id')
    update(@Param('id') id: string, @Body() dto: UpdateCourseDto, @Request() req: any) {
        return this.coursesService.update(id, dto, req.user.userId);
    }
}
```

The `@UseGuards(JwtAuthGuard)` is placed at the **class level** (above `@Controller`), which applies it to all four routes at once. This is neater than repeating it on each method.

Why is there no `@RequirePermission()` decorator here? This feature is instructor-specific but not RBAC-gated in the same way admin operations are. Any authenticated user can create a course. The "who is allowed to do this" check is implicit: the service scopes all operations to the requesting user's own courses via `instructorId`. A student calling `GET /courses` would receive an empty array (no courses owned by that user ID) rather than a 403.

---

### 2.3 Frontend — Three Pages

The course feature spans three pages:

| Page | Route | Responsibility |
|---|---|---|
| `courses/page.tsx` | `/courses` | List the instructor's courses; link to create/edit |
| `courses/create/page.tsx` | `/courses/create` | Form to create a new course |
| `courses/[id]/edit/page.tsx` | `/courses/:id/edit` | Pre-populated form to edit a draft; read-only view when pending |

---

#### The List Page (`/courses`)

```typescript
const { data: courses, isLoading, isError } = useQuery<Course[]>({
    queryKey: ['my-courses'],       // separate key from ['categories'] used elsewhere
    queryFn: async () => {
        const { data } = await api.get('/courses');
        return data;                // backend scopes this to req.user.userId
    },
    enabled: !!accessToken,
});
```

The backend's `GET /courses` returns only the authenticated user's courses, so there is no need for a URL parameter like `/courses?instructor=me`. The auth token itself identifies the requester.

The Edit button is conditionally rendered:
```typescript
{course.status === 'draft' && (
    <Button variant="outline" size="sm" asChild>
        <Link href={`/courses/${course.course_id}/edit`}>Edit</Link>
    </Button>
)}
```

A `pending`, `published`, or `rejected` course does not show an Edit button in the list. The backend also enforces this (403 on PATCH), so this is a UX shortcut, not a security boundary.

---

#### The Create Page (`/courses/create`)

**Form schema:**

```typescript
const courseSchema = z.object({
    title: z.string().min(1, 'Title is required').max(200),
    description: z.string().min(1, 'Description is required'),
    price: z.number().min(0, 'Price must be 0 or more'),
    //      ^^^^^^^^ NOT z.coerce.number()
    thumbnail_url: z.string().optional(),
    language: z.string().min(1, 'Language is required').max(100),
    level: z.enum(['beginner', 'intermediate', 'advanced'] as const),
    categoryId: z.string().optional(),
});
```

**Why `z.number()` and not `z.coerce.number()`?**  
`z.coerce.number()` in Zod v4 creates an internal pipeline type whose TypeScript output is typed as `unknown`, which causes `@hookform/resolvers/zod` to fail type-checking. The fix is to use `z.number()` (which declares the input type as `number`) and tell react-hook-form to parse the raw HTML input string to a JS number before passing it to Zod:

```typescript
<Input
    type="number"
    step="0.01"
    min="0"
    {...register('price', { valueAsNumber: true })}
    //                     ^^^^^^^^^^^^^^^^^^^^
    // react-hook-form calls parseFloat() on the raw input value
    // the result is a number, which matches z.number()
/>
```

`valueAsNumber: true` is a `RegisterOptions` flag from react-hook-form that wraps the HTML input's `valueAsNumber` property. If the field is empty, it produces `NaN`, which `z.number().min(0)` rejects with a validation error.

**On success, redirect to the edit page:**

```typescript
const mutation = useMutation({
    mutationFn: (data: CourseFormData) => api.post('/courses', { ... }),
    onSuccess: (res) => {
        router.push(`/courses/${res.data.course_id}/edit`);
        //                       ^^^^^^^^^^^^^^^^^^^
        // The created course's ID comes back in the response body
    },
});
```

After creation, the instructor lands on the edit page for the new course. This satisfies AC-3 ("can return and continue editing") immediately — the instructor is already on the edit page and can keep building.

---

#### The Edit Page (`/courses/[id]/edit`)

**Pre-populating a form with server data:**

react-hook-form initialises its state once when `useForm()` is called — before the async query resolves. Passing `defaultValues` to `useForm()` only works if the data is available at mount time. When data is fetched asynchronously, you must call `reset()` once the data arrives:

```typescript
const { reset } = useForm<CourseFormData>({ resolver: zodResolver(courseSchema) });

useEffect(() => {
    if (course) {
        reset({
            title: course.title,
            description: course.description,
            price: parseFloat(course.price), // ← string → number (decimal column)
            thumbnail_url: course.thumbnail_url ?? '',
            language: course.language,
            level: course.level,
            categoryId: course.category?.category_id ?? '',
        });
    }
}, [course, reset]);
```

`reset()` replaces all form field values at once. The `useEffect` dependency `[course, reset]` means this runs whenever the `course` query result changes — including the first time data arrives.

**The pending lock (frontend):**

```typescript
if (course?.status === 'pending') {
    return (
        <Card>
            <CardTitle>{course.title}</CardTitle>
            <CardContent>
                <p className="text-sm text-muted-foreground">
                    This course is currently under review and cannot be edited.
                </p>
                <Button variant="outline" asChild>
                    <Link href="/courses">Back to My Courses</Link>
                </Button>
            </CardContent>
        </Card>
    );
}
```

The component renders a read-only message instead of the form when status is `pending`. This check happens after the data loads (the form would briefly flash otherwise). The backend also returns 403, so even if an instructor crafts a PATCH request manually, they are blocked at the API level.

---

### 2.4 Security & Design Notes

**Thumbnail: URL-only for now**  
`thumbnail_url` stores a URL string rather than a file path. S3/Cloudflare R2 integration is introduced in Sprint 3 per CLAUDE.md, but since US-12 is the first story in that sprint, deferring file upload to a later sub-task keeps this story self-contained. The column exists and works; the upload UI is the deferred part.

**Free courses (`price = 0.00`)**  
`price` is `NOT NULL` with `default: 0`. A price of `0.00` is a valid free course. The open question in CLAUDE.md (whether free courses need a separate enrollment path) is relevant to the orders/enrollment module in Sprint 7, not here. For now, the price field is just stored.

**No RBAC guard on course endpoints — is that right?**  
Yes, intentionally. The course endpoints are scoped to the owner's user ID, not to a role. Any authenticated user can call `POST /courses`. If the platform later needs to restrict course creation to users who have been approved as instructors, a dedicated `create:courses` permission can be added to the RBAC system — and a `@RequirePermission('create:courses')` decorator added to the controller — without changing any service logic.

**Sensitive data never leaves the backend**  
`GET /courses/:id` loads `relations: ['category']` but deliberately omits `relations: ['instructor']`. Loading the instructor relation would attach the full `User` object (including `password_hash`, `refresh_token_hash`) to the response. Ownership is checked in the SQL `WHERE` clause instead:
```
WHERE course_id = ? AND instructor.user_id = ?
```
If the row is found, ownership is confirmed. If not found, the caller is forbidden. The instructor object is never serialised.

---

### 2.5 The Full Flow

**Create a course:**

```
Browser (instructor)      NestJS                         PostgreSQL
        |                    |                                |
        |-- POST /courses -->|                                |
        |  { title, price,  |                                |
        |    level, ... }   |                                |
        |              ValidationPipe                         |
        |              (DTO validates all fields)             |
        |              JwtAuthGuard ✓                         |
        |              (extracts userId from JWT)             |
        |                    |                                |
        |              CoursesService.create()               |
        |                    |--- SELECT FROM categories ---->|
        |                    |    WHERE category_id = ?       |
        |                    |<-- { category entity } --------|
        |                    |--- INSERT INTO courses -------->|
        |                    |    (title, price, level,        |
        |                    |     status='draft',             |
        |                    |     instructor_id=userId,       |
        |                    |     category_id=categoryId)     |
        |                    |<-- { saved course } ------------|
        |<-- 201 + course ---|                                |
        |    { course_id,    |                                |
        |      status:'draft'|                                |
        |      ... }         |                                |
```

**Edit a pending course (blocked):**

```
Browser (instructor)      NestJS                         PostgreSQL
        |                    |                                |
        |-- PATCH /courses/id->|                              |
        |  { title: '...' } |                                |
        |              JwtAuthGuard ✓                         |
        |                    |                                |
        |              CoursesService.update()               |
        |                    |--- SELECT EXISTS courses ----->|
        |                    |    WHERE course_id = id        |
        |                    |<-- true ----------------------|
        |                    |--- SELECT FROM courses ------->|
        |                    |    WHERE id = ? AND            |
        |                    |      instructor_id = userId    |
        |                    |<-- { course, status:'pending'}|
        |              course.status === PENDING              |
        |              → throw ForbiddenException             |
        |<-- 403 "Course cannot be edited while pending" -----|
```

---

## 3. US-13 — Submit Course for Review

> *As an Instructor, I want to submit my course for review so that it can be published on the platform.*

### Acceptance Criteria
- Course status changes from Draft to Pending on submission
- Admin/Moderator receives a notification of the pending course
- Instructor cannot edit the course while it is Pending

---

### 3.1 Theory — State Machines and Guarded Transitions

A **state machine** is a model where an object can be in exactly one of a finite set of states, and only certain transitions between states are allowed. You encountered the concept in US-12 when the course lifecycle was introduced:

```
DRAFT ──[submit]──→ PENDING ──[approve]──→ PUBLISHED
                       │
                    [reject]
                       ↓
                   REJECTED ──[re-submit]──→ PENDING
```

Each arrow is a *transition*. Not every transition is legal. An instructor cannot move a course directly from `DRAFT` to `PUBLISHED` — they must go through `PENDING` so the admin has a chance to review. A course that is already `PENDING` cannot be submitted again.

**Why implement this in the service layer, not the database?**

The database stores the current state (`status` column) and enforces valid enum values via a `CHECK` constraint. But the *transition rules* — which states can move to which — belong in the service layer because they require business context: Who is requesting the transition? What is the current state? Should an email be sent?

The rule in `submitForReview` is:

```
allowed source states: DRAFT, REJECTED
target state:          PENDING
everything else:       → 400 BadRequestException
```

This single guard enforces the state machine at the API boundary. No matter how many times a client calls `POST /courses/:id/submit`, the course can only reach `PENDING` from valid source states.

---

**Why fire-and-forget for the email notification?**

A transactional write (status → PENDING) and a network call (SMTP email) should not be coupled together in a way where either can block or fail the other.

Consider the alternative:

```
// ❌ Coupled — email failure rolls back the status update
await this.courseRepo.save(course);    // status = PENDING in DB
await this.mailService.send(...);      // SMTP server is down → throws
// → the whole request fails with 500, but DB was already written!
// Now status is PENDING in the DB but the request returned an error.
```

That is even worse than no email: the database and the API response are now inconsistent. The instructor will think submission failed and try again, but the course is already `PENDING`.

The correct model is:

```
// ✅ Decoupled — email failure does not affect the HTTP response
await this.courseRepo.save(course);       // status = PENDING in DB ← commit this first
const saved = course;                     // capture the saved result

// fire and forget — start the promise, do not await it
this.mailService.send(...).catch(() => {}); // silent failure: log in prod, ignore here
return saved;                             // respond immediately with the updated course
```

The `.catch(() => {})` suppresses any unhandled promise rejection (which would crash the Node.js process in some configurations). In production you would log the failure to a monitoring service instead of discarding it. For now, a silent catch is appropriate.

**Why not use BullMQ for the email?**

BullMQ is introduced in Sprint 5 for the YouTube playlist grant/revoke, which has a 60-second SLA. Email delivery has no SLA in this user story — the admin just needs to eventually receive a notification. A fire-and-forget call to the existing Nodemailer transporter is simpler and sufficient. BullMQ adds Redis dependency and job queue overhead that is not justified here.

---

### 3.2 Backend — The Submit Endpoint

#### Route

```
POST /api/v1/courses/:id/submit
Authorization: Bearer <access_token>
Body: (empty — no request body needed)

Success → 200 OK + updated Course object (status: "pending")
Errors:
  404 → course not found
  403 → course belongs to a different instructor
  400 → course is not in a submittable state (already pending or published)
```

The endpoint uses `POST` (not `PATCH`) because it triggers a state transition, not a field update. Using an action-based URL (`/submit`) is a common REST pattern for operations that don't fit neatly into CRUD. `@HttpCode(HttpStatus.OK)` is set explicitly because NestJS defaults `POST` handlers to `201 Created` — but this is not creating a resource, it is performing an action on an existing one.

---

#### Service — `submitForReview(courseId, instructorId)`

```typescript
async submitForReview(courseId: string, instructorId: string): Promise<Course> {
    // Step 1: ownership check (reuses findOne which handles 404 + 403)
    const course = await this.findOne(courseId, instructorId);

    // Step 2: guard the transition — only DRAFT or REJECTED can move to PENDING
    if (course.status !== CourseStatus.DRAFT && course.status !== CourseStatus.REJECTED) {
        throw new BadRequestException(
            'Only draft or rejected courses can be submitted for review',
        );
    }

    // Step 3: perform the transition and persist
    course.status = CourseStatus.PENDING;
    const saved = await this.courseRepo.save(course);

    // Step 4: fire-and-forget admin email
    const adminEmail = this.config.get<string>('ADMIN_EMAIL');
    if (adminEmail) {
        // separate query to load the instructor name without exposing it in the
        // main findOne result (which deliberately omits the instructor relation)
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
            .catch(() => {});   // swallow email errors — not a reason to fail the request
    }

    return saved;
}
```

**Why a separate query to get the instructor name?**

The `findOne()` helper deliberately omits `relations: ['instructor']` to avoid serialising the instructor's `password_hash` and `refresh_token_hash` in the API response (see US-12 Security Notes). But the email needs the instructor's `full_name` for a human-readable notification. Rather than changing `findOne()` and potentially leaking sensitive data, we do a second query scoped only to what we need: the instructor's name. This query is inside the fire-and-forget block, so its latency does not affect the HTTP response time.

**Why support `REJECTED` as a valid source state?**

US-14 (Approve or Reject) states: "Instructor can edit and resubmit a rejected course." A rejected course that has been edited is still `REJECTED` in the database — editing does not auto-reset the status. To resubmit, the instructor calls this same `POST /courses/:id/submit` endpoint. Handling both `DRAFT` and `REJECTED` here avoids needing a separate "resubmit" endpoint later.

**Why is `ADMIN_EMAIL` a config var rather than a DB query?**

Looking up all admin users from the database on every course submission would require joining `users → user_roles → roles → role_permissions → permissions` to find users with the right role. That is complex for a notification that does not need to be real-time. A single configurable email address (which could point to a shared inbox or a distribution list) is the simplest solution that satisfies the acceptance criteria. Per CLAUDE.md: "Email via Nodemailer/SendGrid is already in the stack — plan to use it."

---

#### Mail Service — `sendCourseSubmittedNotification()`

```typescript
async sendCourseSubmittedNotification(
    adminEmail: string,
    instructorName: string,
    courseTitle: string,
    courseId: string,
): Promise<void> {
    await this.transporter.sendMail({
        from: this.config.get('MAIL_FROM'),
        to: adminEmail,
        subject: `Course submitted for review: ${courseTitle}`,
        html: `
<h2>New course pending review</h2>
<p><strong>Course:</strong> ${courseTitle}</p>
<p><strong>Instructor:</strong> ${instructorName}</p>
<p><strong>Course ID:</strong> ${courseId}</p>
<p>Please log in to review and approve or reject this course.</p>`,
    });
}
```

The method signature takes primitive values (`string`) rather than entity objects. This keeps `MailService` decoupled from domain entities — it is a pure communication utility that does not need to know what a `Course` or `User` looks like. The caller (`CoursesService`) is responsible for extracting the strings it needs.

---

#### Controller — `courses.controller.ts`

```typescript
@Post(':id/submit')
@HttpCode(HttpStatus.OK)
submit(@Param('id') id: string, @Request() req: any) {
    return this.coursesService.submitForReview(id, req.user.userId);
}
```

The route `:id/submit` sits under the same `@Controller('courses')` prefix, so the full path is `POST /api/v1/courses/:id/submit`. The class-level `@UseGuards(JwtAuthGuard)` covers this method automatically — no per-method guard needed.

---

#### Module — `courses.module.ts`

```typescript
@Module({
    imports: [TypeOrmModule.forFeature([Course, Category]), MailModule],
    //                                                       ^^^^^^^^^
    //  MailModule exports MailService, making it injectable in CoursesService
    controllers: [CoursesController],
    providers: [CoursesService],
    exports: [CoursesService],
})
export class CoursesModule {}
```

`MailModule` must be listed in `imports` so that `MailService` (which `MailModule` exports) is available for injection into `CoursesService`. Without this import, NestJS would throw a dependency resolution error at startup: `Nest can't resolve dependencies of CoursesService (?). Please make sure that the argument MailService at index [2] is available in the CoursesModule context`.

`ConfigService` does **not** need to be added to `imports` here because `ConfigModule.forRoot({ isGlobal: true })` in `AppModule` registers `ConfigService` in the global DI container — it is available everywhere without a local import.

---

### 3.3 Frontend — Submit for Review on the Edit Page

US-13 does not need a new page. The edit page (`/courses/[id]/edit`) already handles the `pending` state with a read-only view. US-13 adds a "Submit for Review" section at the bottom of the edit form — the action that moves the course from `DRAFT` (editable) into `PENDING` (read-only).

**The new mutation:**

```typescript
const submitMutation = useMutation({
    mutationFn: () => api.post(`/courses/${courseId}/submit`),
    //                         no request body — the endpoint needs only the ID in the URL
    onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['my-courses'] });
        queryClient.invalidateQueries({ queryKey: ['course', courseId] });
        //                                          ^^^^^^^^^^^^^^^^
        // invalidating both cache keys forces:
        // 1. the course list page to re-fetch (status badge updates)
        // 2. this page to re-fetch — the course query returns status:'pending'
        //    which triggers the read-only view to render automatically
        setConfirmSubmit(false);
    },
});
```

After `onSuccess` invalidates the `['course', courseId]` query, TanStack Query re-fetches the course. The response now has `status: 'pending'`. The edit page checks this at render time:

```typescript
if (course?.status === 'pending') {
    return ( /* read-only view */ );
}
```

So the transition from "editable form" to "locked read-only view" happens entirely through the cache invalidation → re-fetch → re-render cycle. No manual state manipulation needed.

**Two-step confirmation UI:**

Submitting for review is irreversible from the instructor's perspective (they cannot cancel it once submitted — only the admin can reject it). The two-step confirmation pattern from the frontend conventions communicates this weight without a full modal:

```typescript
const [confirmSubmit, setConfirmSubmit] = useState(false);

// First click — show the confirmation panel
{!confirmSubmit ? (
    <Button variant="outline" onClick={() => setConfirmSubmit(true)}>
        Submit for Review
    </Button>
) : (
    // Second step — warning + Confirm / Cancel
    <div className="space-y-2">
        <p className="text-sm text-destructive">
            Once submitted you cannot edit this course until the review is complete. Continue?
        </p>
        {submitMutation.isError && (
            <p className="text-sm text-destructive">
                {(submitMutation.error as any)?.response?.data?.message ?? 'Failed to submit course.'}
            </p>
        )}
        <div className="flex gap-2">
            <Button
                disabled={submitMutation.isPending}
                onClick={() => submitMutation.mutate()}
            >
                {submitMutation.isPending ? 'Submitting...' : 'Confirm Submit'}
            </Button>
            <Button variant="outline" onClick={() => setConfirmSubmit(false)}>
                Cancel
            </Button>
        </div>
    </div>
)}
```

`confirmSubmit` is a `useState` boolean local to this component. Clicking "Submit for Review" sets it to `true`, revealing the confirmation panel. Clicking "Cancel" sets it back to `false`. Clicking "Confirm Submit" fires the mutation. If the mutation fails (e.g. course was already submitted in another browser tab), the error message from `submitMutation.error.response.data.message` is displayed inline.

`submitMutation.mutate()` is called with no argument because `mutationFn` takes no parameters — the course ID is already in scope from the `useParams()` hook at the top of the component.

---

### 3.4 Unit Tests — `courses.service.spec.ts`

The unit tests mock all external dependencies (database repository, `MailService`, `ConfigService`) using Jest's factory pattern. This means tests run without a database connection and without sending real emails.

**Mocking pattern:**

```typescript
const mockCourseRepo = () => ({
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    exists: jest.fn(),
});
```

Each mock factory returns a fresh object with `jest.fn()` on every method. By registering these via `useFactory` in the test module, NestJS's DI container injects the mock wherever the real implementation would go:

```typescript
{ provide: getRepositoryToken(Course), useFactory: mockCourseRepo },
{ provide: MailService,               useFactory: mockMailService  },
{ provide: ConfigService,             useFactory: mockConfigService},
```

`getRepositoryToken(Course)` returns the DI token that `@InjectRepository(Course)` registers — this is how you mock TypeORM repositories in NestJS tests without instantiating a real DB connection.

**Key test cases and what they assert:**

| Test | `courseRepo.findOne` mock returns | Expected outcome |
|---|---|---|
| DRAFT → PENDING happy path | `{ status: 'draft' }` | `result.status === 'pending'`; `save()` called with PENDING |
| REJECTED → PENDING | `{ status: 'rejected' }` | `result.status === 'pending'` |
| Email sent | `{ status: 'draft' }` + ADMIN_EMAIL configured | `mailService.sendCourseSubmittedNotification` called once |
| Email skipped | ADMIN_EMAIL = `undefined` | `mailService.sendCourseSubmittedNotification` NOT called |
| Already PENDING | `{ status: 'pending' }` | `BadRequestException` thrown |
| Already PUBLISHED | `{ status: 'published' }` | `BadRequestException` thrown |
| Course not found | `exists()` returns `false` | `NotFoundException` thrown |
| Wrong instructor | `exists()` returns `true`, `findOne()` returns `null` | `ForbiddenException` thrown |

**The `process.nextTick` trick for fire-and-forget:**

```typescript
await service.submitForReview('course-uuid-1', 'instructor-uuid-1');

// The fire-and-forget promise resolves in the next microtask cycle.
// Awaiting process.nextTick lets it settle before the assertion runs.
await new Promise(process.nextTick);

expect(mailService.sendCourseSubmittedNotification).toHaveBeenCalledWith(...);
```

The email call is fire-and-forget (not `await`-ed in the service). The assertion runs synchronously after `submitForReview` returns — at that point the mail promise may not have been called yet. `await new Promise(process.nextTick)` yields control for one microtask cycle, giving the `.catch(() => {})` chain time to execute and the mock to record the call.

---

### 3.5 Security & Design Notes

**The pending lock is enforced at two layers:**

| Layer | Mechanism | What it catches |
|---|---|---|
| Frontend | `course?.status === 'pending'` → render read-only view | Normal user — they can't even see the form |
| Backend (`update()`) | `if (course.status === PENDING) throw ForbiddenException` | API client that bypasses the UI |

The frontend lock is a UX convenience. The backend lock is the security boundary. Any direct API call (curl, Postman, malicious script) to `PATCH /courses/:id` while the course is pending will receive a `403`.

**ADMIN_EMAIL is a single address — intentional trade-off:**

Querying the database for all users with admin permissions on every submission would require a multi-table join across `users → user_roles → roles → role_permissions → permissions`. That complexity is not justified for a notification. Using a single `ADMIN_EMAIL` env var means the email can point to a shared inbox (e.g. `review@betazoid.com`) that multiple admins monitor. This is the pragmatic choice for an early-stage platform.

**What about `PUBLISHED` courses that are re-submitted?**

An instructor cannot submit a `PUBLISHED` course (the guard blocks it with a `400`). If the platform ever needs instructors to update published courses, a separate workflow (e.g. `POST /courses/:id/update-request`) would be needed — submitting again would reset a published course to pending, which would break student access. That is a future design problem, not a current one.

---

### 3.6 The Full Flow

**Successful submission:**

```
Browser (instructor)       NestJS                         PostgreSQL         Mailtrap (SMTP)
        |                     |                               |                    |
        |-- POST              |                               |                    |
        |   /courses/id/submit|                               |                    |
        |   (no body)         |                               |                    |
        |              ValidationPipe (no body)               |                    |
        |              JwtAuthGuard ✓                         |                    |
        |                     |                               |                    |
        |              CoursesService.submitForReview()       |                    |
        |                     |                               |                    |
        |                     |--- SELECT EXISTS courses ---->|                    |
        |                     |    WHERE course_id = id       |                    |
        |                     |<-- true ---------------------|                    |
        |                     |                               |                    |
        |                     |--- SELECT FROM courses ------>|                    |
        |                     |    WHERE id = ? AND           |                    |
        |                     |      instructor_id = userId   |                    |
        |                     |<-- { status: 'draft' } -------|                    |
        |                     |                               |                    |
        |              status === DRAFT ✓ (valid source)      |                    |
        |              course.status = 'pending'              |                    |
        |                     |                               |                    |
        |                     |--- UPDATE courses ----------->|                    |
        |                     |    SET status='pending'       |                    |
        |                     |    WHERE course_id = id       |                    |
        |                     |<-- { status: 'pending' } -----|                    |
        |                     |                               |                    |
        |<-- 200 + course ----|                               |                    |
        |    { status:        |                               |                    |
        |      'pending' }    |  (fire-and-forget starts)     |                    |
        |                     |--- SELECT FROM courses ------>|                    |
        |                     |    JOIN instructor            |                    |
        |                     |<-- { full_name:'Jane Doe' }--|                    |
        |                     |                               |                    |
        |                     |------- SMTP sendMail -------------------------------->|
        |                     |        subject: "Course submitted for review: ..."    |
        |                     |        to: admin@betazoid.com                         |
        |                     |<------ 250 OK ----------------------------------------|
```

**Already-pending course (blocked):**

```
Browser (instructor)       NestJS                         PostgreSQL
        |                     |                               |
        |-- POST              |                               |
        |   /courses/id/submit|                               |
        |              JwtAuthGuard ✓                         |
        |                     |--- SELECT EXISTS + SELECT --> |
        |                     |<-- { status: 'pending' } ----|
        |              status !== DRAFT and !== REJECTED      |
        |              → throw BadRequestException            |
        |<-- 400 "Only draft or rejected courses can be submitted for review"
```
