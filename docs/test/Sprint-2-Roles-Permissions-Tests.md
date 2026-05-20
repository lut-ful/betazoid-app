# Sprint 2 — Role & Permission Management — Test Guide

**User Stories covered:** US-06 · US-07 · US-08 · US-09 · US-10
**Tested by:** Human tester using Postman (backend) and a browser (frontend)

---

## Overview

Sprint 2 builds the full dynamic RBAC system. You will verify that a Super Admin
can create roles, assign permissions to roles, assign roles to users, edit and
delete roles, and that the API correctly blocks requests from users who lack the
required permission. No code knowledge is required — follow each step exactly
as written.

---

## Prerequisites

Before running any test, confirm the following are all running:

- [ ] **Backend** — `http://localhost:3002` responds (open it in the browser; you should see `{"message":"Cannot GET /"}`)
- [ ] **Frontend** — `http://localhost:3000` shows the Betazoid home page
- [ ] **PostgreSQL** — run `docker compose up -d postgres` from the project root if not already started
- [ ] **Redis** — run `docker compose up -d redis` from the project root
- [ ] **Postman** — installed and open (any version; the free plan is sufficient)
- [ ] **A Super Admin account** — you must have registered a user and given it the Super Admin role in the database (see the bootstrap note at the end of this document if you have not done this yet)

---

## Environment Setup — Postman

Create a Postman **Environment** named **`Betazoid Local`** with the following variables.
You will set `access_token` during Test Suite 0 and reuse it for all protected requests.

| Variable         | Initial Value             | Notes                                |
| ---------------- | ------------------------- | ------------------------------------ |
| `base_url`     | `http://localhost:3002` | Backend API root                     |
| `frontend_url` | `http://localhost:3000` | Frontend root                        |
| `access_token` | *(leave blank)*         | Set after login in Test Suite 0      |
| `role_id`      | *(leave blank)*         | Set after creating a role in Suite 1 |
| `user_id`      | *(leave blank)*         | Set to a test user's UUID in Suite 3 |

**How to create the environment:**

1. In Postman, click the **Environments** tab on the left sidebar
2. Click **+** (New Environment)
3. Name it `Betazoid Local`
4. Add each variable in the table above
5. Click **Save**
6. Select `Betazoid Local` from the environment dropdown in the top-right corner of Postman

---

## Environment Setup — Browser

- Open **`http://localhost:3000`** in Chrome or Firefox
- Keep the browser **DevTools** open (F12 → Network tab) to observe API calls and status codes
- Use **one browser tab** for the Super Admin session throughout the sprint tests
- Keep **a second incognito tab** ready for testing non-admin user behaviour (Suite 5)

---

## Test Suite 0 — Authentication Setup

> **Run this first.** Every subsequent test requires the `access_token` variable
> to be set. Complete Suite 0 before moving to Suite 1.

### Test B0.1 — Login as Super Admin (get access token)

| Field       | Value                                                                         |
| ----------- | ----------------------------------------------------------------------------- |
| Method      | `POST`                                                                      |
| URL         | `{{base_url}}/api/v1/auth/login`                                            |
| Headers     | `Content-Type: application/json`                                            |
| Body (JSON) | `{ "email": "your-super-admin@example.com", "password": "YourPassword1!" }` |

**Steps:**

1. In Postman, create a new request
2. Set the method to **POST**
3. Enter the URL: `{{base_url}}/api/v1/auth/login`
4. Click the **Headers** tab → add `Content-Type` = `application/json`
5. Click the **Body** tab → select **raw** → select **JSON**
6. Paste the body, replacing the email and password with your Super Admin credentials
7. Click **Send**

**Expected response:**

- Status: **200 OK**
- Body:

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**After success:**

1. Copy the full value of `access_token` from the response
2. In Postman, open your `Betazoid Local` environment
3. Paste the token into the **Current Value** field of `access_token`
4. Click **Save**

All authenticated requests in this guide use `Authorization: Bearer {{access_token}}`.

**If you see 401 instead:**

- Cause: Wrong email or password
- Fix: Double-check your credentials. If you forgot the password, use `POST /api/v1/auth/forgot-password`.

**If you see 400 instead:**

- Cause: Missing or malformed JSON body
- Fix: Confirm the Body tab is set to **raw / JSON** and the JSON is valid (no trailing commas).

---

## Test Suite 1 — US-06: Create Role

### 1.1 What this test covers

US-06 lets a Super Admin create a new role with a name and optional description.
You will verify that a valid role is created (201), that duplicate names are rejected (409),
and that the role immediately appears in the list returned by the GET endpoint.

---

### 1.2 Backend Tests (Postman)

#### Test B1.1 — Create a new role (happy path)

| Field       | Value                                                                          |
| ----------- | ------------------------------------------------------------------------------ |
| Method      | `POST`                                                                       |
| URL         | `{{base_url}}/api/v1/roles`                                                  |
| Headers     | `Content-Type: application/json`, `Authorization: Bearer {{access_token}}` |
| Body (JSON) | `{ "name": "Moderator", "description": "Reviews and approves courses" }`     |

**Steps:**

1. Create a new Postman request
2. Set method to **POST**, URL to `{{base_url}}/api/v1/roles`
3. Add headers: `Content-Type: application/json` and `Authorization: Bearer {{access_token}}`
4. Body → raw → JSON → paste the body above
5. Click **Send**

**Expected response:**

- Status: **201 Created**
- Body:

```json
{
  "role_id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "name": "Moderator",
  "description": "Reviews and approves courses",
  "created_at": "2026-...",
  "updated_at": "2026-..."
}
```

**After success:**

- Copy the `role_id` value from the response
- Paste it into the `role_id` variable in your `Betazoid Local` environment
- You will use `{{role_id}}` in Tests B1.3, B2.x, B4.x

---

#### Test B1.2 — Create role with duplicate name (expect 409)

| Field       | Value                                                                          |
| ----------- | ------------------------------------------------------------------------------ |
| Method      | `POST`                                                                       |
| URL         | `{{base_url}}/api/v1/roles`                                                  |
| Headers     | `Content-Type: application/json`, `Authorization: Bearer {{access_token}}` |
| Body (JSON) | `{ "name": "Moderator" }`                                                    |

**Steps:** Same as B1.1, but send the request a second time with the same name.

**Expected response:**

- Status: **409 Conflict**
- Body:

```json
{
  "message": "A role with this name already exists",
  "error": "Conflict",
  "statusCode": 409
}
```

---

#### Test B1.3 — Create role with missing name (expect 400)

| Field       | Value                                                                          |
| ----------- | ------------------------------------------------------------------------------ |
| Method      | `POST`                                                                       |
| URL         | `{{base_url}}/api/v1/roles`                                                  |
| Headers     | `Content-Type: application/json`, `Authorization: Bearer {{access_token}}` |
| Body (JSON) | `{ "description": "No name provided" }`                                      |

**Expected response:**

- Status: **400 Bad Request**
- Body contains a `message` array with a validation error about `name`

---

#### Test B1.4 — List all roles

| Field   | Value                                      |
| ------- | ------------------------------------------ |
| Method  | `GET`                                    |
| URL     | `{{base_url}}/api/v1/roles`              |
| Headers | `Authorization: Bearer {{access_token}}` |
| Body    | *(none)*                                 |

**Expected response:**

- Status: **200 OK**
- Body: array of role objects; the "Moderator" role created in B1.1 must appear
- Each role includes a `userCount` integer field

---

#### Test B1.5 — Access roles without a token (expect 401)

| Field   | Value                                 |
| ------- | ------------------------------------- |
| Method  | `GET`                               |
| URL     | `{{base_url}}/api/v1/roles`         |
| Headers | *(none — no Authorization header)* |

**Expected response:**

- Status: **401 Unauthorized**

---

### 1.3 Frontend Tests (Browser UI)

#### Test F1.1 — Create a role through the UI

**Steps:**

1. Open `http://localhost:3000/login` — log in with your Super Admin credentials
2. Navigate to `http://localhost:3000/admin/roles`
3. In the **Create Role** card, type `Instructor` in the **Role Name** field
4. Type `Teaches courses on the platform` in the **Description** field
5. Click **Create Role**

**Expected result:**

- The button shows "Creating..." briefly
- The text "Role created successfully." appears below the form
- The form clears
- The "All Roles" card below immediately shows the new "Instructor" role with `0 users assigned`

---

#### Test F1.2 — Submit empty role name (expect validation error)

**Steps:**

1. On `http://localhost:3000/admin/roles`, leave the **Role Name** field empty
2. Click **Create Role**

**Expected result:**

- The form does not submit
- The message "Role name is required" appears in red below the Role Name field
- No API call is made (check DevTools Network tab — no POST request appears)

---

#### Test F1.3 — Create role with duplicate name (expect error in UI)

**Steps:**

1. In the Role Name field, type `Moderator` (the same name created in B1.1)
2. Click **Create Role**

**Expected result:**

- The message "A role with this name already exists" appears in red below the button
- The "All Roles" list is unchanged (no duplicate appears)

---

## Test Suite 2 — US-07: Assign Permissions to Role

### 2.1 What this test covers

US-07 lets a Super Admin assign any combination of the platform's permissions to
a role. You will verify that you can read the full permission catalogue, read a
role's current permissions, save a new set (replacing the old one), and remove all
permissions by sending an empty array.

---

### 2.2 Backend Tests (Postman)

#### Test B2.1 — List all permissions

| Field   | Value                                      |
| ------- | ------------------------------------------ |
| Method  | `GET`                                    |
| URL     | `{{base_url}}/api/v1/permissions`        |
| Headers | `Authorization: Bearer {{access_token}}` |

**Expected response:**

- Status: **200 OK**
- Body: array of 44+ permission objects, each with `permission_id` and `name` (e.g. `"read:permissions"`)
- Array is sorted alphabetically by `name`

**After success:**

- Locate `"read:permissions"` in the list and copy its `permission_id`
- You will use it in Test B2.3

---

#### Test B2.2 — Get a role's current permissions

| Field   | Value                                                 |
| ------- | ----------------------------------------------------- |
| Method  | `GET`                                               |
| URL     | `{{base_url}}/api/v1/roles/{{role_id}}/permissions` |
| Headers | `Authorization: Bearer {{access_token}}`            |

> Use the `role_id` saved from Test B1.1.

**Expected response:**

- Status: **200 OK**
- Body: the role object with a `permissions` array — it will be empty `[]` for a freshly created role

---

#### Test B2.3 — Assign a permission to the role

| Field       | Value                                                                          |
| ----------- | ------------------------------------------------------------------------------ |
| Method      | `PUT`                                                                        |
| URL         | `{{base_url}}/api/v1/roles/{{role_id}}/permissions`                          |
| Headers     | `Content-Type: application/json`, `Authorization: Bearer {{access_token}}` |
| Body (JSON) | `{ "permissionIds": ["<paste the read:permissions UUID from B2.1 here>"] }`  |

**Steps:**

1. Replace the placeholder with the actual UUID of `read:permissions` from B2.1
2. Send the request

**Expected response:**

- Status: **200 OK**
- Body: the role object with `permissions` now containing `read:permissions`

---

#### Test B2.4 — Replace permissions with a different set

| Field       | Value                                                                           |
| ----------- | ------------------------------------------------------------------------------- |
| Method      | `PUT`                                                                         |
| URL         | `{{base_url}}/api/v1/roles/{{role_id}}/permissions`                           |
| Headers     | `Content-Type: application/json`, `Authorization: Bearer {{access_token}}`  |
| Body (JSON) | `{ "permissionIds": ["<UUID of create:courses>", "<UUID of read:courses>"] }` |

> Get the UUIDs for `create:courses` and `read:courses` from the list in B2.1.

**Expected response:**

- Status: **200 OK**
- Body: `permissions` array now contains exactly `create:courses` and `read:courses`
- `read:permissions` is gone (full replace, not merge)

---

#### Test B2.5 — Remove all permissions from a role

| Field       | Value                                                                          |
| ----------- | ------------------------------------------------------------------------------ |
| Method      | `PUT`                                                                        |
| URL         | `{{base_url}}/api/v1/roles/{{role_id}}/permissions`                          |
| Headers     | `Content-Type: application/json`, `Authorization: Bearer {{access_token}}` |
| Body (JSON) | `{ "permissionIds": [] }`                                                    |

**Expected response:**

- Status: **200 OK**
- Body: role with `permissions: []`

---

#### Test B2.6 — Get permissions for a non-existent role (expect 404)

| Field   | Value                                                                          |
| ------- | ------------------------------------------------------------------------------ |
| Method  | `GET`                                                                        |
| URL     | `{{base_url}}/api/v1/roles/00000000-0000-0000-0000-000000000000/permissions` |
| Headers | `Authorization: Bearer {{access_token}}`                                     |

**Expected response:**

- Status: **404 Not Found**

---

### 2.3 Frontend Tests (Browser UI)

#### Test F2.1 — Open the permissions page for a role

**Steps:**

1. Navigate to `http://localhost:3000/admin/roles`
2. Find the "Moderator" role in the list
3. Click the **Permissions** button next to it

**Expected result:**

- Browser navigates to `/admin/roles/<role_id>/permissions`
- The page title shows "Permissions — Moderator"
- The page displays checkboxes grouped by module (categories, certificates, coupons, courses…)
- All checkboxes are unchecked (the role has no permissions yet from B2.5)

---

#### Test F2.2 — Assign permissions via checkboxes

**Steps:**

1. On the permissions page for "Moderator"
2. Find the **courses** group
3. Check the **read** and **publish** checkboxes
4. Find the **reviews** group
5. Check the **read** and **delete** checkboxes
6. Click **Save Permissions**

**Expected result:**

- Button shows "Saving..." briefly
- The text "Permissions saved successfully." appears
- Refreshing the page (F5) shows the same four checkboxes still checked
- All other checkboxes remain unchecked

---

#### Test F2.3 — Remove all permissions

**Steps:**

1. On the permissions page for "Moderator"
2. Uncheck every checkbox that is currently checked
3. Click **Save Permissions**

**Expected result:**

- "Permissions saved successfully." appears
- Refreshing the page shows all checkboxes unchecked

---

#### Test F2.4 — Navigate back to roles list

**Steps:**

1. Click **← Back to Roles**

**Expected result:**

- Browser navigates back to `/admin/roles`
- The roles list is still visible with all roles intact

---

## Test Suite 3 — US-08: Assign Role to User

### 3.1 What this test covers

US-08 lets a Super Admin search for any user and assign one or more roles to them.
You will verify user search (by name and email), role assignment, multi-role assignment,
and that revoked roles take effect immediately.

---

### 3.2 Backend Tests (Postman)

#### Test B3.1 — Search all users (no filter)

| Field   | Value                                      |
| ------- | ------------------------------------------ |
| Method  | `GET`                                    |
| URL     | `{{base_url}}/api/v1/roles/users`        |
| Headers | `Authorization: Bearer {{access_token}}` |

**Expected response:**

- Status: **200 OK**
- Body: array of up to 50 users, each with `user_id`, `full_name`, `email`, and `userRoles`
- `password_hash` is **not** present in any user object — verify this

**After success:**

- Find a user who does NOT have the Super Admin role
- Copy their `user_id` and save it into the `user_id` variable in your Postman environment

---

#### Test B3.2 — Search users by name

| Field   | Value                                           |
| ------- | ----------------------------------------------- |
| Method  | `GET`                                         |
| URL     | `{{base_url}}/api/v1/roles/users?search=test` |
| Headers | `Authorization: Bearer {{access_token}}`      |

**Expected response:**

- Status: **200 OK**
- Body: only users whose `full_name` or `email` contains "test" (case-insensitive)

---

#### Test B3.3 — Assign a role to a user

| Field       | Value                                                                          |
| ----------- | ------------------------------------------------------------------------------ |
| Method      | `PUT`                                                                        |
| URL         | `{{base_url}}/api/v1/roles/users/{{user_id}}/roles`                          |
| Headers     | `Content-Type: application/json`, `Authorization: Bearer {{access_token}}` |
| Body (JSON) | `{ "roleIds": ["{{role_id}}"] }`                                             |

> Use the `user_id` saved from B3.1 and the `role_id` from B1.1.

**Expected response:**

- Status: **200 OK**
- Body: *(empty — the response has no body for this operation)*

**Verify the assignment took effect:**

- Re-run Test B3.1 (GET `/roles/users`)
- Find the user by `user_id`
- Their `userRoles` array should now contain the "Moderator" role

---

#### Test B3.4 — Assign multiple roles to a user

| Field       | Value                                                                          |
| ----------- | ------------------------------------------------------------------------------ |
| Method      | `PUT`                                                                        |
| URL         | `{{base_url}}/api/v1/roles/users/{{user_id}}/roles`                          |
| Headers     | `Content-Type: application/json`, `Authorization: Bearer {{access_token}}` |
| Body (JSON) | `{ "roleIds": ["{{role_id}}", "<Super Admin role_id>"] }`                    |

> Get the Super Admin `role_id` from the GET `/roles` response (Test B1.4).

**Expected response:**

- Status: **200 OK**
- Verify with GET `/roles/users`: the user now has two roles

---

#### Test B3.5 — Remove all roles from a user

| Field       | Value                                                                          |
| ----------- | ------------------------------------------------------------------------------ |
| Method      | `PUT`                                                                        |
| URL         | `{{base_url}}/api/v1/roles/users/{{user_id}}/roles`                          |
| Headers     | `Content-Type: application/json`, `Authorization: Bearer {{access_token}}` |
| Body (JSON) | `{ "roleIds": [] }`                                                          |

**Expected response:**

- Status: **200 OK**
- Verify with GET `/roles/users`: the user's `userRoles` is now `[]`

---

#### Test B3.6 — Assign role to a non-existent user (expect 404)

| Field       | Value                                                                          |
| ----------- | ------------------------------------------------------------------------------ |
| Method      | `PUT`                                                                        |
| URL         | `{{base_url}}/api/v1/roles/users/00000000-0000-0000-0000-000000000000/roles` |
| Headers     | `Content-Type: application/json`, `Authorization: Bearer {{access_token}}` |
| Body (JSON) | `{ "roleIds": [] }`                                                          |

**Expected response:**

- Status: **404 Not Found**
- Message: `"User not found"`

---

#### Test B3.7 — Assign a non-existent role (expect 404)

| Field       | Value                                                                          |
| ----------- | ------------------------------------------------------------------------------ |
| Method      | `PUT`                                                                        |
| URL         | `{{base_url}}/api/v1/roles/users/{{user_id}}/roles`                          |
| Headers     | `Content-Type: application/json`, `Authorization: Bearer {{access_token}}` |
| Body (JSON) | `{ "roleIds": ["00000000-0000-0000-0000-000000000000"] }`                    |

**Expected response:**

- Status: **404 Not Found**
- Message: `"One or more roles not found"`

---

### 3.3 Frontend Tests (Browser UI)

#### Test F3.1 — View all users

**Steps:**

1. Navigate to `http://localhost:3000/admin/users`

**Expected result:**

- A list of users appears, each showing full name, email, and current roles
- Each row has an **Assign Roles** button

---

#### Test F3.2 — Search for a user by name

**Steps:**

1. In the **Search Users** box, type a partial name (e.g. the first few letters of a known user)

**Expected result:**

- The list updates as you type
- Only users matching the typed string appear

---

#### Test F3.3 — Assign a role to a user via UI

**Steps:**

1. Find a user without the "Moderator" role in the list
2. Click **Assign Roles** next to that user

**Expected result:**

- A second card appears below: "Assign Roles — [User Name]"
- The card shows all available roles as checkboxes
- Roles the user already has are pre-checked

**Steps (continued):**
3. Check the **Moderator** checkbox
4. Click **Save Roles**

**Expected result:**

- "Roles assigned successfully." appears
- The role card disappears
- In the user list, the user's "Roles:" line now includes "Moderator"

---

#### Test F3.4 — Cancel role assignment

**Steps:**

1. Click **Assign Roles** next to any user
2. The role assignment card appears
3. Click **Cancel**

**Expected result:**

- The role assignment card disappears
- No changes are saved (the user's roles are unchanged)

---

## Test Suite 4 — US-09: Edit or Delete Role

### 4.1 What this test covers

US-09 lets a Super Admin rename a role, update its description, or delete it entirely.
Deleting a role removes all user and permission assignments. You will also verify that
the UI warns you if users are currently assigned before you confirm deletion.

---

### 4.2 Backend Tests (Postman)

#### Test B4.1 — Rename a role

| Field       | Value                                                                          |
| ----------- | ------------------------------------------------------------------------------ |
| Method      | `PATCH`                                                                      |
| URL         | `{{base_url}}/api/v1/roles/{{role_id}}`                                      |
| Headers     | `Content-Type: application/json`, `Authorization: Bearer {{access_token}}` |
| Body (JSON) | `{ "name": "Senior Moderator" }`                                             |

**Expected response:**

- Status: **200 OK**
- Body: role with `name` = `"Senior Moderator"` and unchanged `description`

---

#### Test B4.2 — Update description only (name unchanged)

| Field       | Value                                                                          |
| ----------- | ------------------------------------------------------------------------------ |
| Method      | `PATCH`                                                                      |
| URL         | `{{base_url}}/api/v1/roles/{{role_id}}`                                      |
| Headers     | `Content-Type: application/json`, `Authorization: Bearer {{access_token}}` |
| Body (JSON) | `{ "description": "Updated description — reviews and moderates content" }`  |

**Expected response:**

- Status: **200 OK**
- Body: `name` is still `"Senior Moderator"` (unchanged), `description` is updated

---

#### Test B4.3 — Rename to a name already taken (expect 409)

First, create a second role to use as a conflict target:

```
POST {{base_url}}/api/v1/roles
Body: { "name": "Content Editor" }
```

Then try to rename "Senior Moderator" to "Content Editor":

| Field       | Value                                                                          |
| ----------- | ------------------------------------------------------------------------------ |
| Method      | `PATCH`                                                                      |
| URL         | `{{base_url}}/api/v1/roles/{{role_id}}`                                      |
| Headers     | `Content-Type: application/json`, `Authorization: Bearer {{access_token}}` |
| Body (JSON) | `{ "name": "Content Editor" }`                                               |

**Expected response:**

- Status: **409 Conflict**
- Message: `"A role with this name already exists"`

---

#### Test B4.4 — Rename role to its own current name (expect 200, no error)

| Field       | Value                              |
| ----------- | ---------------------------------- |
| Body (JSON) | `{ "name": "Senior Moderator" }` |

> Sending the same name the role already has should NOT trigger a conflict error.

**Expected response:**

- Status: **200 OK**

---

#### Test B4.5 — Delete a role

First, create a disposable role:

```
POST {{base_url}}/api/v1/roles
Body: { "name": "Temp Role To Delete" }
→ save the returned role_id as {{temp_role_id}}
```

Then delete it:

| Field   | Value                                          |
| ------- | ---------------------------------------------- |
| Method  | `DELETE`                                     |
| URL     | `{{base_url}}/api/v1/roles/{{temp_role_id}}` |
| Headers | `Authorization: Bearer {{access_token}}`     |

**Expected response:**

- Status: **204 No Content**
- Body: *(empty)*

**Verify the deletion:**

- Run GET `{{base_url}}/api/v1/roles` — "Temp Role To Delete" must not appear

---

#### Test B4.6 — Delete a non-existent role (expect 404)

| Field   | Value                                                              |
| ------- | ------------------------------------------------------------------ |
| Method  | `DELETE`                                                         |
| URL     | `{{base_url}}/api/v1/roles/00000000-0000-0000-0000-000000000000` |
| Headers | `Authorization: Bearer {{access_token}}`                         |

**Expected response:**

- Status: **404 Not Found**

---

### 4.3 Frontend Tests (Browser UI)

#### Test F4.1 — Edit a role name via UI

**Steps:**

1. Navigate to `http://localhost:3000/admin/roles`
2. Find the "Senior Moderator" role
3. Click **Edit**

**Expected result:**

- The role row expands into an edit form
- The **Role Name** field is pre-filled with "Senior Moderator"
- The **Description** field is pre-filled with the current description
- The **Delete** button disappears while editing

**Steps (continued):**
4. Change the name to `"Junior Moderator"`
5. Click **Save**

**Expected result:**

- The form collapses back to the read-only view
- The role now shows "Junior Moderator" in the list without a page refresh

---

#### Test F4.2 — Cancel editing

**Steps:**

1. Click **Edit** on any role
2. Change the name field to something else
3. Click **Cancel**

**Expected result:**

- The form collapses
- The original role name is restored in the list (no change was saved)

---

#### Test F4.3 — Delete a role with no users (no warning)

**Steps:**

1. Create a new role "Delete Me Test" using the Create Role form at the top of the page
2. After it appears in the list, click **Delete** next to it

**Expected result:**

- The confirmation area appears: "Are you sure? This cannot be undone."
- No warning about users appears (the role has 0 users assigned)
- A **Confirm** and **Cancel** button appear

**Steps (continued):**
3. Click **Confirm**

**Expected result:**

- The role disappears from the list immediately
- No error message appears

---

#### Test F4.4 — Delete a role that has assigned users (warning must appear)

**Pre-condition:** Assign the "Junior Moderator" role to at least one user (use F3.3).

**Steps:**

1. On `/admin/roles`, find "Junior Moderator" (should show "1 user assigned")
2. Click **Delete**

**Expected result:**

- The confirmation area shows in red: **"Warning: this role is assigned to 1 user. Deleting it will remove their access."**
- Then: "Are you sure? This cannot be undone."
- **Confirm** and **Cancel** buttons appear

**Steps (continued):**
3. Click **Cancel**

**Expected result:**

- The confirmation area closes, the role is unchanged

---

## Test Suite 5 — US-10: Enforce Permissions on API Requests

### 5.1 What this test covers

US-10 is a backend-only system feature. It adds a global `PermissionsGuard` that
checks whether the authenticated user's roles include the specific permission required
by an endpoint. It also caches permission lookups in Redis. You will verify that:

- An endpoint decorated with `@RequirePermission('X')` returns 403 if the user lacks X
- The same endpoint returns 200 after the permission is granted
- Unauthenticated requests return 401 (not 403)
- Public endpoints (login, register) remain accessible without a token

---

### 5.2 Backend Tests (Postman)

For this suite you need **two user accounts**:

- **Super Admin** — already used in previous suites
- **Regular User** — a registered user with **no roles assigned**

If you do not have a Regular User yet:

1. `POST {{base_url}}/api/v1/auth/register` with `{ "full_name": "Regular User", "email": "regular@example.com", "gmail": "regular@gmail.com", "password": "Regular123!" }`
2. `POST {{base_url}}/api/v1/auth/login` with the same email/password → save the token as `{{regular_token}}`

---

#### Test B5.1 — Regular user blocked from /permissions (expect 403)

| Field   | Value                                       |
| ------- | ------------------------------------------- |
| Method  | `GET`                                     |
| URL     | `{{base_url}}/api/v1/permissions`         |
| Headers | `Authorization: Bearer {{regular_token}}` |

> Replace `{{regular_token}}` with the access token for the Regular User (no roles assigned).

**Expected response:**

- Status: **403 Forbidden**
- This confirms `PermissionsGuard` is enforcing the `read:permissions` permission

---

#### Test B5.2 — Assign `read:permissions` to the regular user's role

First, create a new role for the regular user:

```
POST {{base_url}}/api/v1/roles
Body: { "name": "Permission Tester" }
→ save as {{tester_role_id}}
```

Assign `read:permissions` to that role:

```
PUT {{base_url}}/api/v1/roles/{{tester_role_id}}/permissions
Body: { "permissionIds": ["<UUID of read:permissions from B2.1>"] }
```

Assign the role to the regular user (use the `user_id` from B3.1 for the regular user):

```
PUT {{base_url}}/api/v1/roles/users/{{regular_user_id}}/roles
Body: { "roleIds": ["{{tester_role_id}}"] }
```

---

#### Test B5.3 — Regular user now reaches /permissions (expect 200)

| Field   | Value                                       |
| ------- | ------------------------------------------- |
| Method  | `GET`                                     |
| URL     | `{{base_url}}/api/v1/permissions`         |
| Headers | `Authorization: Bearer {{regular_token}}` |

> **Important:** The regular user must log in again to get a fresh token — OR just make the request with the old token. The `PermissionsGuard` re-queries the database (and caches in Redis) on the very next request, so the old token is still valid and the new roles take effect immediately.

**Expected response:**

- Status: **200 OK**
- Body: the full permission catalogue (same as B2.1)

**What this proves:** The PermissionsGuard loaded fresh permissions from the DB (cache was invalidated when the role was assigned), cached them in Redis, and allowed the request.

---

#### Test B5.4 — Unauthenticated request (expect 401, not 403)

| Field   | Value                               |
| ------- | ----------------------------------- |
| Method  | `GET`                             |
| URL     | `{{base_url}}/api/v1/permissions` |
| Headers | *(no Authorization header)*       |

**Expected response:**

- Status: **401 Unauthorized**
- This confirms the global `JwtAuthGuard` runs before `PermissionsGuard` — the request never reaches the permission check

---

#### Test B5.5 — Public endpoints remain open (expect no auth required)

| Field       | Value                                                           |
| ----------- | --------------------------------------------------------------- |
| Method      | `POST`                                                        |
| URL         | `{{base_url}}/api/v1/auth/login`                              |
| Headers     | `Content-Type: application/json` *(no Authorization)*       |
| Body (JSON) | `{ "email": "nonexistent@example.com", "password": "wrong" }` |

**Expected response:**

- Status: **401 Unauthorized** (wrong credentials — but NOT because of the guard)
- Body: `{ "message": "Invalid credentials" }`
- This confirms the login endpoint is `@Public()` and the global guards skip it — you got 401 from the auth service itself (wrong credentials), not from the guard

---

#### Test B5.6 — Revoke permission and verify 403 returns

1. Remove `read:permissions` from the "Permission Tester" role:
   ```
   PUT {{base_url}}/api/v1/roles/{{tester_role_id}}/permissions
   Body: { "permissionIds": [] }
   ```
2. Re-run Test B5.1 immediately with `{{regular_token}}`

**Expected response:**

- Status: **403 Forbidden**
- This confirms cache invalidation works — the `assignPermissions` call deleted the user's cached permissions, so the next request fetched from the DB and found no `read:permissions`

---

### 5.3 Frontend Tests

> This user story is a backend system feature with no dedicated UI.
> Its effects are verified through the Postman tests above (403 and 401 responses).
> Future sprints will add `@RequirePermission()` to their own endpoints; the guard
> will enforce those automatically.

---

## Appendix A — Bootstrap: Creating the First Super Admin

If you are setting up a fresh database and have no Super Admin yet:

**Step 1 — Register a user through the API or UI:**

```
POST http://localhost:3002/api/v1/auth/register
Body:
{
  "full_name": "Super Admin",
  "email": "superadmin@betazoid.dev",
  "gmail": "superadmin@gmail.com",
  "password": "SuperAdmin123!"
}
```

**Step 2 — Connect to PostgreSQL and run the seed SQL:**

```bash
docker exec -it betazoid-postgres psql -U betazoidpostgres -d betazoid
```

Then run:

```sql
-- Create the Super Admin role (skip if it already exists)
INSERT INTO roles (role_id, name, description, created_at, updated_at)
VALUES (gen_random_uuid(), 'Super Admin', 'Full platform access', now(), now())
ON CONFLICT (name) DO NOTHING;

-- Assign it to your user
INSERT INTO user_roles (user_role_id, user_id, role_id, created_at)
SELECT gen_random_uuid(), u.user_id, r.role_id, now()
FROM users u, roles r
WHERE u.email = 'superadmin@betazoid.dev'
  AND r.name = 'Super Admin'
ON CONFLICT DO NOTHING;
```

**Step 3 — Assign all permissions to the Super Admin role:**

```sql
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.role_id, p.permission_id
FROM roles r, permissions p
WHERE r.name = 'Super Admin'
ON CONFLICT DO NOTHING;
```

> The `permissions` table is auto-seeded on backend startup. Run step 3 after
> starting the backend at least once.

---

## Appendix B — Quick Troubleshooting

| Symptom                                                             | Likely cause                                    | Fix                                                                                                                                                             |
| ------------------------------------------------------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| All requests return 401                                             | `access_token` not set in Postman environment | Re-run Test B0.1 and copy the token                                                                                                                             |
| All requests return 403                                             | Logged in as a non-Super-Admin user             | Switch to the Super Admin token                                                                                                                                 |
| `{{base_url}}` appears literally in the URL                       | Postman environment not selected                | Select `Betazoid Local` from the dropdown in top-right                                                                                                        |
| Role created but not visible in UI                                  | Browser cached old data                         | Refresh the page (F5)                                                                                                                                           |
| Backend returns 500 on startup                                      | Redis not running                               | Run `docker compose up -d redis`                                                                                                                              |
| `read:permissions` endpoint returns 403 after granting permission | Old cache still active                          | This should not happen — the cache is invalidated immediately on role assignment. If it persists, wait 5 minutes for the TTL to expire, or restart the backend |
