# Sprint 4 — Sections & Lectures — Test Guide

## Overview

Sprint 4 builds the course-content scaffold: instructors can create and reorder **sections**, populate each section with **lectures** (video, article, or quiz type), mark lectures as **free preview** for prospective students, and attach **downloadable resources** (files or external links) to any lecture. This guide walks through every API endpoint and every UI screen introduced in Sprint 4.

---

## Prerequisites

- [ ] Backend running at `http://localhost:3002`
- [ ] Frontend running at `http://localhost:3001`
- [ ] PostgreSQL running (`docker compose up -d postgres`)
- [ ] Postman installed (any version)
- [ ] At least one registered instructor account in the database (use Sprint 1 registration if needed)
- [ ] At least one published or draft **course** already created by that instructor (use Sprint 3 course creation if needed — you will need the `course_id`)

---

## Environment Setup (Postman)

Create a Postman Environment named **Betazoid Local** with these variables:

| Variable | Initial value | Notes |
|---|---|---|
| `base_url` | `http://localhost:3002` | Backend origin |
| `access_token` | *(empty — set after B0.1)* | JWT access token |
| `course_id` | *(empty — set after you have a course)* | UUID of the test course |
| `section_id` | *(empty — set after B1.1)* | UUID of a created section |
| `section_id_2` | *(empty — set after B1.2)* | UUID of a second section |
| `lecture_id` | *(empty — set after B2.1)* | UUID of a created lecture |
| `lecture_id_2` | *(empty — set after B2.2)* | UUID of a second lecture |
| `resource_id` | *(empty — set after B4.1 or B4.3)* | UUID of a created resource |

---

## Environment Setup (Browser)

- Open your browser and navigate to `http://localhost:3001`
- Open DevTools → Network tab (to inspect API calls if something goes wrong)
- Log in as the instructor before running any frontend test
- Keep the logged-in session throughout all frontend tests in this sprint

---

## Test B0 — Authentication Setup

### B0.1 — Log in as instructor to get access token

| Field | Value |
|---|---|
| Method | POST |
| URL | `{{base_url}}/api/v1/auth/login` |
| Headers | `Content-Type: application/json` |
| Body (JSON) | `{ "email": "instructor@example.com", "password": "Test1234!" }` |

**Steps:**
1. Open Postman, select your **Betazoid Local** environment
2. Set method to POST and URL to `{{base_url}}/api/v1/auth/login`
3. Add header `Content-Type: application/json`
4. Paste the body with your instructor's credentials
5. Click Send

**Expected response:**
- Status: `200 OK`
- Body includes `access_token` (a JWT string)

**After success:** Copy the `access_token` value and save it as the `access_token` variable in your Postman environment.

> All subsequent Postman tests that say `Authorization: Bearer {{access_token}}` require this token to be set.

---

## Test Suite 1 — US-16: Section Management

### 1.1 What this test covers

US-16 allows instructors to build the top-level structure of a course by creating named sections. Sections have an explicit ordering that the instructor can change at any time. Tests verify creation, listing, renaming, reordering, deletion, and the ownership guard (one instructor cannot touch another's sections).

---

### 1.2 Backend Tests (Postman)

#### B1.1 — Create a section

| Field | Value |
|---|---|
| Method | POST |
| URL | `{{base_url}}/api/v1/courses/{{course_id}}/sections` |
| Headers | `Content-Type: application/json`, `Authorization: Bearer {{access_token}}` |
| Body (JSON) | `{ "title": "Introduction" }` |

**Steps:**
1. Ensure `course_id` is set in your environment (a draft course you own)
2. Set method, URL, headers, and body as above
3. Click Send

**Expected response:**
- Status: `201 Created`
- Body:
  ```json
  {
    "section_id": "<uuid>",
    "title": "Introduction",
    "order": 0,
    "created_at": "...",
    "updated_at": "..."
  }
  ```
- `order` is `0` because this is the first section

**After success:** Copy the `section_id` value and save it as the `section_id` environment variable.

---

#### B1.2 — Create a second section (to enable reorder testing)

| Field | Value |
|---|---|
| Method | POST |
| URL | `{{base_url}}/api/v1/courses/{{course_id}}/sections` |
| Headers | `Content-Type: application/json`, `Authorization: Bearer {{access_token}}` |
| Body (JSON) | `{ "title": "Core Concepts" }` |

**Expected response:**
- Status: `201 Created`
- `order` is `1` (appended after the first section)

**After success:** Copy this `section_id` and save it as `section_id_2`.

---

#### B1.3 — List all sections for a course

| Field | Value |
|---|---|
| Method | GET |
| URL | `{{base_url}}/api/v1/courses/{{course_id}}/sections` |
| Headers | `Authorization: Bearer {{access_token}}` |
| Body | *(none)* |

**Expected response:**
- Status: `200 OK`
- Body: an array of section objects ordered by `order` ASC
  ```json
  [
    { "section_id": "...", "title": "Introduction", "order": 0 },
    { "section_id": "...", "title": "Core Concepts", "order": 1 }
  ]
  ```

---

#### B1.4 — Rename a section

| Field | Value |
|---|---|
| Method | PATCH |
| URL | `{{base_url}}/api/v1/courses/{{course_id}}/sections/{{section_id}}` |
| Headers | `Content-Type: application/json`, `Authorization: Bearer {{access_token}}` |
| Body (JSON) | `{ "title": "Welcome & Introduction" }` |

**Expected response:**
- Status: `200 OK`
- Body: section object with `"title": "Welcome & Introduction"`

---

#### B1.5 — Reorder sections

Using the two section IDs from B1.1 and B1.2, send them in reverse order.

| Field | Value |
|---|---|
| Method | POST |
| URL | `{{base_url}}/api/v1/courses/{{course_id}}/sections/reorder` |
| Headers | `Content-Type: application/json`, `Authorization: Bearer {{access_token}}` |
| Body (JSON) | `{ "orderedIds": ["{{section_id_2}}", "{{section_id}}"] }` |

> Replace `{{section_id_2}}` and `{{section_id}}` with the actual UUID strings — Postman does not expand nested variables inside JSON body arrays.

**Expected response:**
- Status: `200 OK`
- Body: array with sections in the new order — "Core Concepts" is now at `order: 0`, "Welcome & Introduction" is at `order: 1`

---

#### B1.6 — Reorder with wrong ID count (expect 400)

| Field | Value |
|---|---|
| Method | POST |
| URL | `{{base_url}}/api/v1/courses/{{course_id}}/sections/reorder` |
| Headers | `Content-Type: application/json`, `Authorization: Bearer {{access_token}}` |
| Body (JSON) | `{ "orderedIds": ["{{section_id}}"] }` |

**Expected response:**
- Status: `400 Bad Request`
- Body includes message about orderedIds count mismatch

---

#### B1.7 — Delete a section

| Field | Value |
|---|---|
| Method | DELETE |
| URL | `{{base_url}}/api/v1/courses/{{course_id}}/sections/{{section_id_2}}` |
| Headers | `Authorization: Bearer {{access_token}}` |
| Body | *(none)* |

**Expected response:**
- Status: `204 No Content`
- No body

**Verify:** Run B1.3 again — the deleted section should no longer appear in the list.

---

#### B1.8 — Create section without authentication (expect 401)

| Field | Value |
|---|---|
| Method | POST |
| URL | `{{base_url}}/api/v1/courses/{{course_id}}/sections` |
| Headers | `Content-Type: application/json` *(no Authorization header)* |
| Body (JSON) | `{ "title": "Unauthorized Section" }` |

**Expected response:**
- Status: `401 Unauthorized`

---

#### B1.9 — Create section with missing title (expect 400)

| Field | Value |
|---|---|
| Method | POST |
| URL | `{{base_url}}/api/v1/courses/{{course_id}}/sections` |
| Headers | `Content-Type: application/json`, `Authorization: Bearer {{access_token}}` |
| Body (JSON) | `{}` |

**Expected response:**
- Status: `400 Bad Request`
- Body lists validation errors for `title`

---

### 1.3 Frontend Tests (Browser UI)

#### F1.1 — Navigate to sections management page

**Steps:**
1. Log in as the instructor at `http://localhost:3001/login`
2. Navigate to `http://localhost:3001/courses` and find your test course
3. Click the **Edit** button next to the course
4. On the edit page, click **Manage Sections**

**Expected result:**
- You are taken to `/courses/<course_id>/sections`
- Any existing sections are listed in order with their titles

---

#### F1.2 — Create a new section via the form

**Steps:**
1. On the sections page, locate the "Add Section" form at the top
2. Type `"Getting Started"` in the title input
3. Click **Add Section**

**Expected result:**
- The new section appears at the bottom of the list immediately
- The title input field is cleared automatically

---

#### F1.3 — Rename a section inline

**Steps:**
1. Locate the section you created in F1.2
2. Click the **Rename** button next to it
3. An input field appears with the current title pre-filled
4. Clear the field and type `"Getting Started — Updated"`
5. Click **Save**

**Expected result:**
- The section title updates in the list without a page reload
- No rename input is visible after saving

---

#### F1.4 — Reorder sections with up/down buttons

**Steps:**
1. Ensure at least two sections exist in the list
2. Click the **↓** (down) button on the first section

**Expected result:**
- The first and second sections swap positions immediately
- The button that was ↓ is now ↑ and vice versa

---

#### F1.5 — Delete a section with confirmation

**Steps:**
1. Click the **Delete** button next to a section
2. A confirmation message appears: "Delete '...'? This cannot be undone."
3. Click **Confirm**

**Expected result:**
- The section is removed from the list

---

#### F1.6 — Cancel a section delete

**Steps:**
1. Click **Delete** next to any section
2. When the confirmation appears, click **Cancel**

**Expected result:**
- The section remains in the list unchanged
- The confirmation panel disappears

---

#### F1.7 — Submit empty section title (validation error)

**Steps:**
1. Leave the title input blank
2. Click **Add Section**

**Expected result:**
- An error message appears below the title field (e.g., "Title is required" or similar)
- No section is created

---

## Test Suite 2 — US-17: Create Lecture

### 2.1 What this test covers

US-17 allows instructors to add lectures to a section, choose the content type (video, article, or quiz), reorder lectures within the section, and delete lectures. Tests verify all CRUD operations and the content type enum constraint.

---

### 2.2 Backend Tests (Postman)

> Ensure `section_id` is set from Test B1.1 (re-create a section if you deleted it in B1.7).

#### B2.1 — Create a video lecture

| Field | Value |
|---|---|
| Method | POST |
| URL | `{{base_url}}/api/v1/courses/{{course_id}}/sections/{{section_id}}/lectures` |
| Headers | `Content-Type: application/json`, `Authorization: Bearer {{access_token}}` |
| Body (JSON) | `{ "title": "Welcome to the Course", "content_type": "video" }` |

**Expected response:**
- Status: `201 Created`
- Body:
  ```json
  {
    "lecture_id": "<uuid>",
    "title": "Welcome to the Course",
    "content_type": "video",
    "order": 0,
    "is_free_preview": false
  }
  ```
- `is_free_preview` defaults to `false`

**After success:** Save the `lecture_id` as the `lecture_id` environment variable.

---

#### B2.2 — Create an article lecture

| Field | Value |
|---|---|
| Method | POST |
| URL | `{{base_url}}/api/v1/courses/{{course_id}}/sections/{{section_id}}/lectures` |
| Headers | `Content-Type: application/json`, `Authorization: Bearer {{access_token}}` |
| Body (JSON) | `{ "title": "Course Notes", "content_type": "article" }` |

**Expected response:**
- Status: `201 Created`
- `content_type`: `"article"`, `order`: `1`

**After success:** Save this `lecture_id` as `lecture_id_2`.

---

#### B2.3 — Create a lecture with invalid content type (expect 400)

| Field | Value |
|---|---|
| Method | POST |
| URL | `{{base_url}}/api/v1/courses/{{course_id}}/sections/{{section_id}}/lectures` |
| Headers | `Content-Type: application/json`, `Authorization: Bearer {{access_token}}` |
| Body (JSON) | `{ "title": "Bad Lecture", "content_type": "podcast" }` |

**Expected response:**
- Status: `400 Bad Request`
- Body lists a validation error for `content_type` (must be video, article, or quiz)

---

#### B2.4 — List lectures in a section

| Field | Value |
|---|---|
| Method | GET |
| URL | `{{base_url}}/api/v1/courses/{{course_id}}/sections/{{section_id}}/lectures` |
| Headers | `Authorization: Bearer {{access_token}}` |
| Body | *(none)* |

**Expected response:**
- Status: `200 OK`
- Body: array of lecture objects sorted by `order` ASC

---

#### B2.5 — Rename a lecture

| Field | Value |
|---|---|
| Method | PATCH |
| URL | `{{base_url}}/api/v1/courses/{{course_id}}/sections/{{section_id}}/lectures/{{lecture_id}}` |
| Headers | `Content-Type: application/json`, `Authorization: Bearer {{access_token}}` |
| Body (JSON) | `{ "title": "Welcome — Updated" }` |

**Expected response:**
- Status: `200 OK`
- `title` is `"Welcome — Updated"`
- `content_type` and `order` are unchanged

---

#### B2.6 — Reorder lectures

| Field | Value |
|---|---|
| Method | POST |
| URL | `{{base_url}}/api/v1/courses/{{course_id}}/sections/{{section_id}}/lectures/reorder` |
| Headers | `Content-Type: application/json`, `Authorization: Bearer {{access_token}}` |
| Body (JSON) | `{ "orderedIds": ["<lecture_id_2>", "<lecture_id>"] }` |

> Replace with the actual UUID values from B2.1 and B2.2.

**Expected response:**
- Status: `200 OK`
- First item in the array now has `order: 0` and matches `lecture_id_2`

---

#### B2.7 — Delete a lecture

| Field | Value |
|---|---|
| Method | DELETE |
| URL | `{{base_url}}/api/v1/courses/{{course_id}}/sections/{{section_id}}/lectures/{{lecture_id_2}}` |
| Headers | `Authorization: Bearer {{access_token}}` |
| Body | *(none)* |

**Expected response:**
- Status: `204 No Content`

**Verify:** Run B2.4 — the deleted lecture should not appear.

---

#### B2.8 — Create lecture with missing fields (expect 400)

| Field | Value |
|---|---|
| Method | POST |
| URL | `{{base_url}}/api/v1/courses/{{course_id}}/sections/{{section_id}}/lectures` |
| Headers | `Content-Type: application/json`, `Authorization: Bearer {{access_token}}` |
| Body (JSON) | `{ "title": "No Content Type" }` |

**Expected response:**
- Status: `400 Bad Request`
- Body lists validation error for `content_type`

---

### 2.3 Frontend Tests (Browser UI)

#### F2.1 — Navigate to lectures for a section

**Steps:**
1. Go to `/courses/<course_id>/sections`
2. Click the **Lectures** button next to any section

**Expected result:**
- You are taken to `/courses/<course_id>/sections/<section_id>/lectures`
- Any existing lectures are listed with their title and content type badge

---

#### F2.2 — Create a new lecture

**Steps:**
1. On the lectures page, type `"Introduction Video"` in the title field
2. From the content type dropdown, select **Video**
3. Click **Add Lecture**

**Expected result:**
- The new lecture appears in the list with `[video]` next to the title
- The form is reset (title cleared, content type back to default)

---

#### F2.3 — Create a lecture with each content type

**Steps:**
1. Repeat F2.2 with `"Reading Material"` and content type **Article**
2. Repeat with `"Module Quiz"` and content type **Quiz**

**Expected result:**
- All three lectures appear in the list with their respective type badges: `[video]`, `[article]`, `[quiz]`

---

#### F2.4 — Rename a lecture

**Steps:**
1. Click **Rename** next to any lecture
2. An input field appears with the current title
3. Change the title to `"Introduction Video — Revised"`
4. Click **Save**

**Expected result:**
- The lecture row shows the updated title
- No input field is visible

---

#### F2.5 — Reorder a lecture

**Steps:**
1. Ensure at least two lectures are in the list
2. Click **↑** on the second lecture

**Expected result:**
- The second lecture moves to the first position
- Arrow buttons update accordingly (↑ is now disabled for the first item)

---

#### F2.6 — Delete a lecture with two-step confirmation

**Steps:**
1. Click **Delete** next to a lecture
2. A confirmation message appears: "Delete '...'? This cannot be undone."
3. Click **Confirm**

**Expected result:**
- The lecture is removed from the list

---

## Test Suite 3 — US-18: Free Preview Toggle

### 3.1 What this test covers

US-18 allows instructors to mark individual lectures as free preview, making them visible to non-enrolled visitors on the public course detail page. Tests verify the toggle API, the `is_free_preview` flag in list responses, and that the public course endpoint returns the flag correctly for unauthenticated users.

---

### 3.2 Backend Tests (Postman)

#### B3.1 — Enable free preview on a lecture

| Field | Value |
|---|---|
| Method | PATCH |
| URL | `{{base_url}}/api/v1/courses/{{course_id}}/sections/{{section_id}}/lectures/{{lecture_id}}` |
| Headers | `Content-Type: application/json`, `Authorization: Bearer {{access_token}}` |
| Body (JSON) | `{ "is_free_preview": true }` |

**Expected response:**
- Status: `200 OK`
- Body includes `"is_free_preview": true`
- `title` and `content_type` are unchanged

---

#### B3.2 — Disable free preview on a lecture

| Field | Value |
|---|---|
| Method | PATCH |
| URL | `{{base_url}}/api/v1/courses/{{course_id}}/sections/{{section_id}}/lectures/{{lecture_id}}` |
| Headers | `Content-Type: application/json`, `Authorization: Bearer {{access_token}}` |
| Body (JSON) | `{ "is_free_preview": false }` |

**Expected response:**
- Status: `200 OK`
- `"is_free_preview": false`

---

#### B3.3 — Send string instead of boolean (expect 400)

| Field | Value |
|---|---|
| Method | PATCH |
| URL | `{{base_url}}/api/v1/courses/{{course_id}}/sections/{{section_id}}/lectures/{{lecture_id}}` |
| Headers | `Content-Type: application/json`, `Authorization: Bearer {{access_token}}` |
| Body (JSON) | `{ "is_free_preview": "true" }` |

**Expected response:**
- Status: `400 Bad Request`
- Body: validation error — `is_free_preview` must be a boolean

---

#### B3.4 — Get public course detail (no authentication required)

> For this test, the course must be in **Published** status. If your test course is a draft, submit it for review (Sprint 3 US-13) and approve it (Sprint 3 US-14) first. Alternatively, use a published course's `course_id`.

| Field | Value |
|---|---|
| Method | GET |
| URL | `{{base_url}}/api/v1/courses/{{course_id}}/public` |
| Headers | *(none — no Authorization header)* |
| Body | *(none)* |

**Expected response:**
- Status: `200 OK`
- Body includes `sections` array; each section has a `lectures` array
- Each lecture object has `is_free_preview: true` or `false`
- No private fields (instructor email, user_id, rejection_reason, status) are present

---

#### B3.5 — Get public detail for a draft course (expect 404)

| Field | Value |
|---|---|
| Method | GET |
| URL | `{{base_url}}/api/v1/courses/{{course_id}}/public` |
| Headers | *(none)* |
| Body | *(none)* |

> Use a `course_id` that is in **Draft** status.

**Expected response:**
- Status: `404 Not Found`
- A draft/pending course returns the same response as a non-existent course (prevents ID enumeration)

---

### 3.3 Frontend Tests (Browser UI)

#### F3.1 — Toggle a lecture to free preview

**Steps:**
1. Navigate to `/courses/<course_id>/sections/<section_id>/lectures`
2. Locate any lecture in the list
3. Click the **Set Preview** button next to it

**Expected result:**
- The button label changes to **Remove Preview**
- A **Free Preview** badge appears next to the lecture title

---

#### F3.2 — Toggle free preview off

**Steps:**
1. Find a lecture that shows **Remove Preview** (from F3.1)
2. Click **Remove Preview**

**Expected result:**
- The badge disappears
- The button label reverts to **Set Preview**

---

#### F3.3 — View the public course page as a non-logged-in visitor

**Steps:**
1. Log out (click Logout in the navbar)
2. Navigate directly to `http://localhost:3001/courses/<course_id>` (the public course detail page)
3. Observe the lecture list

**Expected result:**
- The page loads without requiring login
- Each lecture shows either a **Free Preview** badge or **Enrolled only** label
- Lectures marked as free preview by the instructor appear with the badge

---

#### F3.4 — Free Preview label is absent on non-preview lectures

**Steps:**
1. While viewing the public course page from F3.3
2. Locate a lecture that was NOT marked as free preview

**Expected result:**
- The lecture shows "Enrolled only"
- No Free Preview badge appears

---

## Test Suite 4 — US-19: Attach Lecture Resources

### 4.1 What this test covers

US-19 allows instructors to attach supplementary materials to a lecture: either uploaded files (PDF, ZIP, PowerPoint, Word, Excel — up to 50 MB) or external links. Tests verify both resource types, the list endpoint, deletion (including file cleanup), and file-type/size enforcement.

---

### 4.2 Backend Tests (Postman)

#### B4.1 — Add an external link resource

| Field | Value |
|---|---|
| Method | POST |
| URL | `{{base_url}}/api/v1/courses/{{course_id}}/sections/{{section_id}}/lectures/{{lecture_id}}/resources/link` |
| Headers | `Content-Type: application/json`, `Authorization: Bearer {{access_token}}` |
| Body (JSON) | `{ "title": "Official Documentation", "url": "https://docs.example.com/guide" }` |

**Expected response:**
- Status: `201 Created`
- Body:
  ```json
  {
    "resource_id": "<uuid>",
    "title": "Official Documentation",
    "resource_type": "link",
    "url": "https://docs.example.com/guide",
    "original_filename": null,
    "created_at": "...",
    "updated_at": "..."
  }
  ```
- `resource_type` is `"link"`, `original_filename` is `null`

**After success:** Save the `resource_id` as the `resource_id` environment variable.

---

#### B4.2 — Add link with invalid URL (expect 400)

| Field | Value |
|---|---|
| Method | POST |
| URL | `{{base_url}}/api/v1/courses/{{course_id}}/sections/{{section_id}}/lectures/{{lecture_id}}/resources/link` |
| Headers | `Content-Type: application/json`, `Authorization: Bearer {{access_token}}` |
| Body (JSON) | `{ "title": "Bad Link", "url": "not-a-url" }` |

**Expected response:**
- Status: `400 Bad Request`
- Body: validation error — `url` must be a valid URL with `http://` or `https://`

---

#### B4.3 — Upload a PDF file resource

> This test uses multipart/form-data. In Postman, switch from the JSON Body tab to **form-data**.

| Field | Value |
|---|---|
| Method | POST |
| URL | `{{base_url}}/api/v1/courses/{{course_id}}/sections/{{section_id}}/lectures/{{lecture_id}}/resources/file` |
| Headers | `Authorization: Bearer {{access_token}}` *(do NOT set Content-Type manually — Postman sets it automatically for form-data)* |

**Postman Body — form-data:**

| Key | Type | Value |
|---|---|---|
| `title` | Text | `Exercise PDF` |
| `file` | File | *(click the file icon and select any PDF from your computer)* |

**Steps:**
1. Set method to POST and URL as above
2. Add the `Authorization` header only — do NOT add `Content-Type` (Postman sets the multipart boundary automatically)
3. In the Body tab, select **form-data**
4. Add a Text field `title` = `Exercise PDF`
5. Add a File field `file` and select any `.pdf` file from your computer
6. Click Send

**Expected response:**
- Status: `201 Created`
- Body:
  ```json
  {
    "resource_id": "<uuid>",
    "title": "Exercise PDF",
    "resource_type": "file",
    "url": "/uploads/resources/<generated-filename>.pdf",
    "original_filename": "<your-file-name>.pdf",
    "created_at": "...",
    "updated_at": "..."
  }
  ```
- `resource_type` is `"file"`, `url` is a relative path, `original_filename` is your file's name

---

#### B4.4 — Upload a disallowed file type (expect 400)

| Field | Value |
|---|---|
| Method | POST |
| URL | `{{base_url}}/api/v1/courses/{{course_id}}/sections/{{section_id}}/lectures/{{lecture_id}}/resources/file` |
| Headers | `Authorization: Bearer {{access_token}}` |

**Postman Body — form-data:**

| Key | Type | Value |
|---|---|---|
| `title` | Text | `Executable` |
| `file` | File | *(select any `.exe` or `.sh` file, or rename a file to `.exe`)* |

**Expected response:**
- Status: `400 Bad Request`
- Body: message listing allowed extensions (pdf, zip, ppt, pptx, doc, docx, xls, xlsx)

---

#### B4.5 — Upload without a title (expect 400)

| Field | Value |
|---|---|
| Method | POST |
| URL | `{{base_url}}/api/v1/courses/{{course_id}}/sections/{{section_id}}/lectures/{{lecture_id}}/resources/file` |
| Headers | `Authorization: Bearer {{access_token}}` |

**Postman Body — form-data:**

| Key | Type | Value |
|---|---|---|
| `title` | Text | *(leave blank)* |
| `file` | File | *(select any allowed file)* |

**Expected response:**
- Status: `400 Bad Request`
- Body: `"Title is required"`

---

#### B4.6 — Upload without a file (expect 400)

| Field | Value |
|---|---|
| Method | POST |
| URL | `{{base_url}}/api/v1/courses/{{course_id}}/sections/{{section_id}}/lectures/{{lecture_id}}/resources/file` |
| Headers | `Content-Type: application/json`, `Authorization: Bearer {{access_token}}` |
| Body (JSON) | `{ "title": "No File" }` |

**Expected response:**
- Status: `400 Bad Request`
- Body: `"File is required"`

---

#### B4.7 — List resources for a lecture

| Field | Value |
|---|---|
| Method | GET |
| URL | `{{base_url}}/api/v1/courses/{{course_id}}/sections/{{section_id}}/lectures/{{lecture_id}}/resources` |
| Headers | `Authorization: Bearer {{access_token}}` |
| Body | *(none)* |

**Expected response:**
- Status: `200 OK`
- Body: array of resource objects (both the link from B4.1 and the file from B4.3 should appear)
- Resources are ordered by `created_at` ASC

---

#### B4.8 — Download an uploaded file (verify static serving)

| Field | Value |
|---|---|
| Method | GET |
| URL | `{{base_url}}` + the `url` field from B4.3's response (e.g. `http://localhost:3002/uploads/resources/1698123456789-987654321.pdf`) |
| Headers | *(none — no auth required)* |
| Body | *(none)* |

**Steps:**
1. Copy the `url` value from the B4.3 response (e.g. `/uploads/resources/16982345-987654321.pdf`)
2. Prepend `http://localhost:3002` to form the full URL
3. Paste the full URL into your browser's address bar and press Enter

**Expected result:**
- The PDF downloads or displays in the browser
- No 404 or authentication error

---

#### B4.9 — Delete a resource

| Field | Value |
|---|---|
| Method | DELETE |
| URL | `{{base_url}}/api/v1/courses/{{course_id}}/sections/{{section_id}}/lectures/{{lecture_id}}/resources/{{resource_id}}` |
| Headers | `Authorization: Bearer {{access_token}}` |
| Body | *(none)* |

> Use the `resource_id` from B4.1 (the link resource).

**Expected response:**
- Status: `204 No Content`

**Verify:** Run B4.7 again — the deleted resource should not appear in the list.

---

#### B4.10 — Delete a non-existent resource (expect 404)

| Field | Value |
|---|---|
| Method | DELETE |
| URL | `{{base_url}}/api/v1/courses/{{course_id}}/sections/{{section_id}}/lectures/{{lecture_id}}/resources/00000000-0000-0000-0000-000000000000` |
| Headers | `Authorization: Bearer {{access_token}}` |
| Body | *(none)* |

**Expected response:**
- Status: `404 Not Found`

---

#### B4.11 — Access resources on another instructor's lecture (expect 403)

> This test requires a second instructor account. If you do not have one, skip this test.

**Steps:**
1. Log in as a different instructor and get their access token
2. Use that token in the Authorization header
3. Attempt `GET {{base_url}}/api/v1/courses/{{course_id}}/sections/{{section_id}}/lectures/{{lecture_id}}/resources`
   where `course_id` belongs to the original instructor

**Expected response:**
- Status: `403 Forbidden`

---

### 4.3 Frontend Tests (Browser UI)

#### F4.1 — Navigate to the resources page for a lecture

**Steps:**
1. Navigate to `/courses/<course_id>/sections/<section_id>/lectures`
2. Locate any lecture in the list
3. Click the **Resources** button next to that lecture

**Expected result:**
- You are taken to `/courses/<course_id>/sections/<section_id>/lectures/<lecture_id>/resources`
- A page titled "Lecture Resources" loads
- "No resources attached yet." message appears if none exist

---

#### F4.2 — Add an external link

**Steps:**
1. On the resources page, ensure the **Add Link** tab is active (it is default)
2. In the Title field, type `"Course Slides"`
3. In the URL field, type `"https://slides.google.com/presentation/example"`
4. Click **Add Link**

**Expected result:**
- A success message appears ("Link added.")
- The new resource appears in the list below with type `"link"` and an underlined clickable title
- The form fields are cleared

---

#### F4.3 — Add a link with missing URL (validation error)

**Steps:**
1. On the resources page, type a title but leave URL blank
2. Click **Add Link**

**Expected result:**
- An error message appears: "Must be a valid URL (include http:// or https://)"
- No resource is created

---

#### F4.4 — Upload a file

**Steps:**
1. Click the **Upload File** tab
2. In the Title field, type `"Exercise Files"`
3. Click the file chooser and select any `.pdf` or `.zip` file from your computer
4. Click **Upload File**

**Expected result:**
- A success message appears ("File uploaded.")
- The new resource appears in the list with type `"file"`, the title, and the original filename in parentheses
- The title field is cleared and the file input is reset

---

#### F4.5 — Verify a file resource is downloadable

**Steps:**
1. In the resources list, find the file resource created in F4.4
2. Click its underlined title link

**Expected result:**
- The browser downloads the file or opens it in a new tab
- The file content matches what you uploaded

---

#### F4.6 — Delete a resource with two-step confirmation

**Steps:**
1. Click the **Delete** button next to any resource
2. A confirmation panel appears: "Delete '...'? This cannot be undone."
3. Click **Confirm**

**Expected result:**
- The resource disappears from the list

---

#### F4.7 — Cancel a resource delete

**Steps:**
1. Click **Delete** next to a resource
2. When the confirmation appears, click **Cancel**

**Expected result:**
- The resource remains in the list
- The confirmation panel disappears

---

#### F4.8 — Navigate back to lectures from the resources page

**Steps:**
1. On any lecture's resources page, click **← Back to Lectures**

**Expected result:**
- You are returned to `/courses/<course_id>/sections/<section_id>/lectures`
- All lectures are still listed correctly

---

## Summary

| Test Suite | US | Backend Tests | Frontend Tests |
|---|---|---|---|
| Suite 1 | US-16 Section Management | B1.1 – B1.9 (9 tests) | F1.1 – F1.7 (7 tests) |
| Suite 2 | US-17 Create Lecture | B2.1 – B2.8 (8 tests) | F2.1 – F2.6 (6 tests) |
| Suite 3 | US-18 Free Preview Toggle | B3.1 – B3.5 (5 tests) | F3.1 – F3.4 (4 tests) |
| Suite 4 | US-19 Attach Lecture Resources | B4.1 – B4.11 (11 tests) | F4.1 – F4.8 (8 tests) |
| **Total** | | **33 backend tests** | **25 frontend tests** |
