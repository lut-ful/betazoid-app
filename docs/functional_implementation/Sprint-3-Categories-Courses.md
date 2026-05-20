# Sprint 3 — Categories & Courses

**User Stories:** US-11 · US-12 · US-13 · US-14 · US-15
**Sprint Duration:** 2 weeks
**Backend module(s):** `categories`, `courses`
**Frontend pages:** `/admin/categories`, `/courses`, `/admin/courses`

---

## Table of Contents

1. [US-11 — Category Management](#1-us-11--category-management)

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
