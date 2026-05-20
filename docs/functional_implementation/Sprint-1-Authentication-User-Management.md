# Sprint 1 — Authentication & User Management

**User Stories:** US-01 · US-02 · US-03 · US-04 · US-05
**Sprint Duration:** 2 weeks
**Backend module:** `auth`, `users`
**Frontend pages:** `/register`, `/login`, `/profile`

---

## Table of Contents

1. [Concepts You Must Understand First](#1-concepts-you-must-understand-first)
2. [US-01 — User Registration](#2-us-01--user-registration)
3. [US-02 — User Login](#3-us-02--user-login)
4. [US-03 — User Logout](#4-us-03--user-logout)
5. [US-04 — Password Reset](#5-us-04--password-reset)
6. [US-05 — Profile Management](#6-us-05--profile-management)
7. [How Everything Connects](#7-how-everything-connects)

---

## 1. Concepts You Must Understand First

Before touching any code, these five concepts underpin every user story in this sprint. Understand them once and the code will make sense on its own.

---

### 1.1 Password Hashing

You never store a user's password in plain text. If your database is ever breached, you don't want attackers to get everyone's passwords.

**How hashing works:**

```
"mypassword123"  →  bcrypt()  →  "$2b$10$Xk3Lq9...randomhash..."
```

- The output looks random and cannot be reversed
- Every time you hash the same password, you get a **different** output (because bcrypt adds a random "salt")
- To verify: run `bcrypt.compare(plaintext, hash)` — it returns `true` or `false`

**bcrypt cost factor:** The `10` in `bcrypt.hash(password, 10)` controls how slow the hashing is. Slow = good for security (brute-force attacks take longer). 10 is the standard default.

---

### 1.2 JWT — JSON Web Token

A JWT is a compact, self-contained token that proves who you are.

**Structure:** three Base64-encoded parts separated by dots:
```
eyJhbGciOiJIUzI1NiJ9  .  eyJzdWIiOiJ1c2VyLTEyMyJ9  .  SflKxwRJSMeKKF2QT4fwpMeJf
      header                      payload                      signature
```

- **Header** — algorithm used to sign (e.g., HS256)
- **Payload** — the data you embed (e.g., `{ sub: userId, email, iat, exp }`)
- **Signature** — `HMAC(header + payload, secret)` — proves the token was issued by your server

The server keeps the `JWT_SECRET`. Anyone with that secret can verify a token. Anyone without it cannot forge one.

**Key properties:**
- Stateless — the server does not store it anywhere
- Self-expiring — the `exp` claim is a Unix timestamp; the server rejects expired tokens
- Cannot be tampered with — changing any bit in the payload breaks the signature

---

### 1.3 Access Token vs. Refresh Token

A single token would work, but creates a security dilemma:

| | Short-lived token | Long-lived token |
|---|---|---|
| If stolen | Attacker has 15 minutes | Attacker has 7 days |
| After password change | Expires quickly | Still valid |
| Database lookup needed | No (stateless) | Yes (to verify it) |

The solution is **two tokens**:

```
Access Token  — short-lived (15 min), stateless JWT, sent with every API request
Refresh Token — long-lived (7 days), random string, stored in DB (hashed), sent only to /auth/refresh
```

When the access token expires, the frontend silently calls `/auth/refresh` with the refresh token cookie, gets a new access token, and continues — the user never sees a login screen.

---

### 1.4 HTTP-only Cookies

Cookies have a flag called `httpOnly`. When set:
- The browser sends the cookie automatically with every request to your domain
- JavaScript **cannot** read it (`document.cookie` does not show it)

This is why refresh tokens live in HTTP-only cookies: even if an attacker injects malicious JavaScript into your page (XSS attack), they cannot steal the refresh token.

The access token lives in memory (a JavaScript variable / Zustand store) — not in `localStorage` (readable by JS) and not in cookies (you want to control exactly when it's sent).

---

### 1.5 The NestJS Request Lifecycle

When a request hits your NestJS backend, it passes through layers in this order:

```
Incoming Request
      ↓
  Middleware          (e.g., cookie-parser, cors)
      ↓
   Guards             (e.g., JwtAuthGuard — is this user authenticated?)
      ↓
  Interceptors        (before handler — e.g., logging)
      ↓
  Pipes               (e.g., ValidationPipe — is the DTO valid?)
      ↓
  Controller Handler  (your @Post('login') method)
      ↓
   Service            (your business logic)
      ↓
  Interceptors        (after handler — e.g., response transformation)
      ↓
Outgoing Response
```

Understanding this order explains why `ValidationPipe` rejects bad DTOs before your controller even runs, and why `JwtAuthGuard` blocks unauthenticated requests before your handler sees them.

---

## 2. US-01 — User Registration

> *As a new user, I want to register with my full name, email, Gmail, and password so that I can create an account on Betazoid.*

### Acceptance Criteria
- User can submit registration form with all required fields
- System validates email uniqueness
- Password is hashed before storing
- User receives a confirmation email after registration

---

### 2.1 What the backend does

```
POST /api/v1/auth/register
Body: { full_name, email, gmail, password }

1. ValidationPipe validates the DTO
2. AuthService checks: is email already taken?
3. AuthService checks: is gmail already taken?
4. bcrypt.hash(password, 10) → password_hash
5. Save user to DB inside a transaction
6. Send confirmation email via MailService
7. Return { message: "Registration successful. Check your email." }
```

**Why a database transaction?** If saving the user succeeds but the email fails to send, you don't want a user with no confirmation email who can't recover. A transaction wraps both operations — if anything throws, the whole thing rolls back and neither the user row nor the email are persisted.

In practice, email sending is outside the DB transaction (you can't roll back a sent email), but wrapping the DB operations in a transaction is still correct for consistency.

---

### 2.2 Data Transfer Object (DTO)

A DTO (Data Transfer Object) is a class that describes the shape of an incoming request body. `class-validator` decorators enforce the rules.

```typescript
// backend/src/auth/dto/register.dto.ts
import { IsEmail, IsNotEmpty, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(100)
    full_name: string;

    @IsEmail()
    email: string;

    @IsEmail()
    @Matches(/@gmail\.com$/, { message: 'gmail must be a valid Gmail address' })
    gmail: string;

    @IsString()
    @MinLength(8)
    password: string;
}
```

`ValidationPipe` (registered globally in `main.ts`) reads these decorators and rejects the request with a `400 Bad Request` before your service ever runs.

`whitelist: true` strips any extra fields the client sends that are not in the DTO (e.g., a `role` field a malicious user tries to inject).

---

### 2.3 The User Entity

A TypeORM entity maps a TypeScript class to a PostgreSQL table. Each `@Column()` decorator becomes a column.

```typescript
// backend/src/users/entities/user.entity.ts
@Entity('users')
export class User {
    @PrimaryGeneratedColumn('uuid')
    user_id: string;         // UUID primary key — more secure than auto-increment integers

    @Column({ length: 100 })
    full_name: string;

    @Column({ unique: true })
    email: string;           // unique constraint at DB level

    @Column({ unique: true })
    gmail: string;           // unique — controls YouTube playlist access

    @Column()
    password_hash: string;   // NEVER store plain passwords

    @Column({ default: false })
    is_email_verified: boolean;

    @Column({ nullable: true })
    email_verification_token: string;

    @Column({ nullable: true })
    refresh_token_hash: string;      // SHA-256 hash of the refresh token

    @Column({ type: 'timestamptz', nullable: true })
    refresh_token_expires_at: Date;  // when the refresh token expires

    @CreateDateColumn()
    created_at: Date;

    @UpdateDateColumn()
    updated_at: Date;
}
```

**Why UUID instead of auto-increment?** Auto-increment IDs expose how many users you have (`/users/1`, `/users/2`...) and let attackers enumerate resources. UUIDs are random and reveal nothing.

**`synchronize: true` in development** — TypeORM compares your entity to the actual DB schema on startup and adds/drops columns automatically. Never use this in production (use migrations instead).

---

### 2.4 Frontend — Registration Page

```
frontend/src/app/register/page.tsx
```

**Libraries used:**
- `react-hook-form` — manages form state and validation
- `zod` — schema validation (mirrors DTO rules on the client)
- `@hookform/resolvers/zod` — connects zod schema to react-hook-form
- `axios` — HTTP client

**Flow:**
```
User fills form
    ↓
react-hook-form + zod validates on submit (client-side, instant feedback)
    ↓
axios.post('/api/v1/auth/register', { full_name, email, gmail, password })
    ↓
On success → redirect to /login with success message
On error   → display error from server (email taken, etc.)
```

**Client-side validation vs server-side validation:** You validate on both. Client-side validation gives instant feedback without a network round trip. Server-side validation is the real enforcement — a user can bypass client validation with curl or Postman.

---

## 3. US-02 — User Login

> *As a registered user, I want to log in with my email and password so that I can access my account.*

### Acceptance Criteria
- System returns a JWT access token and refresh token on success
- Invalid credentials return an appropriate error message
- Refresh token rotates on each use

---

### 3.1 The Full Login Flow

```
POST /api/v1/auth/login
Body: { email, password }

1. Find user by email
   → If not found: throw UnauthorizedException('Invalid credentials')
   
2. bcrypt.compare(password, user.password_hash)
   → If false: throw UnauthorizedException('Invalid credentials')
   
3. Generate access token:
   jwtService.sign({ sub: user.user_id, email: user.email })
   → short-lived JWT, expires in 15 minutes
   
4. Generate refresh token:
   crypto.randomUUID()   ← 122 bits of randomness
   
5. Hash the refresh token with SHA-256 and store in DB
   (with expiry = now + 7 days)
   
6. Set refresh token as HTTP-only cookie on response
7. Return { access_token } in JSON body
```

---

### 3.2 Why SHA-256 for refresh tokens, bcrypt for passwords?

| | Password | Refresh Token |
|---|---|---|
| Origin | Human-chosen, short, guessable | `crypto.randomUUID()` — 122 bits random |
| Threat | Brute-force, dictionary, rainbow tables | Database breach |
| Hash | bcrypt (slow, salted) | SHA-256 (fast, deterministic) |
| Can query DB by hash? | No (salt makes it non-deterministic) | Yes |

Because the refresh token is randomly generated with enormous entropy, even if an attacker gets the SHA-256 hash from the DB, they cannot find the original token — there are 2¹²² possibilities. Bcrypt's slowness is not needed here.

Determinism matters for querying: `WHERE refresh_token_hash = sha256(incomingToken)` works because SHA-256 of the same input always produces the same output.

---

### 3.3 Token Rotation (the refresh endpoint)

```
POST /api/v1/auth/refresh
Cookie: refresh_token=<token>

1. Read refresh token from cookie
   → If missing: throw UnauthorizedException

2. SHA-256 hash the incoming token
   
3. Query DB: WHERE refresh_token_hash = ?
   → If not found or expired: throw UnauthorizedException
   
4. Generate a new access token + new refresh token (calls generateTokens())
   → This REPLACES the old refresh_token_hash in the DB (rotation)
   
5. Set new refresh token cookie
6. Return new { access_token }
```

**Why rotation protects you:** If an attacker steals a refresh token and uses it, the legitimate user's next refresh call will fail — the token was already consumed and a new one was issued. The mismatch is the detection signal. You can then invalidate the account and alert the user.

---

### 3.4 Passport.js and the JWT Strategy

Passport.js is an authentication middleware for Node.js. NestJS wraps it with `@nestjs/passport`. You define a "strategy" that tells Passport how to validate credentials.

```typescript
// backend/src/auth/strategies/jwt.strategy.ts
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
    constructor() {
        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            ignoreExpiration: false,
            secretOrKey: process.env.JWT_SECRET!,
        });
    }

    async validate(payload: { sub: string; email: string }) {
        return { userId: payload.sub, email: payload.email };
    }
}
```

**Why the `!` on `JWT_SECRET`?** TypeScript types every `process.env.*` as `string | undefined` — it can never know at compile time what your `.env` file contains. The `secretOrKey` option requires `string`, so passing `string | undefined` causes a type error. The `!` (non-null assertion) tells TypeScript: "I guarantee this is set at runtime." It has zero effect on the compiled JavaScript.

When `JwtAuthGuard` is applied to a route:
1. Passport extracts the token from `Authorization: Bearer <token>`
2. Verifies the signature against `JWT_SECRET`
3. Checks `exp` — rejects if expired
4. Calls `validate()` with the decoded payload
5. Attaches the return value to `req.user`

Your controller then accesses `req.user.userId` — no DB query needed.

---

### 3.5 The Auth Guard

```typescript
// backend/src/auth/guards/jwt-auth.guard.ts
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
```

Apply it to any route that requires authentication:

```typescript
@UseGuards(JwtAuthGuard)
@Get('profile')
getProfile(@Req() req) {
    return req.user; // { userId, email }
}
```

Without this guard, any request — authenticated or not — reaches your handler.

---

### 3.6 Wiring the Auth Module

```typescript
// backend/src/auth/auth.module.ts
@Module({
    imports: [
        TypeOrmModule.forFeature([User]),
        MailModule,
        PassportModule,
        JwtModule.registerAsync({
            imports: [ConfigModule],
            inject: [ConfigService],
            useFactory: (config: ConfigService) => ({
                secret: config.get<string>('JWT_SECRET'),
                signOptions: { expiresIn: '15m' },
            }),
        }),
    ],
    controllers: [AuthController],
    providers: [AuthService, JwtStrategy],
})
export class AuthModule { }
```

**Why `registerAsync` and not `register`?**

This is a real pitfall. `JwtModule.register({ secret: process.env.JWT_SECRET })` is evaluated synchronously when the module class is parsed. At that instant, `ConfigModule` may not have loaded `.env` yet, so `process.env.JWT_SECRET` is `undefined` — and every token signing call throws:

```
Error: secretOrPrivateKey must have a value
```

`registerAsync` defers configuration until NestJS's dependency injection has fully initialized all imports. By the time `useFactory` runs, `ConfigService` is ready and can safely return the secret.

This is the same pattern used by `TypeOrmModule.forRootAsync()` in `app.module.ts` — always use the async variant when your config depends on env vars.

---

### 3.7 Frontend — Login Page

```
frontend/src/app/login/page.tsx
```

**Where to store the access token on the frontend:**

| Location | Readable by JS? | Safe from XSS? | Safe from CSRF? |
|---|---|---|---|
| `localStorage` | Yes | No | Yes |
| Regular cookie | Yes | No | No |
| HTTP-only cookie | No | Yes | No |
| Memory (Zustand) | Yes | Yes | Yes |

Access token → **Zustand store (memory)**. It disappears on page refresh but gets silently renewed by the refresh token flow.
Refresh token → **HTTP-only cookie** (set by the server, invisible to JS).

**Zustand auth store:**

```typescript
// frontend/src/store/auth.store.ts
import { create } from 'zustand';

interface AuthState {
    accessToken: string | null;
    setAccessToken: (token: string) => void;
    clearAccessToken: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
    accessToken: null,
    setAccessToken: (token) => set({ accessToken: token }),
    clearAccessToken: () => set({ accessToken: null }),
}));
```

**Axios instance with token attachment and silent refresh:**

```typescript
// frontend/src/lib/axios.ts
import axios from 'axios';
import { useAuthStore } from '@/store/auth.store';

const api = axios.create({
    baseURL: 'http://localhost:3002/api/v1',
    withCredentials: true,   // sends the HTTP-only refresh token cookie cross-origin
});

// Attach access token to every request
api.interceptors.request.use((config) => {
    const token = useAuthStore.getState().accessToken;
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// Silent refresh on 401
api.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config;
        if (error.response?.status === 401 && !(originalRequest as any)._retry) {
            (originalRequest as any)._retry = true;
            try {
                const { data } = await api.post('/auth/refresh');
                useAuthStore.getState().setAccessToken(data.access_token);
                originalRequest.headers.Authorization = `Bearer ${data.access_token}`;
                return api(originalRequest);
            } catch {
                useAuthStore.getState().clearAccessToken();
                window.location.href = '/login';
            }
        }
        return Promise.reject(error);
    }
);

export default api;
```

**Three things to understand:**

**`withCredentials: true`** — Without this, the browser strips cookies from cross-origin requests (frontend on port 3001 → backend on port 3002). This flag tells the browser to include cookies. The backend must also have `credentials: true` in its CORS config:
```typescript
// backend/src/main.ts
app.enableCors({ origin: 'http://localhost:3001', credentials: true });
```

**`useAuthStore.getState()`** — Zustand hooks only work inside React components. Axios interceptors run outside any component, so `.getState()` is Zustand's escape hatch for non-React code.

**`(originalRequest as any)._retry`** — `_retry` is a custom flag not defined in axios's type definitions. `as any` bypasses the type check for this property only. This guards against infinite loops: if the refresh call itself returns 401, `_retry` prevents retrying the refresh again — the user is redirected to `/login` instead.

This interceptor catches every `401 Unauthorized` response, silently calls `/auth/refresh`, and retries the original request — completely transparent to the user.

---

## 4. US-03 — User Logout

> *As a logged-in user, I want to log out so that my session is terminated securely.*

### Acceptance Criteria
- Refresh token is invalidated on logout
- User is redirected to the login page

---

### 4.1 Theory — Why JWT logout is harder than it sounds

With traditional session-based auth, logout is simple: delete the session record from the database or Redis and the user is immediately locked out.

With stateless JWTs it's different. The server does not store the access token anywhere — it just issues it and trusts the signature. There is no list to check against, no session to delete. **Once an access token is issued, you cannot un-issue it.** It will be accepted by every protected endpoint until its `exp` timestamp passes.

This creates a dilemma:

| Token | Lives in | Can server invalidate? | Lifespan |
|---|---|---|---|
| Access token | JS memory (Zustand) | No — stateless | 15 minutes |
| Refresh token | HTTP-only cookie + DB (as hash) | **Yes** — stored in DB | 7 days |

The standard solution: **kill the refresh token in the DB**. The access token will still work for up to 15 minutes after logout — that is an accepted trade-off of stateless JWT auth. But once it expires, the attacker cannot get a new one because the refresh token is gone.

```
After logout:
  - Refresh token hash → NULL in DB
  - Access token → still cryptographically valid, but expires in ≤ 15 min
  - No new access tokens can be issued → session is effectively dead
```

If immediate invalidation is ever required (e.g. "lock this account now"), the solution is a Redis token blocklist — but that's out of scope for this sprint.

---

### 4.2 Backend — The logout endpoint

**Route:** `POST /api/v1/auth/logout`

This endpoint is **protected** — it requires a valid access token. Without the guard, anyone could call it and you'd have no way of knowing whose session to destroy.

```
POST /api/v1/auth/logout
Headers: Authorization: Bearer <access_token>

1. JwtAuthGuard verifies the JWT signature and expiry
2. JwtStrategy.validate() decodes payload → { sub: user_id, email }
3. NestJS attaches the result to req.user
4. Controller reads req.user.sub (the user_id)
5. AuthService.logout(userId) → UPDATE users SET refresh_token_hash = NULL,
                                                 refresh_token_expires_at = NULL
                                  WHERE user_id = ?
6. res.clearCookie('refresh_token', ...) → tells browser to delete the cookie
7. Return { message: 'Logged out successfully' }
```

#### Controller (`auth.controller.ts`)

```typescript
@Post('logout')
@HttpCode(HttpStatus.OK)
@UseGuards(JwtAuthGuard)           // ← requires valid Bearer token
async logout(
    @Req() req: Request & { user: { sub: string } },
    @Res({ passthrough: true }) res: Response,
) {
    await this.authService.logout(req.user.sub);   // sub = user_id from JWT payload
    res.clearCookie('refresh_token', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
    });
    return { message: 'Logged out successfully' };
}
```

**Three things to understand:**

**`@UseGuards(JwtAuthGuard)` before `@Post`** — decorator order matters in NestJS. The guard runs before the handler. If the token is missing or expired, the guard throws `401 Unauthorized` and your handler never executes.

**`req.user.sub`** — Passport attaches whatever `JwtStrategy.validate()` returns to `req.user`. Your strategy returns `{ userId: payload.sub, email: payload.email }` — but that was typed loosely. The `& { user: { sub: string } }` type cast in the parameter tells TypeScript the shape of the injected object so it doesn't complain about accessing `.sub`.

**`res.clearCookie(options)`** — The cookie options passed to `clearCookie` must exactly match those used when the cookie was set (`setRefreshCookie`). If they differ, the browser treats them as different cookies and the old one is not deleted. `httpOnly`, `secure`, and `sameSite` must all match.

#### Service (`auth.service.ts`)

```typescript
async logout(userId: string): Promise<{ message: string }> {
    await this.userRepository.update(userId, {
        refresh_token_hash: null,
        refresh_token_expires_at: null,
    });
    return { message: 'Logged out successfully' };
}
```

This is intentionally simple. TypeORM's `update()` runs:
```sql
UPDATE users SET refresh_token_hash = NULL, refresh_token_expires_at = NULL
WHERE user_id = $1
```

No lookup needed before the update — if the user doesn't exist, the update affects zero rows and that's fine. No error is thrown.

#### Entity fix required (`user.entity.ts`)

To pass `null` in the `update()` call above, the entity columns must be declared as nullable in three matching ways:

```typescript
@Column({ type: 'varchar', nullable: true })   // ① tell TypeORM the DB column allows NULL
refresh_token_hash: string | null;              // ② tell TypeScript null is a valid value

@Column({ type: 'timestamp', nullable: true })  // ① same for the expiry column
refresh_token_expires_at: Date | null;          // ②
```

**Why `type: 'varchar'` is required explicitly:**
TypeScript union types (`string | null`) compile down to `Object` in the `reflect-metadata` output that TypeORM reads at runtime to determine the SQL column type. If you write `@Column({ nullable: true })` without `type`, TypeORM sees `Object` and throws:

```
DataTypeNotSupportedError: Data type "Object" in "User.refresh_token_hash"
is not supported by "postgres" database.
```

The explicit `type: 'varchar'` bypasses the reflection and gives TypeORM the correct information directly.

---

### 4.3 Frontend — The logout button (`frontend/src/app/page.tsx`)

```typescript
'use client';

import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth.store';
import api from '@/lib/axios';

export default function LogoutButton() {
    const router = useRouter();
    const clearAccessToken = useAuthStore((s) => s.clearAccessToken);

    async function handleLogout() {
        try {
            await api.post('/auth/logout');     // kills refresh token in DB + clears cookie
        } catch {
            // Server may have already rejected the token — doesn't matter.
            // Client state must be cleared regardless.
        } finally {
            clearAccessToken();                 // wipes access token from Zustand store
            router.push('/login');              // redirect
        }
    }

    return (
        <button onClick={handleLogout}>
            Logout
        </button>
    );
}
```

**`'use client'`** — This directive is required at the top of any Next.js file that uses React hooks (`useRouter`, `useAuthStore`) or browser-only APIs. Files without it are treated as React Server Components, which cannot run hooks.

**`try / catch / finally` — why `finally`?**

The `finally` block runs regardless of whether the `try` succeeded or the `catch` handled an error. This is the key design decision:

```
Scenario A — happy path:
  api.post('/auth/logout') → 200 OK
  finally: clearAccessToken() + router.push('/login')   ✓

Scenario B — token already expired:
  api.post('/auth/logout') → 401 (access token expired)
  catch: (ignored)
  finally: clearAccessToken() + router.push('/login')   ✓ still logs out!

Scenario C — network error / server down:
  api.post('/auth/logout') → network error
  catch: (ignored)
  finally: clearAccessToken() + router.push('/login')   ✓ still logs out!
```

Without `finally`, a network error in scenario C would leave the user stuck — their access token in Zustand would remain, and they'd still appear logged in on the client even though they clicked Logout.

**`clearAccessToken()`** — this calls `set({ accessToken: null })` in the Zustand store. The axios request interceptor reads `useAuthStore.getState().accessToken` on every request — once it's `null`, no `Authorization` header is attached. The user is effectively unauthenticated from the frontend's perspective.

**Two-sided cleanup:**

| What gets cleaned | Where | Effect |
|---|---|---|
| `refresh_token_hash` | Database (via `POST /auth/logout`) | Cannot get new access tokens |
| `refresh_token` cookie | Browser (via `res.clearCookie`) | Cookie no longer sent to server |
| `accessToken` | Zustand store in JS memory | No Authorization header on requests |

---

### 4.4 Security Notes

**The 15-minute window.** After logout the access token is still cryptographically valid until it expires. If an attacker stole it before logout, they have up to 15 minutes of access. This is the fundamental trade-off of stateless JWT auth. Mitigation: keep access token TTL short (15 min is standard).

**Why the endpoint requires authentication.** The `@UseGuards(JwtAuthGuard)` requirement might seem odd — why does logging out need a valid token? Because the server needs to know *whose* `refresh_token_hash` to null. Without a token, it has no identity. An unauthenticated logout request would have nothing to clean up.

**What happens if the access token expired before logout?** The axios interceptor in `lib/axios.ts` catches the `401`, silently calls `/auth/refresh`, gets a new access token, and retries the `/auth/logout` call. The user never sees this — logout still works transparently even if their token had just expired.

---

### 4.5 The full flow

```
Browser                      NestJS Backend               PostgreSQL
   |                               |                           |
   | POST /api/v1/auth/logout      |                           |
   | Authorization: Bearer <JWT>   |                           |
   | Cookie: refresh_token=<tok>   |                           |
   |-----------------------------> |                           |
   |                          JwtAuthGuard                     |
   |                          verifies JWT signature + expiry  |
   |                          decodes payload → { sub, email } |
   |                          attaches to req.user             |
   |                               |                           |
   |                          AuthService.logout(req.user.sub) |
   |                               |--- UPDATE users --------> |
   |                               |    SET                    |
   |                               |    refresh_token_hash=NULL|
   |                               |    refresh_token_exp=NULL |
   |                               |    WHERE user_id=$1       |
   |                               | <------------------------ |
   |                               |                           |
   |                          res.clearCookie('refresh_token') |
   |                               |                           |
   | 200 { message: 'Logged out' } |                           |
   | Set-Cookie: refresh_token=;   |                           |
   |   Max-Age=0; HttpOnly         |                           |
   | <---------------------------- |                           |
   |                               |                           |
   | clearAccessToken()            |                           |
   | (Zustand → accessToken=null)  |                           |
   |                               |                           |
   | router.push('/login')         |                           |
```

---

## 5. US-04 — Password Reset

> *As a user who forgot their password, I want to receive a password reset email so that I can regain access to my account.*

### Acceptance Criteria
- Reset link is sent to the registered email
- Link expires after 30 minutes
- Password is updated successfully after reset

---

### 5.1 The two-step flow

**Step 1 — Request reset:**
```
POST /api/v1/auth/forgot-password
Body: { email }

1. Find user by email
   → If not found: return success anyway (don't reveal if email exists)
2. Generate a reset token: crypto.randomBytes(32).toString('hex')
3. Hash it (SHA-256) and store in DB with expiry = now + 30 min
4. Send email with link: {APP_URL}/reset-password?token=<plain_token>
5. Return { message: 'If this email is registered, a reset link was sent.' }
```

**Step 2 — Perform reset:**
```
POST /api/v1/auth/reset-password
Body: { token, newPassword }

1. SHA-256 hash the incoming token
2. Find user WHERE reset_token_hash = ? AND reset_token_expires_at > NOW()
   → If not found: throw BadRequestException('Invalid or expired token')
3. bcrypt.hash(newPassword, 10)
4. UPDATE user: password_hash = new hash, reset_token_hash = NULL, reset_token_expires_at = NULL
5. Also null out refresh_token_hash (force re-login on all devices)
6. Return { message: 'Password updated successfully' }
```

---

### 5.2 Entity columns needed

Add to the User entity for this user story:

```typescript
@Column({ nullable: true })
reset_token_hash: string;

@Column({ type: 'timestamptz', nullable: true })
reset_token_expires_at: Date;
```

---

### 5.3 Security notes

- **Don't reveal if an email exists** — return the same message whether the email is registered or not. This prevents attackers from using your password reset as an email enumeration tool.
- **Invalidate after use** — once the password is reset, null the token immediately so the link can't be reused.
- **Force re-login** — null the refresh token too, so any stolen sessions are terminated.
- **30-minute expiry** — as required by the acceptance criteria.

---

## 6. US-05 — Profile Management

> *As a logged-in user, I want to view and update my profile so that my information stays current.*

### Acceptance Criteria
- User can update name, bio, and profile photo
- Gmail field is visible but not editable after registration
- Changes are saved and reflected immediately

---

### 6.1 What this touches

This user story lives in the `users` module, not `auth`. The `auth` module handles authentication; `users` handles profile data.

```
GET  /api/v1/users/me        → returns authenticated user's profile
PATCH /api/v1/users/me       → updates name, bio, profile_photo_url
```

Both endpoints are protected with `@UseGuards(JwtAuthGuard)`.

---

### 6.2 Why Gmail is immutable

Gmail controls YouTube playlist access. Every enrollment triggers a YouTube Data API call to grant the student's Gmail address access to the course playlist. If Gmail were editable, a student could change it to steal playlist access under a different account or break their own access unexpectedly.

Implementation: simply exclude `gmail` from the `UpdateUserDto`. If the client sends `gmail`, `whitelist: true` in `ValidationPipe` strips it silently. The DB column has no special constraint — enforcement is by omission from the DTO.

---

### 6.3 UpdateUserDto

```typescript
// backend/src/users/dto/update-user.dto.ts
import { IsOptional, IsString, MaxLength, IsUrl } from 'class-validator';

export class UpdateUserDto {
    @IsOptional()
    @IsString()
    @MaxLength(100)
    full_name?: string;

    @IsOptional()
    @IsString()
    @MaxLength(500)
    bio?: string;

    @IsOptional()
    @IsUrl()
    profile_photo_url?: string;
}
```

All fields are `@IsOptional()` — a `PATCH` request updates only what's provided.

---

### 6.4 Entity additions

Add these columns to the User entity:

```typescript
@Column({ nullable: true, length: 500 })
bio: string;

@Column({ nullable: true })
profile_photo_url: string;
```

Profile photo upload (to S3/R2) is not needed until Sprint 3. For now, the URL is just stored as a string — a user could paste an external image URL.

---

### 6.5 Frontend — Profile Page

```
frontend/src/app/profile/page.tsx
```

**Flow:**
```
Page loads
    ↓
GET /api/v1/users/me → populate form with current values
    ↓
User edits name / bio
    ↓
PATCH /api/v1/users/me → save changes
    ↓
Show success toast, update displayed values
```

The Gmail field is rendered as a read-only `<input disabled>` or a plain `<p>` element — never inside the form's submit data.

---

## 7. How Everything Connects

Here is the complete picture of Sprint 1 from first request to database and back:

```
Browser                   NestJS                    PostgreSQL
  |                          |                           |
  |-- POST /auth/register -->|                           |
  |   { name,email,gmail,pw }|                           |
  |                     ValidationPipe                   |
  |                     AuthService.register()           |
  |                          |--- SELECT (check email) ->|
  |                          |--- SELECT (check gmail) ->|
  |                          |--- bcrypt.hash(pw) -------|
  |                          |--- INSERT users ---------->|
  |                          |--- sendEmail() ----------->| (Mailtrap)
  |<-- 201 { message } ------|                           |
  |                          |                           |
  |-- POST /auth/login ------>|                           |
  |   { email, password }     |                           |
  |                     AuthService.login()              |
  |                          |--- SELECT users ---------->|
  |                          |--- bcrypt.compare() ------|
  |                          |--- jwtService.sign() -----|
  |                          |--- crypto.randomUUID() ---|
  |                          |--- SHA-256 hash ----------|
  |                          |--- UPDATE refresh_token -->|
  |<-- 200 { access_token } -|                           |
  |    Cookie: refresh_token  |                           |
  |                          |                           |
  |-- GET /users/me ----------|                           |
  |   Authorization: Bearer . |                           |
  |                     JwtAuthGuard                     |
  |                     JwtStrategy.validate()           |
  |                     UsersService.findMe()            |
  |                          |--- SELECT users ---------->|
  |<-- 200 { user profile } -|                           |
```

---

## Module Wiring Summary

```
AppModule
├── ConfigModule (global — loads .env)
├── TypeOrmModule (global — PostgreSQL connection)
├── AuthModule
│   ├── imports: TypeOrmModule[User], MailModule, PassportModule, JwtModule
│   ├── controllers: AuthController
│   └── providers: AuthService, JwtStrategy
├── UsersModule
│   ├── imports: TypeOrmModule[User]
│   ├── controllers: UsersController
│   └── providers: UsersService
└── MailModule
    └── providers: MailService
```

---

## Packages Used in Sprint 1

| Package | Purpose |
|---|---|
| `@nestjs/jwt` | `JwtService` — sign and verify JWTs |
| `@nestjs/passport` | NestJS wrapper for Passport.js |
| `passport` | Authentication middleware framework |
| `passport-jwt` | Passport strategy for JWT validation |
| `bcrypt` | Password hashing |
| `cookie-parser` | Parse cookies from incoming requests |
| `class-validator` | DTO validation decorators |
| `class-transformer` | DTO deserialization |
| `nodemailer` | Send emails (via Mailtrap in dev) |

---

## Key Security Rules (Commit These to Memory)

1. **Never store plain passwords** — always `bcrypt.hash()`
2. **Never reveal if an email exists** — use `'Invalid credentials'` for both wrong email and wrong password
3. **Refresh tokens in HTTP-only cookies** — invisible to JavaScript
4. **Access tokens in memory** — not in `localStorage`
5. **Short access token lifetime** — 15 minutes limits the damage of a stolen token
6. **Rotate refresh tokens** — detect theft through token reuse
7. **Invalidate refresh token on logout** — terminate all sessions cleanly
8. **Null reset tokens after use** — prevent link reuse
9. **`whitelist: true` on ValidationPipe** — strip unexpected fields from every request
10. **Gmail is immutable** — it drives YouTube playlist access; never allow it to change
