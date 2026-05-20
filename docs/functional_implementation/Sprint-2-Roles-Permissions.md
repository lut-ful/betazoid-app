# Sprint 2 — Role & Permission Management

**User Stories:** US-06 · US-07 · US-08 · US-09 · US-10
**Sprint Duration:** 2 weeks
**Backend module(s):** `roles`, `permissions`
**Frontend pages:** `/admin/roles`, `/admin/roles/[id]/permissions`, `/admin/users`

---

## Table of Contents

1. [US-06 — Create Role](#1-us-06--create-role)
2. [US-07 — Assign Permissions to Role](#2-us-07--assign-permissions-to-role)
3. [US-08 — Assign Role to User](#3-us-08--assign-role-to-user)

---

## 1. US-06 — Create Role

> *As a Super Admin, I want to create a new role so that I can define custom access levels for platform staff.*

### Acceptance Criteria
- Role requires a unique name and optional description
- Created role appears in the roles list immediately

---

### 1.1 Theory — Role-Based Access Control (RBAC)

Before any code makes sense, you need to understand *why* a role system exists and how it is structured.

#### What problem does RBAC solve?

Without RBAC, you might protect an endpoint with a simple flag on the user:

```
users table
-----------
user_id | email | is_admin
```

This works for two user types. But Betazoid has at least four: **Student**, **Instructor**, **Moderator**, **Super Admin**. As soon as you have three you start writing `is_admin || is_moderator` conditions everywhere, and you can never add a new role without a code change.

**RBAC moves the access rules out of code and into the database.** The question "can this user do X?" is answered by a query, not an `if` statement.

#### The three-table model

Betazoid uses **dynamic RBAC** — the full design across Sprint 2 involves three layers:

```
users          user_roles         roles         role_permissions     permissions
+----------+   +------------+   +---------+   +----------------+   +------------------+
| user_id  |──<| user_id    |   | role_id |──<| role_id        |   | permission_id    |
| email    |   | role_id    |>──| name    |   | permission_id  |>──| name             |
| ...      |   +------------+   | desc    |   +----------------+   | (create:courses) |
+----------+                    +---------+                         +------------------+
```

- A **user** can hold many **roles** (student AND instructor simultaneously)
- A **role** holds many **permissions** (actions the role is allowed to take)
- A **permission** is a string like `create:courses` or `delete:users`

**US-06 builds the foundation:** the `roles` table and the `user_roles` junction table.
US-07 adds permissions. US-08 assigns roles to users. US-10 enforces them on every request.

#### Why a junction table instead of a column?

You might be tempted to add a `role` column to `users`:

```
users.role = 'admin'
```

That only allows one role per user. Junction tables allow many-to-many relationships — a user can hold multiple roles simultaneously without any schema change.

```
user_roles
+--------------+---------------------+
| user_id      | role_id             |
+--------------+---------------------+
| user-abc     | role-superadmin     |   ← one row per role the user holds
| user-abc     | role-instructor     |   ← same user, second role
+--------------+---------------------+
```

#### Authentication vs. Authorisation

These two words are often confused. Keep them distinct:

| Concept | Question | Mechanism in Betazoid |
|---|---|---|
| **Authentication** | *Who are you?* | JWT access token (`JwtAuthGuard`) |
| **Authorisation** | *What are you allowed to do?* | Role/permission check (`SuperAdminGuard`, later `RbacGuard`) |

Authentication always runs first. If you are not authenticated, there is no point checking what you are allowed to do.

```
Request arrives
      │
      ▼
JwtAuthGuard ──── no valid token ──────► 401 Unauthorized
      │
      │ valid token → request.user = { userId, email }
      ▼
SuperAdminGuard ── no Super Admin role ─► 403 Forbidden
      │
      │ is Super Admin
      ▼
Route handler executes
```

---

### 1.2 Backend — Creating and listing roles

#### Endpoints

```
POST /api/v1/roles                    Create a new role
Headers: Authorization: Bearer <token>
Body:   { "name": "Moderator", "description": "Reviews courses" }

Response 201:
{
  "role_id": "uuid",
  "name": "Moderator",
  "description": "Reviews courses",
  "created_at": "...",
  "updated_at": "..."
}

Response 409: { "message": "A role with this name already exists" }
Response 401: not authenticated
Response 403: authenticated but not Super Admin

---

GET /api/v1/roles                     List all roles
Headers: Authorization: Bearer <token>

Response 200: [ { role_id, name, description, created_at, updated_at }, ... ]
```

#### The Role entity — `role.entity.ts`

```typescript
@Entity('roles')
export class Role {
    @PrimaryGeneratedColumn('uuid')
    role_id!: string;
    // UUID prevents resource enumeration — attackers can't guess role IDs

    @Column({ unique: true, length: 100 })
    name!: string;
    // unique: true adds a DB-level UNIQUE constraint — even if two requests
    // race to create the same name, the database will reject one of them

    @Column({ type: 'text', nullable: true })
    description!: string | null;
    // nullable column: must have nullable:true in decorator + explicit type
    // + | null in TypeScript type (see TypeORM conventions)

    @OneToMany(() => UserRole, (ur) => ur.role)
    userRoles!: UserRole[];
    // inverse side of the relation — TypeORM convention requires both sides

    @CreateDateColumn()
    created_at!: Date;

    @UpdateDateColumn()
    updated_at!: Date;
}
```

#### The UserRole junction entity — `user-role.entity.ts`

This table records which user holds which role. Each row is one assignment:

```typescript
@Entity('user_roles')
export class UserRole {
    @PrimaryGeneratedColumn('uuid')
    user_role_id!: string;

    @ManyToOne(() => User, (user) => user.userRoles, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'user_id' })
    user!: User;
    // onDelete: 'CASCADE' — if the user is deleted, their role assignments
    // are automatically deleted too. No orphan rows.

    @ManyToOne(() => Role, (role) => role.userRoles, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'role_id' })
    role!: Role;
    // same cascade logic — if a role is deleted, all its user assignments go too

    @CreateDateColumn()
    created_at!: Date;
}
```

Why does `UserRole` exist now, in US-06, if users are not assigned roles until US-08?
Because the **`SuperAdminGuard`** needs to query it. To check "is this user a Super Admin?", the guard looks up a row in `user_roles`. The table must exist for the guard to work. US-08 will add the endpoint to insert rows into it.

#### The DTO — `create-role.dto.ts`

```typescript
export class CreateRoleDto {
    @IsString()
    @IsNotEmpty()       // rejects empty string ""
    @MaxLength(100)     // mirrors the DB column length limit
    name!: string;

    @IsOptional()       // PATCH-style: the field may be absent entirely
    @IsString()
    description?: string;
    // Note: optional in the DTO but stored as null in the DB if absent
    // The service does: description: dto.description ?? null
}
```

The global `ValidationPipe` (configured in `main.ts` with `whitelist: true`) strips any fields not declared in this DTO before the request reaches the controller. An attacker cannot inject extra properties.

#### The SuperAdminGuard — `guards/super-admin.guard.ts`

```typescript
@Injectable()
export class SuperAdminGuard implements CanActivate {
    constructor(
        @InjectRepository(UserRole)
        private readonly userRoleRepo: Repository<UserRole>,
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest();
        const userId: string | undefined = request.user?.userId;
        // request.user is set by JwtAuthGuard, which runs before this guard.
        // It contains { userId, email } decoded from the JWT payload.

        if (!userId) throw new ForbiddenException();
        // Safety net — should never happen if JwtAuthGuard ran first,
        // but guards are sometimes applied individually so we check.

        const record = await this.userRoleRepo
            .createQueryBuilder('ur')
            .innerJoin('ur.role', 'role')
            .where('ur.user_id = :userId', { userId })
            .andWhere('role.name = :name', { name: 'Super Admin' })
            .getOne();
        // innerJoin: only returns rows where the join condition is satisfied
        // (i.e., the related Role exists AND its name = 'Super Admin').
        // getOne(): returns one row or null — we don't care about which row,
        // just whether any row exists.

        if (!record) throw new ForbiddenException();
        return true;
    }
}
```

**Why a query builder instead of `findOne({ where: { ... } })`?**

TypeORM's `findOne` with nested `where` clauses on relations requires the `relations` array to join the table first. Using `createQueryBuilder` with `innerJoin` is more explicit and slightly more efficient — it only joins what it needs and does not load the full `Role` object into memory.

**Limitation acknowledged:** This guard hits the database on every request. US-10 will introduce Redis caching to avoid this overhead. For now, it is correct but not yet optimised.

#### The service — `roles.service.ts`

```typescript
async create(dto: CreateRoleDto): Promise<Role> {
    const existing = await this.roleRepo.findOne({ where: { name: dto.name } });
    if (existing) throw new ConflictException('A role with this name already exists');
    // Application-level uniqueness check. The DB also has a UNIQUE constraint
    // as a safety net (for concurrent requests that race past this check).

    const role = this.roleRepo.create({
        name: dto.name,
        description: dto.description ?? null,
        // ?? null: if description is undefined (field omitted in request),
        // store null in the DB rather than undefined (which TypeORM would ignore)
    });
    return this.roleRepo.save(role);
    // create() builds the entity object in memory.
    // save() executes the INSERT and returns the saved record with
    // auto-generated fields (role_id, created_at, updated_at).
}

async findAll(): Promise<Role[]> {
    return this.roleRepo.find({ order: { created_at: 'ASC' } });
    // ASC order: oldest role first — Super Admin was seeded first so it
    // always appears at the top of the list.
}
```

#### The controller — `roles.controller.ts`

```typescript
@Controller('roles')
@UseGuards(JwtAuthGuard, SuperAdminGuard)   // ← applied at class level
export class RolesController {
    // Both guards apply to every route in this controller.
    // Order matters: JwtAuthGuard runs first (sets request.user),
    // then SuperAdminGuard uses request.user to do the role check.

    @Post()
    @HttpCode(HttpStatus.CREATED)   // explicit 201 — NestJS default for POST is 200
    create(@Body() dto: CreateRoleDto) {
        return this.rolesService.create(dto);
    }

    @Get()
    findAll() {
        return this.rolesService.findAll();
        // No @HttpCode needed — GET returning data defaults to 200
    }
}
```

#### The module — `roles.module.ts`

```typescript
@Module({
    imports: [TypeOrmModule.forFeature([Role, UserRole])],
    // forFeature registers repositories for both entities in this module's
    // dependency injection scope. Without this, @InjectRepository(UserRole)
    // in SuperAdminGuard would throw "No repository for UserRole found".

    controllers: [RolesController],
    providers: [RolesService, SuperAdminGuard],
    exports: [RolesService, SuperAdminGuard],
    // exports: other modules that import RolesModule can inject RolesService
    // or use SuperAdminGuard without re-declaring them as providers.
    // This will matter in future US when controllers in other modules
    // need to gate endpoints to Super Admins.
})
export class RolesModule {}
```

---

### 1.3 Frontend — The roles management page

The page lives at `/admin/roles` and has two responsibilities:
1. **List** all existing roles (using `useQuery`)
2. **Create** a new role via a form (using `useMutation`)

#### State management strategy

| Data | Tool | Why |
|---|---|---|
| Roles list | `useQuery` (TanStack Query) | Server state — lives in the DB, should not be cached in Zustand |
| Auth check | `useAuthStore` (Zustand) | Access token is already in the store from login |
| Form values | `react-hook-form` | Local form state, not shared across components |

#### The query — fetching roles

```typescript
const { data: roles, isLoading, isError } = useQuery<Role[]>({
    queryKey: ['roles'],
    queryFn: async () => {
        const { data } = await api.get('/roles');
        return data;
    },
    enabled: !!accessToken,
    // enabled: false prevents the query from running if there is no token.
    // Without this guard, the page would fire an unauthenticated GET on mount
    // (before the useEffect redirect fires), resulting in a flash of error state.
});
```

#### The mutation — creating a role

```typescript
const mutation = useMutation({
    mutationFn: (data: CreateRoleFormData) => api.post('/roles', data),
    onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['roles'] });
        // invalidateQueries marks the 'roles' cache as stale and
        // immediately re-fetches it. This is how the new role appears
        // in the list "immediately" — no manual state update needed.
        reset();
        // reset() clears the form fields back to empty after a successful create.
    },
});
```

#### Error display

The mutation error message is extracted from the Axios error response:

```typescript
{(mutation.error as any)?.response?.data?.message ?? 'Failed to create role.'}
```

When the backend returns a `409 Conflict`, NestJS puts the message in `response.data.message`. This line reads it and falls back to a generic message if the shape is unexpected. The `as any` cast is a pragmatic choice — a typed Axios error wrapper would be cleaner but is beyond the scope of this sprint.

---

### 1.4 Security / Design Notes

**The bootstrap problem — who is the first Super Admin?**

The `POST /roles` endpoint is protected by `SuperAdminGuard`. `SuperAdminGuard` checks the `user_roles` table. But to get a row into `user_roles`, someone must already be a Super Admin to use the endpoint.

This is a classic chicken-and-egg problem. The solution is a **database seed** — run a SQL statement directly against the DB to create the `Super Admin` role and assign it to the first administrator's account. This is intentional: the first Super Admin can only be created by someone with direct database access, which is a deliberate security constraint.

In development, the seed command used during testing was:

```sql
-- Create the Super Admin role
INSERT INTO roles (role_id, name, description, created_at, updated_at)
VALUES (gen_random_uuid(), 'Super Admin', 'Full platform access', now(), now());

-- Assign it to a specific user
INSERT INTO user_roles (user_role_id, user_id, role_id, created_at)
SELECT gen_random_uuid(), u.user_id, r.role_id, now()
FROM users u, roles r
WHERE u.email = 'admin@example.com' AND r.name = 'Super Admin';
```

**Why not just check `request.user.role` from the JWT?**

The JWT payload currently contains `{ sub: userId, email }`. Embedding roles in the JWT would mean the token becomes stale if roles change — a user's token would still say "Super Admin" even after the role was revoked, until the token expires (up to 15 minutes). Querying the database in the guard means role changes take effect on the very next request.

**The full RBAC guard comes in US-10.** `SuperAdminGuard` is a targeted, temporary solution for Sprint 2. US-10 builds a general-purpose `RbacGuard` that checks any permission string (e.g., `create:roles`) and caches results in Redis so the DB is not hit on every request.

---

### 1.5 The full flow

```
Browser (/admin/roles)        NestJS                        PostgreSQL
         │                       │                               │
         │── GET /roles ─────────►│                               │
         │   Bearer: <token>      │                               │
         │                  JwtAuthGuard                          │
         │                  verifies token                        │
         │                  sets request.user                     │
         │                        │                               │
         │                  SuperAdminGuard                       │
         │                        │── SELECT user_roles ─────────►│
         │                        │   WHERE user_id = ?           │
         │                        │   AND role.name = 'Super Admin'
         │                        │◄─ row found ─────────────────│
         │                        │                               │
         │                  RolesController.findAll()             │
         │                  RolesService.findAll()                │
         │                        │── SELECT * FROM roles ───────►│
         │                        │   ORDER BY created_at ASC     │
         │                        │◄─ [ { role_id, name, ... } ] ─│
         │◄── 200 [ roles ] ──────│                               │
         │                        │                               │
         │── POST /roles ─────────►│                               │
         │   { name, description } │                               │
         │                  (guards run again)                    │
         │                        │                               │
         │                  RolesService.create()                 │
         │                        │── SELECT * FROM roles ───────►│
         │                        │   WHERE name = 'Moderator'    │
         │                        │◄─ null (not found) ──────────│
         │                        │── INSERT INTO roles ─────────►│
         │                        │◄─ { role_id, name, ... } ────│
         │◄── 201 { role } ───────│                               │
         │                        │                               │
    TanStack Query                │                               │
    invalidates ['roles']         │                               │
    re-fires GET /roles ─────────►│  (same flow as above)         │
         │◄── 200 [ roles ] ──────│                               │
    list re-renders with new role  │                               │
```

---

## 2. US-07 — Assign Permissions to Role

> *As a Super Admin, I want to assign permissions to a role so that I can control what actions each role can perform.*

### Acceptance Criteria
- Permissions are listed by module and action
- Super Admin can check/uncheck permissions per role
- Changes take effect immediately without system restart

---

### 2.1 Theory — Permissions and ManyToMany relationships

#### What is a permission?

A **permission** is a string describing one discrete action on one domain. Betazoid uses the pattern `{action}:{module}`:

```
create:courses    — can create a course
delete:users      — can delete a user
publish:courses   — can change a course from pending to published
read:payouts      — can view payout records
```

This naming convention makes the RBAC guard trivially readable: "does this user's roles include a permission named `create:courses`?" is just a string lookup.

#### Why separate permissions from roles?

You could put a permission array directly on the role:

```
roles
+-------------+-------------------------------------------+
| name        | permissions                               |
+-------------+-------------------------------------------+
| Moderator   | ["publish:courses","delete:reviews"]      |
+-------------+-------------------------------------------+
```

This works until you want to:
- List all unique permissions across the platform
- Add a new permission without touching the role schema
- Query "which roles have the `publish:courses` permission?"

A dedicated `permissions` table solves all three. Permissions become first-class records — queryable, seedable, and referenceable from multiple roles simultaneously.

#### ManyToMany relationships and join tables

A role can have many permissions. A permission can belong to many roles. This is a **many-to-many** relationship.

```
roles          role_permissions (join table)     permissions
+----------+   +-----------+--------------+   +----------------+
| role_id  |──<| role_id   | permission_id|>──| permission_id  |
| name     |   +-----------+--------------+   | name           |
+----------+                                   +----------------+
 Moderator                                       publish:courses
 Instructor                                      delete:reviews
```

The join table `role_permissions` stores one row per (role, permission) pair. TypeORM creates and manages this table automatically when you use `@ManyToMany` + `@JoinTable` on the owning side.

**Replacing vs. merging:** When a Super Admin submits a new permission set, the cleanest approach is a **full replace** — wipe the role's current permissions and insert the new set. TypeORM handles this in a single `save()` call when you reassign `role.permissions = [newList]`. This avoids the complexity of computing diffs (what to add, what to remove).

#### Permission seeding: why OnApplicationBootstrap?

Permissions only exist if they are in the `permissions` table. If the table is empty, the frontend checklist has nothing to show. We need a way to pre-populate it.

**Option A — Manual SQL seed:** Works but requires running a script separately on every fresh database.  
**Option B — `OnApplicationBootstrap` hook:** The service implements NestJS's `OnApplicationBootstrap` interface. Its `onApplicationBootstrap()` method runs automatically after all modules are initialised, every time the app starts. It checks which permissions do not yet exist and inserts only the missing ones (idempotent — safe to run many times).

```
App starts
    │
    ▼
All modules initialised
    │
    ▼
onApplicationBootstrap() fires in PermissionsService
    │
    ├── SELECT all existing permission names
    ├── Compare against SEED_PERMISSIONS list
    └── INSERT only the ones that are missing
```

This guarantees that a fresh database always has the full permission catalogue after the first startup — no manual steps needed.

---

### 2.2 Backend — Listing permissions and assigning them to roles

#### Endpoints

```
GET /api/v1/permissions
Headers: Authorization: Bearer <token>  (Super Admin only)

Response 200: [
  { "permission_id": "uuid", "name": "assign:permissions", "created_at": "...", "updated_at": "..." },
  { "permission_id": "uuid", "name": "create:categories",  ... },
  ...
]
Returns all 44 seeded permissions sorted alphabetically by name.

---

GET /api/v1/roles/:id/permissions
Headers: Authorization: Bearer <token>  (Super Admin only)

Response 200:
{
  "role_id": "uuid",
  "name": "Moderator",
  "description": "Reviews courses",
  "permissions": [
    { "permission_id": "uuid", "name": "publish:courses", ... }
  ],
  "created_at": "...",
  "updated_at": "..."
}
Returns the role object with its currently assigned permissions eagerly loaded.
Response 404 if role_id does not exist.

---

PUT /api/v1/roles/:id/permissions
Headers: Authorization: Bearer <token>  (Super Admin only)
Body:   { "permissionIds": ["uuid1", "uuid2", "uuid3"] }

Response 200: same shape as the GET above, now reflecting the new permission set.
Send an empty array to remove all permissions from the role.
```

#### New entity: Permission — `permissions/entities/permission.entity.ts`

```typescript
@Entity('permissions')
export class Permission {
    @PrimaryGeneratedColumn('uuid')
    permission_id!: string;
    // UUID — consistent with all other entities; prevents enumeration

    @Column({ unique: true, length: 100 })
    name!: string;
    // The permission string, e.g. 'create:courses'
    // unique: true — two permissions cannot have the same action:module string

    @CreateDateColumn()
    created_at!: Date;

    @UpdateDateColumn()
    updated_at!: Date;
}
```

Notice what is **not** here: there is no `@ManyToMany` back-reference to `Role`. The relationship is **unidirectional** — we only ever navigate from a Role to its Permissions, never the other way. Keeping it unidirectional avoids a circular TypeScript import between `role.entity.ts` and `permission.entity.ts`.

#### Updated Role entity — `roles/entities/role.entity.ts`

The only addition to the existing `Role` entity:

```typescript
@ManyToMany(() => Permission)
@JoinTable({
    name: 'role_permissions',       // the join table name in PostgreSQL
    joinColumn: { name: 'role_id' },           // FK pointing at this entity
    inverseJoinColumn: { name: 'permission_id' }, // FK pointing at Permission
})
permissions!: Permission[];
// TypeORM creates and manages the role_permissions table automatically.
// On synchronize: true (dev mode), the table appears on first startup.
```

`@JoinTable` is placed on the **owning side** (Role). The owning side is responsible for managing the join table rows. When you do `role.permissions = [p1, p2]` and then `save(role)`, TypeORM:
1. Deletes all existing rows in `role_permissions` for this `role_id`
2. Inserts one new row per permission in the new list

This is the full-replace strategy — no diff logic required.

#### PermissionsService — `permissions/permissions.service.ts`

```typescript
const SEED_PERMISSIONS = [
    'create:users', 'read:users', 'update:users', 'delete:users',
    'create:roles', 'read:roles', 'update:roles', 'delete:roles',
    'assign:permissions', 'read:permissions',
    'create:courses', 'read:courses', 'update:courses', 'delete:courses', 'publish:courses',
    // ... (full list covers all planned modules through Sprint 9)
];

@Injectable()
export class PermissionsService implements OnApplicationBootstrap {
    constructor(
        @InjectRepository(Permission)
        private readonly permissionRepo: Repository<Permission>,
    ) {}

    async onApplicationBootstrap(): Promise<void> {
        await this.seedPermissions();
    }

    private async seedPermissions(): Promise<void> {
        const existing = await this.permissionRepo.find({ select: ['name'] });
        // Fetch only the 'name' column — avoids loading unnecessary data
        const existingNames = new Set(existing.map((p) => p.name));
        // Convert to a Set for O(1) lookup
        const toInsert = SEED_PERMISSIONS.filter((name) => !existingNames.has(name));
        // Only seed what is missing — idempotent on repeated restarts
        if (toInsert.length === 0) return;
        const entities = toInsert.map((name) => this.permissionRepo.create({ name }));
        await this.permissionRepo.save(entities);
        // save() with an array does a bulk INSERT — one query, not N queries
    }

    findAll(): Promise<Permission[]> {
        return this.permissionRepo.find({ order: { name: 'ASC' } });
        // Alphabetical order — the frontend groups by module but sorts within each group
    }

    findByIds(ids: string[]): Promise<Permission[]> {
        if (ids.length === 0) return Promise.resolve([]);
        // Short-circuit: if the client sends an empty array,
        // skip the DB query and return [] immediately
        return this.permissionRepo.findBy({ permission_id: In(ids) });
        // In() generates: WHERE permission_id IN ('uuid1', 'uuid2', ...)
        // Any IDs that don't exist in the DB are silently ignored —
        // the frontend only sends IDs it received from GET /permissions,
        // so invalid IDs should never appear in practice
    }
}
```

#### PermissionsController — `permissions/permissions.controller.ts`

```typescript
@Controller('permissions')
@UseGuards(JwtAuthGuard, SuperAdminGuard)
// Class-level guards — every route requires authentication AND Super Admin role
export class PermissionsController {
    constructor(private readonly permissionsService: PermissionsService) {}

    @Get()
    findAll() {
        return this.permissionsService.findAll();
        // Returns the full permission catalogue.
        // The frontend uses this list to render the checkbox grid.
    }
}
```

#### PermissionsModule — `permissions/permissions.module.ts`

```typescript
@Module({
    imports: [TypeOrmModule.forFeature([Permission, UserRole])],
    // Permission — this module's own entity
    // UserRole — needed so SuperAdminGuard can be provided here
    // (SuperAdminGuard injects @InjectRepository(UserRole))
    controllers: [PermissionsController],
    providers: [PermissionsService, SuperAdminGuard],
    // SuperAdminGuard is re-provided here rather than imported from RolesModule.
    // This avoids a circular module dependency:
    //   RolesModule imports PermissionsModule (for Permission entity)
    //   PermissionsModule would need RolesModule (for SuperAdminGuard)
    //   → circular. Solution: each module provides its own instance of SuperAdminGuard.
    exports: [PermissionsService],
})
export class PermissionsModule {}
```

**Why not import RolesModule?** If `PermissionsModule` imported `RolesModule` for `SuperAdminGuard`, and `RolesModule` registered the `Permission` entity (which it needs for `RolesService.assignPermissions`), NestJS would detect a circular module dependency. The solution is to re-provide `SuperAdminGuard` in `PermissionsModule` with its own `UserRole` repository — NestJS creates a separate DI scope per module, so two instances of the same class with different injected repos is perfectly valid.

#### The DTO — `roles/dto/assign-permissions.dto.ts`

```typescript
export class AssignPermissionsDto {
    @IsArray()
    // Validates that the value is a JavaScript array
    @IsUUID('4', { each: true })
    // each: true — applies the UUID validator to every element of the array
    // UUID v4 — consistent with how all permission_ids are generated
    permissionIds!: string[];
    // An empty array [] is valid — it means "remove all permissions from this role"
}
```

#### Updated RolesService — `roles/roles.service.ts`

Two new methods added:

```typescript
// Injected alongside the existing Role repository:
@InjectRepository(Permission)
private readonly permissionRepo: Repository<Permission>,
// RolesModule registers Permission in its TypeOrmModule.forFeature([...]) call,
// so this injection works without importing PermissionsModule.

async findRoleWithPermissions(roleId: string): Promise<Role> {
    const role = await this.roleRepo.findOne({
        where: { role_id: roleId },
        relations: ['permissions'],
        // relations: tells TypeORM to JOIN the role_permissions table and
        // load the Permission records into role.permissions[].
        // Without this, role.permissions would be undefined.
    });
    if (!role) throw new NotFoundException('Role not found');
    return role;
}

async assignPermissions(roleId: string, dto: AssignPermissionsDto): Promise<Role> {
    const role = await this.roleRepo.findOne({
        where: { role_id: roleId },
        relations: ['permissions'],
        // Must load existing permissions so TypeORM knows what to delete
        // in the join table before inserting the new set.
    });
    if (!role) throw new NotFoundException('Role not found');

    const permissions =
        dto.permissionIds.length > 0
            ? await this.permissionRepo.findBy({ permission_id: In(dto.permissionIds) })
            : [];
    // Fetch the Permission entities for all provided IDs.
    // Unknown IDs are silently dropped (findBy returns only matches).

    role.permissions = permissions;
    // Reassigning the relation array is how you tell TypeORM to replace
    // the entire join-table set. The old rows are deleted and new ones inserted
    // in the single save() call below.

    return this.roleRepo.save(role);
    // TypeORM wraps this in a transaction automatically for relation updates.
}
```

#### Updated RolesController — `roles/roles.controller.ts`

Two new routes added to the existing controller:

```typescript
@Get(':id/permissions')
findRoleWithPermissions(@Param('id', ParseUUIDPipe) id: string) {
    // ParseUUIDPipe validates that :id is a valid UUID before it reaches the service.
    // A non-UUID value (e.g., 'abc') returns 400 Bad Request automatically —
    // no manual validation needed in the service.
    return this.rolesService.findRoleWithPermissions(id);
}

@Put(':id/permissions')
@HttpCode(HttpStatus.OK)
// PUT replaces the entire resource state — this is the correct HTTP verb
// for a full-replace operation (vs. PATCH which is partial update).
// @HttpCode(200) is explicit even though 200 is the default for PUT,
// because the NestJS convention file specifies using @HttpCode on POST handlers.
assignPermissions(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignPermissionsDto,
) {
    return this.rolesService.assignPermissions(id, dto);
}
```

---

### 2.3 Frontend — The permissions checklist page

The page lives at `/admin/roles/[id]/permissions` — a Next.js dynamic route where `[id]` is the `role_id`. Its responsibilities:

1. **Fetch** all available permissions (`GET /permissions`)
2. **Fetch** the role with its current permissions (`GET /roles/:id/permissions`)
3. **Render** a grouped checklist, pre-checked with the role's current permissions
4. **Submit** the updated selection (`PUT /roles/:id/permissions`)

#### State management strategy

| State | Tool | Why |
|---|---|---|
| All permissions list | `useQuery` | Server state — fetched once, cached by TanStack Query |
| Role's current permissions | `useQuery` | Server state — fetched per role, invalidated after PUT |
| Checked permission IDs | `useState<Set<string>>` | Local UI state — changes instantly on checkbox click, not persisted until Save |
| Whether initial selection was set | `useState<boolean>` | Prevents re-initialising the checkboxes if the query re-fetches |

The `selected` Set starts empty and is **initialised once** from the role query result:

```typescript
const [selected, setSelected] = useState<Set<string>>(new Set());
const [initialized, setInitialized] = useState(false);

useEffect(() => {
    if (role && !initialized) {
        setSelected(new Set(role.permissions.map((p) => p.permission_id)));
        setInitialized(true);
        // initialized flag prevents this effect from overwriting the user's
        // checkbox changes if TanStack Query re-fetches in the background.
    }
}, [role, initialized]);
```

Without the `initialized` guard, a background re-fetch could reset the user's unsaved checkbox changes.

#### Grouping permissions by module

The frontend receives a flat list of permission strings like `['create:courses', 'delete:users', ...]`. The UI groups them by the module part (after the `:`):

```typescript
function groupByModule(permissions: Permission[]): Record<string, Permission[]> {
    return permissions.reduce<Record<string, Permission[]>>((acc, p) => {
        const module = p.name.split(':')[1] ?? 'other';
        // split(':')[1] — take the second segment: 'create:courses' → 'courses'
        if (!acc[module]) acc[module] = [];
        acc[module].push(p);
        return acc;
    }, {});
}
```

Result: `{ courses: [...], users: [...], roles: [...], ... }`. The page then renders one section per module, sorted alphabetically, with checkboxes labelled by the action (`create`, `read`, `delete`, etc.).

#### The mutation — saving the permission set

```typescript
const mutation = useMutation({
    mutationFn: (permissionIds: string[]) =>
        api.put(`/roles/${roleId}/permissions`, { permissionIds }),
    onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['role', roleId, 'permissions'] });
        // Invalidates the role query so that a fresh GET re-fetches the
        // confirmed state from the server. If the server saved something
        // different from what the frontend expected, the UI reflects reality.
    },
});

function handleSave() {
    mutation.mutate([...selected]);
    // Spread Set into Array — the DTO expects string[],
    // and Set is not JSON-serialisable directly.
}
```

#### Checkbox toggle — O(1) with a Set

Using a `Set<string>` instead of an array for `selected` makes the toggle cheap:

```typescript
function toggle(id: string) {
    setSelected((prev) => {
        const next = new Set(prev);
        // Create a new Set (React state must be immutable — never mutate prev)
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
    });
}
```

`Set.has()` is O(1). An array would require `array.includes()` — O(n) on every render. For 44 permissions this difference is negligible, but the Set approach is semantically correct (each ID appears at most once).

---

### 2.4 Security / Design Notes

**No Redis invalidation yet — that is intentional.**

The acceptance criterion "changes take effect immediately without system restart" means you don't need to deploy new code to add a permission. It does **not** mean the change appears on the very next millisecond for a user who is mid-request. US-10 introduces Redis caching of permission lookups. When that cache exists, US-10 also handles invalidation. For now, the RBAC guard hits the database on every request so there is no stale cache to worry about.

**PUT vs PATCH — why full replace?**

A PATCH-based approach would send only the changes: `{ add: ["uuid1"], remove: ["uuid2"] }`. This requires the client to know the current state and compute a diff. The full-replace PUT is simpler: the frontend sends the complete desired state, and the backend applies it atomically. The risk of concurrent edits (two admins editing the same role simultaneously) is accepted — it is an inherent race condition in any UI-driven permission management system.

**Unknown permission IDs are silently dropped.**

If `permissionIds` contains a UUID that does not exist in the `permissions` table, `findBy({ permission_id: In(ids) })` simply returns no record for it. The save proceeds with the permissions that were found. This is safe because the frontend only ever sends IDs it received from `GET /permissions` — a client sending a fabricated UUID would just have it ignored.

**`ParseUUIDPipe` prevents invalid DB queries.**

Without `ParseUUIDPipe`, a request to `GET /roles/not-a-uuid/permissions` would reach the service and generate a malformed PostgreSQL query (UUIDs have a specific format the DB validates). The pipe returns a `400 Bad Request` before the service is called, saving an unnecessary DB round-trip.

---

### 2.5 The full flow

```
Browser (/admin/roles/[id]/permissions)    NestJS                  PostgreSQL
         │                                    │                         │
         │── GET /permissions ───────────────►│                         │
         │   Bearer: <token>            JwtAuthGuard + SuperAdminGuard  │
         │                                    │── SELECT user_roles ───►│
         │                                    │◄─ Super Admin confirmed ─│
         │                                    │── SELECT permissions ───►│
         │                                    │   ORDER BY name ASC     │
         │                                    │◄─ [ 44 permissions ] ───│
         │◄── 200 [ all permissions ] ────────│                         │
         │                                    │                         │
         │── GET /roles/:id/permissions ─────►│                         │
         │   Bearer: <token>            (guards run again)              │
         │                                    │── SELECT roles          │
         │                                    │   LEFT JOIN             │
         │                                    │   role_permissions ────►│
         │                                    │   LEFT JOIN permissions │
         │                                    │◄─ { role + permissions }│
         │◄── 200 { role, permissions: [] } ──│                         │
         │                                    │                         │
    useEffect initialises                     │                         │
    selected Set from role.permissions        │                         │
    (empty on fresh role)                     │                         │
         │                                    │                         │
    User checks/unchecks boxes                │                         │
    (local Set state updates, no API calls)   │                         │
         │                                    │                         │
         │── PUT /roles/:id/permissions ─────►│                         │
         │   { permissionIds: ["u1","u2"] }   │                         │
         │                            RolesService.assignPermissions()  │
         │                                    │── SELECT roles + perms ►│
         │                                    │   (load current state)  │
         │                                    │◄─ role found ───────────│
         │                                    │── SELECT permissions ───►│
         │                                    │   WHERE id IN (u1,u2)   │
         │                                    │◄─ [ Permission, ... ] ──│
         │                                    │                         │
         │                                    │── DELETE role_permissions│
         │                                    │   WHERE role_id = :id ──►│
         │                                    │── INSERT role_permissions│
         │                                    │   (role_id, perm_id)x2 ►│
         │                                    │◄─ saved ────────────────│
         │◄── 200 { role, permissions: [...] }│                         │
         │                                    │                         │
    TanStack Query invalidates                │                         │
    ['role', roleId, 'permissions']           │                         │
    re-fetches to confirm server state        │                         │
```

---

## 3. US-08 — Assign Role to User

> *As a Super Admin, I want to assign one or more roles to a user so that they gain the appropriate access.*

### Acceptance Criteria
- Super Admin can search for a user and assign roles
- User can hold multiple roles simultaneously
- Access changes apply on the user's next request

---

### 3.1 Theory — User role assignment and the "full replace" pattern

#### Why search instead of a dropdown?

A platform like Betazoid will eventually have thousands of users. A `<select>` dropdown with every user loaded at once is impractical — it's slow to load and hard to navigate. Instead, the admin types a name or email fragment; the API performs a case-insensitive `ILIKE` search and returns only matching users (capped at 50). This is the same UX pattern used by every admin panel from GitHub to Stripe.

#### The "full replace" pattern for junction tables

US-07 used the same concept for permissions — when you want to change a user's roles, the cleanest approach is:

```
1. DELETE all rows in user_roles WHERE user_id = :userId
2. INSERT one new row per roleId in the new desired set
```

This is called a **full replace** (or "set replace"). The alternative — computing a diff — requires knowing the old state, calculating what to add and remove, and handling races. Full replace is atomic (delete + insert together), predictable, and requires only a single round-trip of intent from the client.

```
Before:   user_roles = [ (alice, Instructor) ]
Request:  PUT { roleIds: [SuperAdmin, Instructor] }

Step 1 — DELETE WHERE user_id = alice
          user_roles = []

Step 2 — INSERT (alice, SuperAdmin), (alice, Instructor)
          user_roles = [ (alice, SuperAdmin), (alice, Instructor) ]
```

Sending `roleIds: []` is valid and clears all roles — useful when revoking access entirely.

#### Why do changes take effect "on the next request"? (AC3)

This is directly tied to how `SuperAdminGuard` works. It does **not** read roles from the JWT token. Instead, it queries the `user_roles` table on every incoming request:

```
User makes request
    │
    ▼
JwtAuthGuard extracts userId from the JWT
    │
    ▼
SuperAdminGuard queries user_roles WHERE user_id = userId AND role.name = 'Super Admin'
    │
    ├── row found  → allow (200)
    └── no row     → deny (403)
```

Because the guard reads from the database on every call, assigning or revoking a role is immediately visible — no token re-issue, no cache flush, no server restart required. The user simply makes their next API request and the new role check reflects the updated database state.

> **US-10 caveat:** US-10 will add Redis caching to this lookup. When caching is in place, role assignments will still take effect quickly, but a cache invalidation step will be needed. For US-08, there is no cache — the DB is the single source of truth.

#### Sensitive field projection

The user search endpoint must not expose `password_hash`, `refresh_token_hash`, or password-reset tokens — even to Super Admins. These fields are only ever needed by the auth service internally. The service uses TypeORM's object-style `select` option to whitelist exactly which columns to return:

```
SELECT user_id, full_name, email, gmail, bio, profile_photo_url,
       is_email_verified, created_at, updated_at
FROM users
-- password_hash and all token columns are never fetched
```

---

### 3.2 Backend — Searching users and assigning roles

#### Endpoints

```
GET /api/v1/roles/users?search=<query>
Headers: Authorization: Bearer <token>  (Super Admin only)

Returns up to 50 users whose full_name OR email contains the query (case-insensitive).
Omit ?search or send an empty string to return all users (up to 50).

Response 200:
[
  {
    "user_id": "uuid",
    "full_name": "John Doe",
    "email": "john@example.com",
    "gmail": "john@gmail.com",
    "bio": null,
    "profile_photo_url": null,
    "is_email_verified": true,
    "created_at": "...",
    "updated_at": "...",
    "userRoles": [
      { "user_role_id": "uuid", "created_at": "...", "role": { "role_id": "uuid", "name": "Instructor" } }
    ]
  },
  ...
]
Note: password_hash and all token fields are excluded from every response.

---

PUT /api/v1/roles/users/:userId/roles
Headers: Authorization: Bearer <token>  (Super Admin only)
Body:   { "roleIds": ["uuid1", "uuid2"] }

Replaces the user's current role set with the provided list.
Send an empty array to remove all roles.

Response 200: (empty body — no resource to return after a void operation)
Response 400: userId is not a valid UUID, or roleIds contains non-UUID values, or roleIds is missing
Response 403: not authenticated as Super Admin
Response 404: userId does not exist, or one or more roleIds do not exist
```

#### The DTO — `roles/dto/assign-roles.dto.ts`

```typescript
export class AssignRolesDto {
    @IsArray()
    // Validates that the value is a JavaScript array.
    // An empty array [] is valid — it means "remove all roles from this user".
    @IsUUID('4', { each: true })
    // each: true — applies the UUID v4 check to every element.
    // A non-UUID value like "not-a-uuid" causes a 400 before the service is called.
    roleIds!: string[];
}
```

#### Updated RolesService — `searchUsers` method

```typescript
async searchUsers(query: string): Promise<Partial<User>[]> {
    const where = query
        ? [{ full_name: ILike(`%${query}%`) }, { email: ILike(`%${query}%`) }]
        : undefined;
    // ILike: TypeORM's case-insensitive LIKE operator.
    // '%john%' matches "John Doe", "JOHN SMITH", "johnson" — any substring.
    //
    // Array form of where: TypeORM treats array elements as OR conditions.
    // So this generates: WHERE (full_name ILIKE '%q%') OR (email ILIKE '%q%')
    //
    // When query is empty, where = undefined → no WHERE clause → return all users.

    return this.userRepo.find({
        select: {
            user_id: true,
            full_name: true,
            email: true,
            gmail: true,
            bio: true,
            profile_photo_url: true,
            is_email_verified: true,
            created_at: true,
            updated_at: true,
            // password_hash and all token columns are intentionally omitted.
            // TypeORM's object-style select (introduced in v0.3) allows
            // specifying nested relation columns in the same object:
            userRoles: {
                user_role_id: true,
                created_at: true,
                role: { role_id: true, name: true },
            },
        },
        where,
        relations: { userRoles: { role: true } },
        // Object-style relations: equivalent to ['userRoles', 'userRoles.role']
        // but pairs naturally with the object-style select above.
        order: { full_name: 'ASC' },
        take: 50,
        // take: 50 prevents a Super Admin from accidentally fetching the entire
        // users table on an empty search against a large production database.
    });
}
```

#### Updated RolesService — `assignRolesToUser` method

```typescript
async assignRolesToUser(userId: string, dto: AssignRolesDto): Promise<void> {
    const user = await this.userRepo.findOne({ where: { user_id: userId } });
    if (!user) throw new NotFoundException('User not found');
    // Check the user exists before touching any role data.

    const roles =
        dto.roleIds.length > 0
            ? await this.roleRepo.findBy({ role_id: In(dto.roleIds) })
            : [];
    // findBy with In() returns only IDs that exist in the DB.
    // If roleIds = [], we skip the DB call entirely with an early return of [].

    if (dto.roleIds.length > 0 && roles.length !== dto.roleIds.length) {
        throw new NotFoundException('One or more roles not found');
        // If the client sent 3 roleIds but only 2 matched, at least one
        // doesn't exist. We reject rather than silently dropping it —
        // an admin assigning a non-existent role is almost certainly a bug.
    }

    await this.userRoleRepo
        .createQueryBuilder()
        .delete()
        .from(UserRole)
        .where('user_id = :userId', { userId })
        .execute();
    // Full replace — step 1: delete all current role assignments for this user.
    // We use QueryBuilder here rather than userRoleRepo.delete({ user: {...} })
    // because TypeORM's delete() does not reliably resolve nested relation
    // objects in WHERE conditions. The raw column name 'user_id' is unambiguous.

    if (roles.length > 0) {
        const userRoles = roles.map((role) => this.userRoleRepo.create({ user, role }));
        await this.userRoleRepo.save(userRoles);
        // create() + save() with an array → bulk INSERT.
        // Each UserRole entity carries the full User and Role objects;
        // TypeORM extracts the FKs (user_id, role_id) for the INSERT columns.
    }
    // If roleIds was [], we skip the INSERT — the user now has no roles.
}
```

#### Updated controller — `roles/roles.controller.ts`

```typescript
@Get('users')
// This route MUST be declared before @Get(':id/permissions').
// NestJS resolves static segments ('users') before parameterised ones (':id').
// If the order were reversed, a request to GET /roles/users would be caught
// by ':id' with id = 'users', causing a ParseUUIDPipe validation error.
searchUsers(@Query('search') search: string = '') {
    return this.rolesService.searchUsers(search);
    // @Query('search') extracts ?search= from the URL.
    // Default value '' means omitting ?search returns all users.
}

@Put('users/:userId/roles')
@HttpCode(HttpStatus.OK)
assignRolesToUser(
    @Param('userId', ParseUUIDPipe) userId: string,
    // ParseUUIDPipe rejects any non-UUID value before the service runs.
    // A request to PUT /roles/users/not-a-uuid/roles returns 400.
    @Body() dto: AssignRolesDto,
) {
    return this.rolesService.assignRolesToUser(userId, dto);
}
```

#### Updated module — `roles/roles.module.ts`

The only change from US-07 is adding `User` to the `forFeature` list:

```typescript
imports: [TypeOrmModule.forFeature([Role, UserRole, Permission, User])],
// User was added so that RolesService can inject @InjectRepository(User).
// Without this, NestJS throws "No repository for User found" at startup.
// Note: this does NOT mean RolesModule "owns" the User entity — TypeORM
// allows multiple modules to register the same entity independently.
```

---

### 3.3 Frontend — The user search and role assignment page

The page lives at `/admin/users`. Its flow:

1. On load — fetch all users (no search filter)
2. As the admin types in the search box — re-query with the search term
3. The admin clicks "Assign Roles" on a user — a second card appears below with checkboxes for every role
4. The admin checks/unchecks roles and clicks "Save Roles" — `PUT /roles/users/:userId/roles` is called
5. On success — the user list re-fetches (invalidated), the role card closes

#### State breakdown

| State | Tool | Why |
|---|---|---|
| User list | `useQuery(['admin-users', search])` | Server state — re-fetches when `search` changes |
| All roles | `useQuery(['roles'])` | Server state — already cached from the roles page |
| Search term | `useState('')` | Local UI input state |
| Which user is being edited | `useState<string \| null>` | Local UI — controls whether the role card is visible |
| Checked role IDs for the selected user | `useState<string[]>` | Local UI — initialised from the user's current roles |

#### The search query

```typescript
const { data: users } = useQuery<UserWithRoles[]>({
    queryKey: ['admin-users', search],
    // Including 'search' in the queryKey means TanStack Query treats each
    // unique search string as a separate cache entry. Typing 'john' hits the
    // cache for 'john'; clearing the box hits the cache for '' — no manual
    // cache management needed.
    queryFn: async () => {
        const { data } = await api.get('/roles/users', { params: { search } });
        return data;
    },
    enabled: !!accessToken,
});
```

#### Initialising the checkbox state from the selected user

```typescript
const handleSelectUser = (user: UserWithRoles) => {
    setSelectedUserId(user.user_id);
    setSelectedRoleIds(user.userRoles.map((ur) => ur.role.role_id));
    // Pre-populate the checkboxes with the roles the user already holds.
    // The admin can then add or remove roles from this starting point.
};
```

#### The checkbox toggle

```typescript
const toggleRole = (roleId: string) => {
    setSelectedRoleIds((prev) =>
        prev.includes(roleId) ? prev.filter((id) => id !== roleId) : [...prev, roleId],
    );
    // includes → O(n) here (vs. Set.has → O(1) in US-07).
    // With at most a handful of roles per platform, O(n) is fine.
    // The array form pairs naturally with the roleIds: string[] DTO.
};
```

#### The mutation

```typescript
const assignMutation = useMutation({
    mutationFn: ({ userId, roleIds }: { userId: string; roleIds: string[] }) =>
        api.put(`/roles/users/${userId}/roles`, { roleIds }),
    onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['admin-users'] });
        // Invalidate all admin-users queries (regardless of search term) so
        // the user's updated role list is reflected in every search result.
        setSelectedUserId(null);
        setSelectedRoleIds([]);
        // Close the role card and reset selection state.
    },
});
```

---

### 3.4 Security / Design Notes

**Why the user search endpoint lives under `/roles/users` and not `/users`**

The `GET /users` namespace belongs to the `UsersController`, which handles the authenticated user's own profile (`/users/me`). Placing admin-facing user management under `/roles/users` keeps the Super Admin operations co-located with the role management module and avoids polluting the `UsersController` with admin routes.

An alternative — adding a `GET /users?search=...` admin route with its own guard — would work but would require `UsersModule` to import `RolesModule` (for `SuperAdminGuard`), creating a module coupling that doesn't exist today. The current approach keeps modules clean.

**Sensitive field projection is mandatory, not optional**

Even though this endpoint is restricted to Super Admins, returning `password_hash` is never acceptable. A compromised Super Admin account, a misconfigured proxy, or a log line capturing response bodies would expose hashed passwords. The TypeORM `select` option ensures the column is never fetched from the DB in the first place — it cannot leak via error messages, log lines, or response serialisation.

**Assigning Super Admin role to a user enables their next request immediately (AC3)**

This is tested directly in `test/us-08-assign-role.e2e-spec.ts`:

```
regularUser makes GET /roles/users → 403 (no Super Admin role)
SuperAdmin calls PUT /roles/users/regularUser/roles { roleIds: [superAdminRoleId] }
regularUser makes GET /roles/users → 200 (Super Admin role now in DB)
```

No token refresh, no logout/login, no server restart — the guard query sees the new row immediately.

**The 50-row cap on user search**

`take: 50` is a practical guard against accidental full-table scans. As the user base grows, the search box with a typed query (which uses a DB index on `email` and `full_name`) will remain fast. An empty search returning all 50,000 users would not. If an admin genuinely needs to page through all users, a cursor-based pagination endpoint can be added in US-37 (Admin Dashboard).

---

### 3.5 The full flow

```
Browser (/admin/users)           NestJS                          PostgreSQL
         │                          │                                 │
         │── GET /roles/users ──────►│                                 │
         │   Bearer: <token>    JwtAuthGuard + SuperAdminGuard         │
         │                          │── SELECT user_roles ────────────►│
         │                          │   WHERE user_id = <admin>        │
         │                          │   AND role.name = 'Super Admin'  │
         │                          │◄─ row found ────────────────────│
         │                          │                                 │
         │                     RolesService.searchUsers('')            │
         │                          │── SELECT user_id, full_name,    │
         │                          │   email, gmail, ...             │
         │                          │   (no password_hash)            │
         │                          │   LEFT JOIN user_roles          │
         │                          │   LEFT JOIN roles               │
         │                          │   ORDER BY full_name ASC        │
         │                          │   LIMIT 50 ────────────────────►│
         │                          │◄─ [ users with userRoles ] ─────│
         │◄── 200 [ users ] ─────────│                                 │
         │                          │                                 │
    Admin types 'john' in search    │                                 │
         │── GET /roles/users       │                                 │
         │   ?search=john ──────────►│                                 │
         │                          │── SELECT ... WHERE              │
         │                          │   full_name ILIKE '%john%'      │
         │                          │   OR email ILIKE '%john%' ──────►│
         │                          │◄─ matching users ───────────────│
         │◄── 200 [ filtered users ] │                                 │
         │                          │                                 │
    Admin clicks "Assign Roles"     │                                 │
    on John Doe — role card opens   │                                 │
    pre-checked with John's roles   │                                 │
         │                          │                                 │
    Admin checks 'Instructor'       │                                 │
    and 'Super Admin' checkboxes    │                                 │
    → clicks "Save Roles"           │                                 │
         │                          │                                 │
         │── PUT /roles/users       │                                 │
         │   /:userId/roles ────────►│                                 │
         │   { roleIds: [u1, u2] }  │                                 │
         │                     RolesService.assignRolesToUser()        │
         │                          │── SELECT users WHERE            │
         │                          │   user_id = :userId ────────────►│
         │                          │◄─ user found ───────────────────│
         │                          │── SELECT roles WHERE            │
         │                          │   role_id IN (u1, u2) ──────────►│
         │                          │◄─ [ Role, Role ] ───────────────│
         │                          │── DELETE FROM user_roles        │
         │                          │   WHERE user_id = :userId ──────►│
         │                          │── INSERT INTO user_roles        │
         │                          │   (userId, u1), (userId, u2) ───►│
         │                          │◄─ done ─────────────────────────│
         │◄── 200 ──────────────────│                                 │
         │                          │                                 │
    TanStack Query invalidates      │                                 │
    ['admin-users'] — all variants  │                                 │
    list re-fetches, role card      │                                 │
    closes                          │                                 │
         │                          │                                 │
    John's next API request:        │                                 │
         │── any protected route ───►│                                 │
         │                     SuperAdminGuard                         │
         │                          │── SELECT user_roles ────────────►│
         │                          │   WHERE user_id = John           │
         │                          │   AND role.name = 'Super Admin' │
         │                          │◄─ row found (just inserted) ────│
         │◄── 200 (access granted) ──│                                 │
```
