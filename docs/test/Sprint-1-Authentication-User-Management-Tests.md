# Sprint 1 — Authentication & User Management — Test Guide

## Overview

Sprint 1 covers user registration, login, logout, password reset, and profile management. The tester will verify that users can create accounts, authenticate securely with JWT tokens, reset forgotten passwords via email, and update their profile — while confirming that sensitive fields (Gmail) remain immutable after registration.

## Prerequisites

- [ ] Backend running at `http://localhost:3002` (`npm run start:dev` inside `backend/`)
- [ ] Frontend running at `http://localhost:3001` (check `frontend/.env` — it may be `3000`)
- [ ] PostgreSQL running (`docker compose up -d postgres`)
- [ ] Mailtrap (or equivalent SMTP sink) configured so emails are visible without sending real mail
- [ ] Postman installed (any version)
- [ ] A clean test database (or at minimum: no existing user with `tester@example.com`)

> **Redis is NOT required for Sprint 1.** Redis is introduced in Sprint 2 (US-10).

---

## Environment Setup (Postman)

Create a Postman Environment named **"Betazoid Local"** with these variables:

| Variable | Initial Value | Description |
|---|---|---|
| `base_url` | `http://localhost:3002/api/v1` | Backend base URL with prefix |
| `access_token` | *(leave empty)* | Set after Test B0.1 (login) |
| `reset_token` | *(leave empty)* | Set from password reset email link |

**How to use `access_token` in Postman:**

On any request that requires authentication, go to the **Authorization** tab → Type: **Bearer Token** → Token: `{{access_token}}`.

---

## Environment Setup (Browser)

- Open `http://localhost:3001` in Chrome or Firefox
- Open DevTools → **Network** tab → filter by `XHR` / `Fetch` to observe API calls
- Keep the Console tab visible to catch any JavaScript errors

---

## Test B0 — Authentication Setup

Run this before any test that requires a logged-in user. For full login test coverage see Test Suite 2.

### Test B0.1 — Login to obtain access token

| Field | Value |
|---|---|
| Method | POST |
| URL | `{{base_url}}/auth/login` |
| Headers | `Content-Type: application/json` |
| Body (JSON) | `{ "email": "tester@example.com", "password": "Test1234!" }` |

**Steps:**
1. Open Postman and select the **Betazoid Local** environment
2. Set method to `POST` and URL to `{{base_url}}/auth/login`
3. Add header `Content-Type: application/json`
4. Paste the body above
5. Click **Send**

**Expected response:**
- Status: `200 OK`
- Body: `{ "access_token": "<JWT string>" }`

**After receiving the response:**
- Copy the value of `access_token`
- In Postman, open the **Betazoid Local** environment → paste it into the `access_token` variable → **Save**
- All subsequent authenticated tests use `{{access_token}}` automatically

> **Note:** The user `tester@example.com` must already be registered. If not, run Test B1.1 first, then return here.

---

## Test Suite 1 — US-01: User Registration

### 1.1 What this test covers

US-01 allows a new user to create an account by providing their full name, login email, Gmail address (used for YouTube course access), and a password. The tester verifies that valid registrations succeed and trigger a confirmation email, while invalid inputs (duplicate email, bad Gmail format, short password, missing fields) are rejected with clear error responses.

### 1.2 Backend Tests (Postman)

#### Test B1.1 — Register a new user (happy path)

| Field | Value |
|---|---|
| Method | POST |
| URL | `{{base_url}}/auth/register` |
| Headers | `Content-Type: application/json` |
| Body (JSON) | `{ "full_name": "Test User", "email": "tester@example.com", "gmail": "tester.youtube@gmail.com", "password": "Test1234!" }` |

**Steps:**
1. Open Postman
2. Set method to `POST`, URL to `{{base_url}}/auth/register`
3. Add header `Content-Type: application/json`
4. Paste the body above
5. Click **Send**

**Expected response:**
- Status: `201 Created`
- Body: `{ "message": "Registration successful. Check your email." }`

**Check your Mailtrap inbox:** A confirmation email should arrive addressed to `tester@example.com` with the user's name.

**If you see 500 instead:**
- Cause: Mail service is misconfigured or PostgreSQL is not running
- Fix: Check backend console for the error; verify `docker compose ps` shows postgres running

---

#### Test B1.2 — Register with duplicate email (expect 409)

| Field | Value |
|---|---|
| Method | POST |
| URL | `{{base_url}}/auth/register` |
| Headers | `Content-Type: application/json` |
| Body (JSON) | `{ "full_name": "Another User", "email": "tester@example.com", "gmail": "other.youtube@gmail.com", "password": "Test1234!" }` |

**Steps:** Same as B1.1 — send the same email address that was registered in B1.1.

**Expected response:**
- Status: `409 Conflict`
- Body: `{ "message": "Email is already registered", ... }`

---

#### Test B1.3 — Register with non-Gmail address in gmail field (expect 400)

| Field | Value |
|---|---|
| Method | POST |
| URL | `{{base_url}}/auth/register` |
| Headers | `Content-Type: application/json` |
| Body (JSON) | `{ "full_name": "Test User", "email": "newuser@example.com", "gmail": "notgmail@hotmail.com", "password": "Test1234!" }` |

**Expected response:**
- Status: `400 Bad Request`
- Body includes: `"gmail must be a valid Gmail address"`

---

#### Test B1.4 — Register with password shorter than 8 characters (expect 400)

| Field | Value |
|---|---|
| Method | POST |
| URL | `{{base_url}}/auth/register` |
| Headers | `Content-Type: application/json` |
| Body (JSON) | `{ "full_name": "Test User", "email": "short@example.com", "gmail": "short.yt@gmail.com", "password": "abc" }` |

**Expected response:**
- Status: `400 Bad Request`
- Body includes a validation message about password minimum length

---

#### Test B1.5 — Register with missing required fields (expect 400)

| Field | Value |
|---|---|
| Method | POST |
| URL | `{{base_url}}/auth/register` |
| Headers | `Content-Type: application/json` |
| Body (JSON) | `{ "email": "incomplete@example.com", "password": "Test1234!" }` |

**Expected response:**
- Status: `400 Bad Request`
- Body includes validation errors for `full_name` and `gmail`

---

### 1.3 Frontend Tests (Browser UI)

#### Test F1.1 — Register a new user successfully

**Steps:**
1. Open browser at `http://localhost:3001/register`
2. Type `Frontend Tester` in the **Full Name** field
3. Type `frontend@example.com` in the **Email** field
4. Type `frontend.yt@gmail.com` in the **Gmail** field
5. Type `Test1234!` in the **Password** field
6. Click **Register**

**Expected result:**
- A success message appears: "Registration successful. Check your email."
- After 2 seconds, the browser automatically navigates to `/login`
- Check Mailtrap — a confirmation email should appear for `frontend@example.com`

**If you see "Email is already registered":**
- Use a different email address or clear the database entry

---

#### Test F1.2 — Submit empty registration form (expect validation errors)

**Steps:**
1. Open browser at `http://localhost:3001/register`
2. Leave all fields empty
3. Click **Register**

**Expected result:**
- Red error messages appear below each required field
- "Full name is required" below Full Name
- "Invalid email" below Email
- "Invalid Gmail" below Gmail
- "Password must be at least 8 characters" below Password
- The form does NOT submit (no network request fires)

---

#### Test F1.3 — Submit non-Gmail address in Gmail field (expect validation error)

**Steps:**
1. Open browser at `http://localhost:3001/register`
2. Fill in Full Name: `Test`
3. Fill in Email: `val@example.com`
4. Fill in Gmail: `notgmail@outlook.com`
5. Fill in Password: `Test1234!`
6. Click **Register**

**Expected result:**
- A red error appears below the Gmail field: "Must be a Gmail address"
- The form does NOT submit

---

## Test Suite 2 — US-02: User Login

### 2.1 What this test covers

US-02 allows registered users to log in with email and password. On success the backend returns a short-lived JWT access token and sets an HTTP-only `refresh_token` cookie. The tester verifies the happy path, wrong-password rejection, and token rotation behavior.

### 2.2 Backend Tests (Postman)

#### Test B2.1 — Login with valid credentials (happy path)

| Field | Value |
|---|---|
| Method | POST |
| URL | `{{base_url}}/auth/login` |
| Headers | `Content-Type: application/json` |
| Body (JSON) | `{ "email": "tester@example.com", "password": "Test1234!" }` |

**Steps:**
1. Set method `POST`, URL `{{base_url}}/auth/login`
2. Add `Content-Type: application/json` header
3. Paste the body
4. Click **Send**

**Expected response:**
- Status: `200 OK`
- Body: `{ "access_token": "<JWT string>" }`
- In Postman **Cookies** panel: a `refresh_token` cookie is set for `localhost`

**After the response:**
- Copy `access_token` value and paste it into the `access_token` environment variable

---

#### Test B2.2 — Login with wrong password (expect 401)

| Field | Value |
|---|---|
| Method | POST |
| URL | `{{base_url}}/auth/login` |
| Headers | `Content-Type: application/json` |
| Body (JSON) | `{ "email": "tester@example.com", "password": "WrongPass!" }` |

**Expected response:**
- Status: `401 Unauthorized`
- Body: `{ "message": "Invalid credentials" }`

> The error does NOT say "wrong password" — this is intentional to prevent credential enumeration.

---

#### Test B2.3 — Login with unregistered email (expect 401)

| Field | Value |
|---|---|
| Method | POST |
| URL | `{{base_url}}/auth/login` |
| Headers | `Content-Type: application/json` |
| Body (JSON) | `{ "email": "nobody@example.com", "password": "Test1234!" }` |

**Expected response:**
- Status: `401 Unauthorized`
- Body: `{ "message": "Invalid credentials" }`

> Same error as wrong password — the API never reveals whether the email exists.

---

#### Test B2.4 — Refresh access token

| Field | Value |
|---|---|
| Method | POST |
| URL | `{{base_url}}/auth/refresh` |
| Headers | *(none required — cookie is sent automatically by Postman)* |
| Body | *(empty)* |

**Prerequisite:** Run B2.1 first so the `refresh_token` cookie is set.

**Steps:**
1. Set method `POST`, URL `{{base_url}}/auth/refresh`
2. Ensure Postman has cookies enabled (Settings → General → **Automatically follow redirects** + cookie jar active)
3. Click **Send**

**Expected response:**
- Status: `200 OK`
- Body: `{ "access_token": "<new JWT string>" }` — a different token than the previous one
- The `refresh_token` cookie is also rotated (old hash is invalidated in the database)

---

### 2.3 Frontend Tests (Browser UI)

#### Test F2.1 — Login with valid credentials

**Steps:**
1. Open browser at `http://localhost:3001/login`
2. Type `tester@example.com` in the **Email** field
3. Type `Test1234!` in the **Password** field
4. Click **Sign In**

**Expected result:**
- The page navigates to `/` (home page)
- The Navbar changes to show the user is logged in (profile link or logout button visible)
- No error message appears

---

#### Test F2.2 — Login with wrong password (expect error message)

**Steps:**
1. Open browser at `http://localhost:3001/login`
2. Type `tester@example.com` in the **Email** field
3. Type `WrongPass99!` in the **Password** field
4. Click **Sign In**

**Expected result:**
- A red error message appears on the form: "Invalid credentials"
- The page does NOT navigate away

---

#### Test F2.3 — Submit empty login form (expect validation errors)

**Steps:**
1. Open browser at `http://localhost:3001/login`
2. Leave both fields empty
3. Click **Sign In**

**Expected result:**
- Red validation errors appear: "Invalid email" and "Password must be at least 8 characters"
- No network request is made (check DevTools Network tab — no `/auth/login` call)

---

## Test Suite 3 — US-03: User Logout

### 3.1 What this test covers

US-03 ends the user session by invalidating the refresh token in the database and clearing the `refresh_token` cookie. After logout, the old refresh token cannot be used to generate new access tokens. The tester verifies the logout response and then confirms the old refresh token is dead.

### 3.2 Backend Tests (Postman)

#### Test B3.1 — Logout successfully

| Field | Value |
|---|---|
| Method | POST |
| URL | `{{base_url}}/auth/logout` |
| Headers | `Authorization: Bearer {{access_token}}` |
| Body | *(empty)* |

**Prerequisite:** Run B0.1 first and set `{{access_token}}`.

**Steps:**
1. Set method `POST`, URL `{{base_url}}/auth/logout`
2. In the **Authorization** tab select **Bearer Token** and enter `{{access_token}}`
3. Click **Send**

**Expected response:**
- Status: `200 OK`
- Body: `{ "message": "Logged out successfully" }`
- The `refresh_token` cookie is cleared (check Postman Cookies — it is removed or expired)

---

#### Test B3.2 — Use refresh token after logout (expect 401)

| Field | Value |
|---|---|
| Method | POST |
| URL | `{{base_url}}/auth/refresh` |
| Headers | *(none)* |
| Body | *(empty)* |

**Prerequisite:** Run B3.1 first (the cookie has been cleared / token invalidated).

**Expected response:**
- Status: `401 Unauthorized`
- Body: `{ "message": "Invalid or expired refresh token" }` or `{ "message": "No refresh token" }`

> This confirms that logout actually invalidates the token — not just clears the cookie client-side.

---

#### Test B3.3 — Logout without access token (expect 401)

| Field | Value |
|---|---|
| Method | POST |
| URL | `{{base_url}}/auth/logout` |
| Headers | *(none — no Authorization header)* |
| Body | *(empty)* |

**Expected response:**
- Status: `401 Unauthorized`

---

### 3.3 Frontend Tests (Browser UI)

#### Test F3.1 — Logout from the Navbar

**Steps:**
1. Open browser at `http://localhost:3001/login` and log in with `tester@example.com` / `Test1234!`
2. Observe the Navbar — a Logout button (or similar) should be visible
3. Click **Logout**

**Expected result:**
- The browser navigates to `/login`
- The Navbar reverts to showing Login / Register links (logged-out state)
- The access token is cleared from memory (if you navigate to `/profile` without logging in again, you are redirected to `/login`)

---

#### Test F3.2 — Access protected page after logout (expect redirect)

**Steps:**
1. Complete F3.1 (log out)
2. Manually type `http://localhost:3001/profile` in the address bar and press Enter

**Expected result:**
- The browser redirects to `/login`
- The profile page content is never shown

---

## Test Suite 4 — US-04: Password Reset

### 4.1 What this test covers

US-04 lets users reset a forgotten password via email. The user submits their email address, receives a link with a one-time token (valid 30 minutes), and uses that link to set a new password. The tester verifies the happy path, token expiry behavior, and that the API never reveals whether an email is registered.

### 4.2 Backend Tests (Postman)

#### Test B4.1 — Request password reset for registered email

| Field | Value |
|---|---|
| Method | POST |
| URL | `{{base_url}}/auth/forgot-password` |
| Headers | `Content-Type: application/json` |
| Body (JSON) | `{ "email": "tester@example.com" }` |

**Steps:**
1. Set method `POST`, URL `{{base_url}}/auth/forgot-password`
2. Add `Content-Type: application/json` header
3. Paste the body
4. Click **Send**

**Expected response:**
- Status: `200 OK`
- Body: `{ "message": "If that email is registered, a reset link has been sent." }`

**Check Mailtrap:** An email arrives with a reset link. The URL looks like:
`http://localhost:3001/reset-password?token=<UUID>`

**Copy the token from the URL** (the part after `?token=`) and paste it into the Postman `reset_token` environment variable.

---

#### Test B4.2 — Request password reset for unregistered email (same response, no leak)

| Field | Value |
|---|---|
| Method | POST |
| URL | `{{base_url}}/auth/forgot-password` |
| Headers | `Content-Type: application/json` |
| Body (JSON) | `{ "email": "nobody@example.com" }` |

**Expected response:**
- Status: `200 OK`
- Body: `{ "message": "If that email is registered, a reset link has been sent." }`

> The response is identical whether the email exists or not. No email is sent, but the API response does not reveal this.

---

#### Test B4.3 — Reset password with valid token (happy path)

| Field | Value |
|---|---|
| Method | POST |
| URL | `{{base_url}}/auth/reset-password` |
| Headers | `Content-Type: application/json` |
| Body (JSON) | `{ "token": "{{reset_token}}", "new_password": "NewPass5678!" }` |

**Prerequisite:** Run B4.1 first and save the `reset_token` variable.

**Steps:**
1. Set method `POST`, URL `{{base_url}}/auth/reset-password`
2. Paste the body (Postman will substitute `{{reset_token}}` automatically)
3. Click **Send**

**Expected response:**
- Status: `200 OK`
- Body: `{ "message": "Password updated successfully." }`

**Verify the new password works:** Run B0.1 with `"password": "NewPass5678!"` — should return a new access token.

---

#### Test B4.4 — Reset password with used / invalid token (expect 400)

| Field | Value |
|---|---|
| Method | POST |
| URL | `{{base_url}}/auth/reset-password` |
| Headers | `Content-Type: application/json` |
| Body (JSON) | `{ "token": "{{reset_token}}", "new_password": "AnotherPass9!" }` |

**Prerequisite:** Run B4.3 first (the token is now consumed).

**Expected response:**
- Status: `400 Bad Request`
- Body: `{ "message": "Invalid or expired reset token" }`

---

#### Test B4.5 — Reset password with new_password shorter than 8 chars (expect 400)

| Field | Value |
|---|---|
| Method | POST |
| URL | `{{base_url}}/auth/reset-password` |
| Headers | `Content-Type: application/json` |
| Body (JSON) | `{ "token": "some-token", "new_password": "abc" }` |

**Expected response:**
- Status: `400 Bad Request`
- Body includes a validation error about minimum password length

---

### 4.3 Frontend Tests (Browser UI)

#### Test F4.1 — Submit forgot-password form

**Steps:**
1. Open browser at `http://localhost:3001/forgot-password`
2. Type `tester@example.com` in the **Email** field
3. Click **Send Reset Link**

**Expected result:**
- The button shows "Sending..." while the request is in flight
- The form is replaced by a message: "If that email is registered, a reset link has been sent."
- A **Back to login** link appears
- Check Mailtrap — the reset email arrives

---

#### Test F4.2 — Open reset link and set new password

**Steps:**
1. Open Mailtrap and find the password reset email
2. Copy the reset URL from the email and paste it into the browser address bar (the URL contains `?token=...`)
3. The page `/reset-password` loads with a form showing **New Password** and **Confirm Password**
4. Type `NewPass5678!` in **New Password**
5. Type `NewPass5678!` in **Confirm Password**
6. Click **Reset Password**

**Expected result:**
- The button shows "Updating..." during the request
- On success, the browser navigates to `/login`

---

#### Test F4.3 — Open reset-password page without token (expect error)

**Steps:**
1. Open browser at `http://localhost:3001/reset-password` (no `?token=` in URL)

**Expected result:**
- The page shows: "Invalid or missing reset link."
- A link "Request a new reset link" is shown pointing to `/forgot-password`
- No form fields are visible

---

## Test Suite 5 — US-05: Profile Management

### 5.1 What this test covers

US-05 lets authenticated users view and edit their profile (full name, bio). The Gmail field is visible but cannot be modified — it is immutable after registration because it controls YouTube playlist access. The tester also verifies the account deletion flow. Profile photo URL is accepted via API but no upload UI exists yet (deferred to Sprint 3 when S3/R2 is introduced).

### 5.2 Backend Tests (Postman)

#### Test B5.1 — Get own profile

| Field | Value |
|---|---|
| Method | GET |
| URL | `{{base_url}}/users/me` |
| Headers | `Authorization: Bearer {{access_token}}` |
| Body | *(none)* |

**Prerequisite:** Run B0.1 first and set `{{access_token}}`.

**Expected response:**
- Status: `200 OK`
- Body includes: `user_id`, `full_name`, `email`, `gmail`, `bio` (null if not set), `profile_photo_url` (null if not set), `is_email_verified`, `created_at`, `updated_at`
- Body does NOT include: `password_hash`, `refresh_token_hash`, `reset_password_token` (sensitive fields are stripped)

---

#### Test B5.2 — Update full name and bio (happy path)

| Field | Value |
|---|---|
| Method | PATCH |
| URL | `{{base_url}}/users/me` |
| Headers | `Authorization: Bearer {{access_token}}`, `Content-Type: application/json` |
| Body (JSON) | `{ "full_name": "Updated Name", "bio": "This is my updated bio." }` |

**Expected response:**
- Status: `200 OK`
- Body reflects the updated `full_name` and `bio`
- `gmail` and `email` are unchanged

---

#### Test B5.3 — Update only bio (partial update)

| Field | Value |
|---|---|
| Method | PATCH |
| URL | `{{base_url}}/users/me` |
| Headers | `Authorization: Bearer {{access_token}}`, `Content-Type: application/json` |
| Body (JSON) | `{ "bio": "Only bio changed." }` |

**Expected response:**
- Status: `200 OK`
- `full_name` is unchanged from the previous value
- `bio` is now "Only bio changed."

---

#### Test B5.4 — Attempt to set profile_photo_url with invalid URL (expect 400)

| Field | Value |
|---|---|
| Method | PATCH |
| URL | `{{base_url}}/users/me` |
| Headers | `Authorization: Bearer {{access_token}}`, `Content-Type: application/json` |
| Body (JSON) | `{ "profile_photo_url": "not-a-url" }` |

**Expected response:**
- Status: `400 Bad Request`
- Body includes a validation error: `profile_photo_url must be a URL address`

---

#### Test B5.5 — Get profile without token (expect 401)

| Field | Value |
|---|---|
| Method | GET |
| URL | `{{base_url}}/users/me` |
| Headers | *(none)* |
| Body | *(none)* |

**Expected response:**
- Status: `401 Unauthorized`

---

### 5.3 Frontend Tests (Browser UI)

#### Test F5.1 — View profile page

**Steps:**
1. Open browser at `http://localhost:3001/login` and log in with `tester@example.com` / `Test1234!`
2. Navigate to `http://localhost:3001/profile`

**Expected result:**
- **Account Info** card shows the user's **Email** and **Gmail** addresses
- A note reads: "Gmail cannot be changed — it controls your YouTube course access."
- **Edit Profile** card shows a form with **Full Name** and **Bio** inputs pre-filled with the current values
- **Delete Account** card is visible at the bottom

---

#### Test F5.2 — Update full name and bio

**Steps:**
1. Complete F5.1 (be on the profile page, logged in)
2. In the **Edit Profile** form, clear **Full Name** and type `Renamed Tester`
3. In the **Bio** field, type `Hello, I am testing.`
4. Click **Save Changes**

**Expected result:**
- The button shows "Saving..." during the request
- A success message appears: "Profile updated successfully."
- The **Full Name** field now shows `Renamed Tester`

---

#### Test F5.3 — Attempt to access profile without being logged in

**Steps:**
1. Open a new browser tab in Private/Incognito mode (no session)
2. Navigate to `http://localhost:3001/profile`

**Expected result:**
- The browser redirects to `/login` immediately
- The profile page content is never shown

---

#### Test F5.4 — Delete account (two-step confirmation)

> **Warning:** This permanently deletes the test user. After this test, re-register before continuing.

**Steps:**
1. Complete F5.1 (be on the profile page, logged in)
2. Scroll to the **Delete Account** card
3. Click **Delete Account**

**Expected result after first click:**
- The button is replaced with a warning: "Are you sure? This action is permanent."
- Two buttons appear: **Yes, delete my account** and **Cancel**

4. Click **Cancel**

**Expected result:**
- The confirmation disappears and the original **Delete Account** button reappears (no deletion occurred)

5. Click **Delete Account** again, then click **Yes, delete my account**

**Expected result:**
- The browser navigates to `/register`
- Attempting to log in with the deleted account's credentials returns `401 Invalid credentials`

---

## Appendix A — Troubleshooting

| Symptom | Likely Cause | Fix |
|---|---|---|
| All endpoints return 503 / cannot connect | Backend not running | Run `nvm use 24 && npm run start:dev` inside `backend/` |
| Frontend shows blank page | Next.js not running | Run `npm run dev` inside `frontend/` |
| Register returns 500 | Mail service not configured | Check `backend/.env` for `MAIL_*` vars; confirm Mailtrap SMTP creds |
| Login returns 200 but no cookie in Postman | Cookie jar not enabled | Postman Settings → Enable Interceptor or cookie jar for `localhost` |
| Reset email never arrives | `APP_URL` env var wrong | Set `APP_URL=http://localhost:3001` in `backend/.env` |
| Profile page immediately redirects to `/login` | Access token expired or missing | Re-run B0.1 to get a fresh token, then log in via the UI |
| `crypto is not defined` crash on backend start | Wrong Node version | Run `nvm use 24` before starting the backend |
