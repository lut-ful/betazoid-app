# Sprint 2 — Role & Permission Management

**User Stories:** US-06 · US-07 · US-08 · US-09 · US-10
**Sprint Duration:** 2 weeks
**Backend module(s):** `roles`, `permissions`
**Frontend pages:** `/admin/roles`

---

## Table of Contents

1. [US-06 — Create Role](#1-us-06--create-role)

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
