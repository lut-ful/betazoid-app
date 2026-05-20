import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';

/**
 * US-08 — Assign Role to User
 *
 * AC1: Super Admin can search for a user and assign roles
 * AC2: User can hold multiple roles simultaneously
 * AC3: Access changes apply on the user's next request
 *
 * Seed strategy:
 *   - Reuse the existing "Super Admin" role (created in US-06) — never modify or delete it
 *   - Create a test-only role "US08_Test_Role" that is deleted in afterAll
 *   - All test users use email suffix @e2e08.test for easy bulk cleanup
 */
describe('US-08 — Assign Role to User (e2e)', () => {
    let app: INestApplication;
    let ds: DataSource;

    let superAdminId: string;
    let regularUserId: string;
    let thirdUserId: string;
    let superAdminRoleId: string;   // pre-existing "Super Admin" role — reused, not deleted
    let testRoleId: string;          // "US08_Test_Role" — created and deleted by this suite

    let superAdminToken: string;
    let regularUserToken: string;

    // ── Setup ──────────────────────────────────────────────────────────────────

    beforeAll(async () => {
        const moduleFixture: TestingModule = await Test.createTestingModule({
            imports: [AppModule],
        }).compile();

        app = moduleFixture.createNestApplication();
        app.use(cookieParser());
        app.setGlobalPrefix('api/v1');
        app.useGlobalPipes(
            new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
        );
        await app.init();

        ds = moduleFixture.get(DataSource);

        // Pre-cleanup: remove any leftover data from a previously failed run
        await ds.query(`DELETE FROM users WHERE email LIKE '%@e2e08.test'`);
        await ds.query(`DELETE FROM roles WHERE name = 'US08_Test_Role'`);

        // Look up the pre-existing "Super Admin" role — do not create a duplicate
        const [adminRole] = await ds.query(
            `SELECT role_id FROM roles WHERE name = 'Super Admin'`,
        );
        if (!adminRole) throw new Error('Super Admin role not found — run US-06 first');
        superAdminRoleId = adminRole.role_id;

        // Create a test-only second role
        [{ role_id: testRoleId }] = await ds.query(
            `INSERT INTO roles (name) VALUES ('US08_Test_Role') RETURNING role_id`,
        );

        // Seed test users
        const hash = await bcrypt.hash('Test1234!', 10);

        [{ user_id: superAdminId }] = await ds.query(
            `INSERT INTO users (full_name, email, gmail, password_hash, is_email_verified)
             VALUES ('Super Admin User', 'sad@e2e08.test', 'sad@gmail.e2e08', $1, true)
             RETURNING user_id`,
            [hash],
        );
        [{ user_id: regularUserId }] = await ds.query(
            `INSERT INTO users (full_name, email, gmail, password_hash, is_email_verified)
             VALUES ('John Doe', 'john@e2e08.test', 'john@gmail.e2e08', $1, true)
             RETURNING user_id`,
            [hash],
        );
        [{ user_id: thirdUserId }] = await ds.query(
            `INSERT INTO users (full_name, email, gmail, password_hash, is_email_verified)
             VALUES ('Jane Smith', 'jane@e2e08.test', 'jane@gmail.e2e08', $1, true)
             RETURNING user_id`,
            [hash],
        );

        // Give the test Super Admin user their role
        await ds.query(
            `INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)`,
            [superAdminId, superAdminRoleId],
        );

        // Obtain JWTs
        const sadRes = await request(app.getHttpServer())
            .post('/api/v1/auth/login')
            .send({ email: 'sad@e2e08.test', password: 'Test1234!' });
        superAdminToken = sadRes.body.access_token;

        const regRes = await request(app.getHttpServer())
            .post('/api/v1/auth/login')
            .send({ email: 'john@e2e08.test', password: 'Test1234!' });
        regularUserToken = regRes.body.access_token;
    });

    afterAll(async () => {
        // Deleting users cascades their user_roles rows
        await ds.query(
            `DELETE FROM users WHERE email LIKE '%@e2e08.test'`,
        );
        // Delete only the role this suite created
        await ds.query(`DELETE FROM roles WHERE name = 'US08_Test_Role'`);
        await app.close();
    });

    // ── GET /api/v1/roles/users ────────────────────────────────────────────────

    describe('GET /api/v1/roles/users', () => {
        it('401 — no token', () =>
            request(app.getHttpServer())
                .get('/api/v1/roles/users')
                .expect(401));

        it('403 — authenticated but not Super Admin', () =>
            request(app.getHttpServer())
                .get('/api/v1/roles/users')
                .set('Authorization', `Bearer ${regularUserToken}`)
                .expect(403));

        it('200 — returns all users when no search param is given', async () => {
            const { body } = await request(app.getHttpServer())
                .get('/api/v1/roles/users')
                .set('Authorization', `Bearer ${superAdminToken}`)
                .expect(200);

            expect(Array.isArray(body)).toBe(true);
            const emails = body.map((u: any) => u.email);
            expect(emails).toContain('sad@e2e08.test');
            expect(emails).toContain('john@e2e08.test');
            expect(emails).toContain('jane@e2e08.test');
        });

        it('200 — Super Admin user has their role included in userRoles', async () => {
            const { body } = await request(app.getHttpServer())
                .get('/api/v1/roles/users?search=sad@e2e08')
                .set('Authorization', `Bearer ${superAdminToken}`)
                .expect(200);

            const user = body.find((u: any) => u.email === 'sad@e2e08.test');
            expect(user).toBeDefined();
            expect(Array.isArray(user.userRoles)).toBe(true);
            expect(user.userRoles).toHaveLength(1);
            expect(user.userRoles[0].role.name).toBe('Super Admin');
        });

        it('200 — does not expose sensitive fields (password_hash, refresh_token_hash)', async () => {
            const { body } = await request(app.getHttpServer())
                .get('/api/v1/roles/users?search=john@e2e08')
                .set('Authorization', `Bearer ${superAdminToken}`)
                .expect(200);

            const user = body.find((u: any) => u.email === 'john@e2e08.test');
            expect(user).toBeDefined();
            expect(user.password_hash).toBeUndefined();
            expect(user.refresh_token_hash).toBeUndefined();
            expect(user.reset_password_token).toBeUndefined();
        });

        it('200 — search by full name is case-insensitive', async () => {
            const { body } = await request(app.getHttpServer())
                .get('/api/v1/roles/users?search=jane')
                .set('Authorization', `Bearer ${superAdminToken}`)
                .expect(200);

            expect(body.some((u: any) => u.email === 'jane@e2e08.test')).toBe(true);
        });

        it('200 — search by email fragment', async () => {
            const { body } = await request(app.getHttpServer())
                .get('/api/v1/roles/users?search=john@e2e08')
                .set('Authorization', `Bearer ${superAdminToken}`)
                .expect(200);

            expect(body.some((u: any) => u.email === 'john@e2e08.test')).toBe(true);
        });

        it('200 — returns empty array when search matches nothing', async () => {
            const { body } = await request(app.getHttpServer())
                .get('/api/v1/roles/users?search=zzznomatch99999')
                .set('Authorization', `Bearer ${superAdminToken}`)
                .expect(200);

            expect(body).toEqual([]);
        });
    });

    // ── PUT /api/v1/roles/users/:userId/roles ─────────────────────────────────

    describe('PUT /api/v1/roles/users/:userId/roles', () => {
        it('401 — no token', () =>
            request(app.getHttpServer())
                .put(`/api/v1/roles/users/${regularUserId}/roles`)
                .send({ roleIds: [] })
                .expect(401));

        it('403 — authenticated but not Super Admin', () =>
            request(app.getHttpServer())
                .put(`/api/v1/roles/users/${regularUserId}/roles`)
                .set('Authorization', `Bearer ${regularUserToken}`)
                .send({ roleIds: [] })
                .expect(403));

        it('400 — non-UUID userId param', () =>
            request(app.getHttpServer())
                .put('/api/v1/roles/users/not-a-uuid/roles')
                .set('Authorization', `Bearer ${superAdminToken}`)
                .send({ roleIds: [] })
                .expect(400));

        it('400 — roleIds contains a non-UUID value', () =>
            request(app.getHttpServer())
                .put(`/api/v1/roles/users/${regularUserId}/roles`)
                .set('Authorization', `Bearer ${superAdminToken}`)
                .send({ roleIds: ['not-a-uuid'] })
                .expect(400));

        it('400 — roleIds field is missing from body', () =>
            request(app.getHttpServer())
                .put(`/api/v1/roles/users/${regularUserId}/roles`)
                .set('Authorization', `Bearer ${superAdminToken}`)
                .send({})
                .expect(400));

        it('404 — user does not exist', () =>
            request(app.getHttpServer())
                .put('/api/v1/roles/users/00000000-0000-0000-0000-000000000000/roles')
                .set('Authorization', `Bearer ${superAdminToken}`)
                .send({ roleIds: [] })
                .expect(404));

        it('404 — a roleId does not exist', () =>
            request(app.getHttpServer())
                .put(`/api/v1/roles/users/${regularUserId}/roles`)
                .set('Authorization', `Bearer ${superAdminToken}`)
                // Use a well-formed UUID v4 (version=4, variant=b) that won't exist in the DB
                .send({ roleIds: ['ffffffff-ffff-4fff-bfff-ffffffffffff'] })
                .expect(404));

        it('200 — assigns a single role to the user (AC1)', async () => {
            await request(app.getHttpServer())
                .put(`/api/v1/roles/users/${regularUserId}/roles`)
                .set('Authorization', `Bearer ${superAdminToken}`)
                .send({ roleIds: [testRoleId] })
                .expect(200);

            const [{ count }] = await ds.query(
                `SELECT COUNT(*)::int AS count FROM user_roles
                 WHERE user_id = $1 AND role_id = $2`,
                [regularUserId, testRoleId],
            );
            expect(count).toBe(1);
        });

        it('200 — user holds multiple roles simultaneously (AC2)', async () => {
            await request(app.getHttpServer())
                .put(`/api/v1/roles/users/${regularUserId}/roles`)
                .set('Authorization', `Bearer ${superAdminToken}`)
                .send({ roleIds: [testRoleId, superAdminRoleId] })
                .expect(200);

            const [{ count }] = await ds.query(
                `SELECT COUNT(*)::int AS count FROM user_roles WHERE user_id = $1`,
                [regularUserId],
            );
            expect(count).toBe(2);
        });

        it('200 — second call replaces roles, not additive', async () => {
            // User currently has 2 roles — reassign to only the test role
            await request(app.getHttpServer())
                .put(`/api/v1/roles/users/${regularUserId}/roles`)
                .set('Authorization', `Bearer ${superAdminToken}`)
                .send({ roleIds: [testRoleId] })
                .expect(200);

            const [{ count }] = await ds.query(
                `SELECT COUNT(*)::int AS count FROM user_roles WHERE user_id = $1`,
                [regularUserId],
            );
            expect(count).toBe(1);
        });

        it('200 — empty roleIds clears all roles', async () => {
            await request(app.getHttpServer())
                .put(`/api/v1/roles/users/${regularUserId}/roles`)
                .set('Authorization', `Bearer ${superAdminToken}`)
                .send({ roleIds: [] })
                .expect(200);

            const [{ count }] = await ds.query(
                `SELECT COUNT(*)::int AS count FROM user_roles WHERE user_id = $1`,
                [regularUserId],
            );
            expect(count).toBe(0);
        });

        it('AC3 — access changes apply on the very next request after role assignment', async () => {
            // regularUser has no roles — Super Admin endpoint returns 403
            await request(app.getHttpServer())
                .get('/api/v1/roles/users')
                .set('Authorization', `Bearer ${regularUserToken}`)
                .expect(403);

            // Assign Super Admin role
            await request(app.getHttpServer())
                .put(`/api/v1/roles/users/${regularUserId}/roles`)
                .set('Authorization', `Bearer ${superAdminToken}`)
                .send({ roleIds: [superAdminRoleId] })
                .expect(200);

            // The very next request now succeeds — no server restart needed
            await request(app.getHttpServer())
                .get('/api/v1/roles/users')
                .set('Authorization', `Bearer ${regularUserToken}`)
                .expect(200);

            // Restore: clear roles so state is clean for afterAll
            await request(app.getHttpServer())
                .put(`/api/v1/roles/users/${regularUserId}/roles`)
                .set('Authorization', `Bearer ${superAdminToken}`)
                .send({ roleIds: [] })
                .expect(200);
        });
    });
});
