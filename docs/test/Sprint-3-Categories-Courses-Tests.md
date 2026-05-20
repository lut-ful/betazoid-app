# Sprint 3 — Categories & Courses — Test Guide

## Overview

Sprint 3 implements category management and the complete course lifecycle: create, edit, submit for review, approve/reject, and public search. The tester will verify that admins can manage categories, instructors can create and submit courses, admins can approve or reject them, and any visitor can search published courses without logging in.

---

## Prerequisites

- [ ] Backend running at `http://localhost:3002` (`npm run start:dev` in `backend/`)
- [ ] Frontend running at `http://localhost:3000` (`npm run dev` in `frontend/`)
- [ ] PostgreSQL running (`docker compose up -d postgres`)
- [ ] Redis running (`docker compose up -d redis`)
- [ ] Postman installed (any version)
- [ ] A **Super Admin** account already exists (created via Sprint 1 registration + Sprint 2 role assignment)
- [ ] The Super Admin has a role with permissions: `create:categories`, `update:categories`, `delete:categories`, `approve:courses`
- [ ] A second **Instructor** account exists (registered via `/register`)
- [ ] Mailtrap (or equivalent) configured if you want to verify notification emails

---

## Environment Setup — Postman

Create a Postman Environment named **"Betazoid Local"** with these variables:

| Variable | Initial Value | Notes |
|---|---|---|
| `base_url` | `http://localhost:3002` | Backend API root |
| `access_token` | *(empty — set after login)* | Refreshed per role in B0 tests |
| `admin_token` | *(empty)* | Token for the Super Admin account |
| `instructor_token` | *(empty)* | Token for the Instructor account |
| `category_id` | *(empty)* | Set after creating a category |
| `course_id` | *(empty)* | Set after creating a course |

---

## Environment Setup — Browser

- Base URL: `http://localhost:3000`
- Open Chrome or Firefox DevTools (F12) → **Network** tab to observe API calls
- Have two browser windows open: one logged in as **Admin**, one as **Instructor**

---

## Test B0 — Authentication Setup

Run these once before any other tests to get tokens for both accounts.

### Test B0.1 — Login as Super Admin

| Field | Value |
|---|---|
| Method | POST |
| URL | `{{base_url}}/api/v1/auth/login` |
| Headers | `Content-Type: application/json` |
| Body | `{ "email": "admin@example.com", "password": "Admin1234!" }` |

**Steps:**
1. Replace email/password with your actual Super Admin credentials.
2. Send the request.
3. Copy the `accessToken` from the response body.
4. In Postman → Environments → Betazoid Local, paste the value into both `access_token` and `admin_token`.

**Expected response:**
- Status: `200 OK`
- Body contains: `accessToken`, `user.email`, `user.full_name`

---

### Test B0.2 — Login as Instructor

| Field | Value |
|---|---|
| Method | POST |
| URL | `{{base_url}}/api/v1/auth/login` |
| Headers | `Content-Type: application/json` |
| Body | `{ "email": "instructor@example.com", "password": "Test1234!" }` |

**Steps:**
1. Replace email/password with your Instructor credentials.
2. Send the request.
3. Copy the `accessToken` and paste it into the `instructor_token` environment variable.

**Expected response:**
- Status: `200 OK`
- Body contains `accessToken`

---

## Test Suite 1 — US-11: Category Management

### 1.1 What this test covers

The admin can create top-level categories and subcategories, rename them, and delete them. Deleting a parent category that still has subcategories is blocked — the admin must first reassign or delete the children. The `GET /categories` endpoint is public (no token needed).

---

### 1.2 Backend Tests (Postman)

#### Test B1.1 — Create a top-level category

| Field | Value |
|---|---|
| Method | POST |
| URL | `{{base_url}}/api/v1/categories` |
| Headers | `Content-Type: application/json`, `Authorization: Bearer {{admin_token}}` |
| Body | `{ "name": "Web Development" }` |

**Steps:**
1. Set method, URL, and headers as shown.
2. Paste the body.
3. Click Send.
4. Copy the `category_id` from the response and save it in the `category_id` environment variable.

**Expected response:**
- Status: `201 Created`
- Body:
```json
{
  "category_id": "uuid-here",
  "name": "Web Development",
  "parent": null,
  "children": []
}
```

---

#### Test B1.2 — Create a subcategory (child of Web Development)

| Field | Value |
|---|---|
| Method | POST |
| URL | `{{base_url}}/api/v1/categories` |
| Headers | `Content-Type: application/json`, `Authorization: Bearer {{admin_token}}` |
| Body | `{ "name": "JavaScript", "parentCategoryId": "{{category_id}}" }` |

**Steps:**
1. Make sure `category_id` is set from Test B1.1.
2. Send the request.
3. Note the subcategory's `category_id` — call it `sub_category_id` for later tests.

**Expected response:**
- Status: `201 Created`
- Body contains `parent.category_id` equal to the parent's UUID

---

#### Test B1.3 — Create category with duplicate name (expect 409)

| Field | Value |
|---|---|
| Method | POST |
| URL | `{{base_url}}/api/v1/categories` |
| Headers | `Content-Type: application/json`, `Authorization: Bearer {{admin_token}}` |
| Body | `{ "name": "Web Development" }` |

**Expected response:**
- Status: `409 Conflict`
- Body: `{ "message": "A category with this name already exists" }`

---

#### Test B1.4 — List all categories (public — no token)

| Field | Value |
|---|---|
| Method | GET |
| URL | `{{base_url}}/api/v1/categories` |
| Headers | *(none required)* |

**Expected response:**
- Status: `200 OK`
- Body: array of categories, each with `parent` and `children` relations
- "Web Development" appears with "JavaScript" in its `children` array

---

#### Test B1.5 — Rename a category

| Field | Value |
|---|---|
| Method | PATCH |
| URL | `{{base_url}}/api/v1/categories/{{category_id}}` |
| Headers | `Content-Type: application/json`, `Authorization: Bearer {{admin_token}}` |
| Body | `{ "name": "Web & Mobile Development" }` |

**Expected response:**
- Status: `200 OK`
- Body: category with updated `name`

---

#### Test B1.6 — Delete parent category that still has children (expect 400)

| Field | Value |
|---|---|
| Method | DELETE |
| URL | `{{base_url}}/api/v1/categories/{{category_id}}` |
| Headers | `Authorization: Bearer {{admin_token}}` |

**Expected response:**
- Status: `400 Bad Request`
- Body: `{ "message": "This category has 1 subcategory. Reassign or delete them first." }`

---

#### Test B1.7 — Delete a leaf category (no children)

First delete the "JavaScript" subcategory (use `sub_category_id` from B1.2):

| Field | Value |
|---|---|
| Method | DELETE |
| URL | `{{base_url}}/api/v1/categories/<sub_category_id>` |
| Headers | `Authorization: Bearer {{admin_token}}` |

**Expected response:**
- Status: `204 No Content`
- Body: empty

---

#### Test B1.8 — Delete non-existent category (expect 404)

| Field | Value |
|---|---|
| Method | DELETE |
| URL | `{{base_url}}/api/v1/categories/00000000-0000-0000-0000-000000000000` |
| Headers | `Authorization: Bearer {{admin_token}}` |

**Expected response:**
- Status: `404 Not Found`

---

### 1.3 Frontend Tests (Browser UI)

#### Test F1.1 — Create a category via admin UI

**Steps:**
1. Log in as Super Admin at `http://localhost:3000/login`.
2. Navigate to `http://localhost:3000/admin/categories`.
3. In the **Create Category** form, type `"Data Science"` in the Name field.
4. Leave Parent blank.
5. Click **Create Category**.

**Expected result:**
- "Data Science" appears in the categories list immediately.
- No page reload needed.

---

#### Test F1.2 — Create a subcategory via admin UI

**Steps:**
1. On the same `/admin/categories` page, type `"Machine Learning"` in the Name field.
2. In the Parent dropdown, select **Data Science**.
3. Click **Create Category**.

**Expected result:**
- "Machine Learning" appears in the list.
- Its parent is shown as "Data Science".

---

#### Test F1.3 — Submit empty category name (expect validation error)

**Steps:**
1. Leave the Name field empty on the `/admin/categories` form.
2. Click **Create Category**.

**Expected result:**
- An inline validation error appears: name is required.
- No API call is made (form validation prevents submission).

---

#### Test F1.4 — Delete a category with children (expect error message)

**Steps:**
1. On `/admin/categories`, find a category that has subcategories.
2. Click **Delete** next to it.
3. Confirm the deletion prompt.

**Expected result:**
- An error message appears: subcategories must be removed first.
- The category remains in the list.

---

## Test Suite 2 — US-12: Create Course

### 2.1 What this test covers

An authenticated instructor can create a course by filling in title, description, price, language, level, optional thumbnail URL, and optional category. The course is saved as **Draft** status. The instructor can view their courses list and edit a draft.

---

### 2.2 Backend Tests (Postman)

#### Test B2.1 — Create a course as instructor

> Ensure `instructor_token` is set from B0.2. Set `access_token` to `instructor_token` for this test.

| Field | Value |
|---|---|
| Method | POST |
| URL | `{{base_url}}/api/v1/courses` |
| Headers | `Content-Type: application/json`, `Authorization: Bearer {{instructor_token}}` |
| Body | `{ "title": "Learn TypeScript from Scratch", "description": "A complete TypeScript course for beginners.", "price": 29.99, "language": "English", "level": "beginner", "categoryId": "{{category_id}}" }` |

**Steps:**
1. Make sure `category_id` is set (from B1.1 or run B1.1 first to get a valid UUID).
2. Send the request.
3. Copy the `course_id` from the response and save it as `course_id` in the environment.

**Expected response:**
- Status: `201 Created`
- Body includes: `status: "draft"`, `title: "Learn TypeScript from Scratch"`

---

#### Test B2.2 — Create course with missing required fields (expect 400)

| Field | Value |
|---|---|
| Method | POST |
| URL | `{{base_url}}/api/v1/courses` |
| Headers | `Content-Type: application/json`, `Authorization: Bearer {{instructor_token}}` |
| Body | `{ "title": "Incomplete Course" }` |

**Expected response:**
- Status: `400 Bad Request`
- Body lists validation errors for missing `description`, `price`, `language`, `level`

---

#### Test B2.3 — List my courses (instructor's own courses only)

| Field | Value |
|---|---|
| Method | GET |
| URL | `{{base_url}}/api/v1/courses` |
| Headers | `Authorization: Bearer {{instructor_token}}` |

**Expected response:**
- Status: `200 OK`
- Body: array containing the course created in B2.1 (status `"draft"`)
- Does NOT show courses belonging to other instructors

---

#### Test B2.4 — Edit a draft course

| Field | Value |
|---|---|
| Method | PATCH |
| URL | `{{base_url}}/api/v1/courses/{{course_id}}` |
| Headers | `Content-Type: application/json`, `Authorization: Bearer {{instructor_token}}` |
| Body | `{ "price": 39.99, "description": "Updated description for the TypeScript course." }` |

**Expected response:**
- Status: `200 OK`
- Body: course with updated `price` and `description`

---

#### Test B2.5 — Create course with invalid level (expect 400)

| Field | Value |
|---|---|
| Method | POST |
| URL | `{{base_url}}/api/v1/courses` |
| Headers | `Content-Type: application/json`, `Authorization: Bearer {{instructor_token}}` |
| Body | `{ "title": "Bad Course", "description": "desc", "price": 10, "language": "English", "level": "expert" }` |

**Expected response:**
- Status: `400 Bad Request`
- `level` must be one of: `beginner`, `intermediate`, `advanced`

---

#### Test B2.6 — Create course without authentication (expect 401)

| Field | Value |
|---|---|
| Method | POST |
| URL | `{{base_url}}/api/v1/courses` |
| Headers | `Content-Type: application/json` *(no Authorization)* |
| Body | `{ "title": "Sneaky Course", "description": "desc", "price": 0, "language": "English", "level": "beginner" }` |

**Expected response:**
- Status: `401 Unauthorized`

---

### 2.3 Frontend Tests (Browser UI)

#### Test F2.1 — Create a course via instructor UI

**Steps:**
1. Log in as Instructor at `http://localhost:3000/login`.
2. Navigate to `http://localhost:3000/courses`.
3. Click **New Course**.
4. Fill in:
   - Title: `"React for Beginners"`
   - Description: `"Learn React from zero"`
   - Price: `19.99`
   - Language: `"English"`
   - Level: select `Beginner`
   - Category: select any available category
5. Click **Create Course**.

**Expected result:**
- Redirected to the course edit page.
- Course appears in the My Courses list with status `"draft"`.

---

#### Test F2.2 — Edit a draft course

**Steps:**
1. On `http://localhost:3000/courses`, click **Edit** next to a draft course.
2. Change the price to `24.99`.
3. Click **Save Changes**.

**Expected result:**
- Success message appears.
- The updated price is shown on the edit form.

---

#### Test F2.3 — Submit empty course form (expect validation errors)

**Steps:**
1. Navigate to `http://localhost:3000/courses/create`.
2. Click **Create Course** without filling in any fields.

**Expected result:**
- Validation errors appear under each required field (title, description, price, language, level).
- No API request is made.

---

## Test Suite 3 — US-13: Submit Course for Review

### 3.1 What this test covers

Once a course is in Draft status, the instructor can submit it for review. The status changes to **Pending** and the admin receives an email notification. The instructor cannot edit the course while it is pending.

---

### 3.2 Backend Tests (Postman)

#### Test B3.1 — Submit a draft course for review

| Field | Value |
|---|---|
| Method | POST |
| URL | `{{base_url}}/api/v1/courses/{{course_id}}/submit` |
| Headers | `Authorization: Bearer {{instructor_token}}` |

**Expected response:**
- Status: `200 OK`
- Body: course with `status: "pending"`

---

#### Test B3.2 — Attempt to edit a pending course (expect 403)

| Field | Value |
|---|---|
| Method | PATCH |
| URL | `{{base_url}}/api/v1/courses/{{course_id}}` |
| Headers | `Content-Type: application/json`, `Authorization: Bearer {{instructor_token}}` |
| Body | `{ "price": 9.99 }` |

**Expected response:**
- Status: `403 Forbidden`
- Body: `{ "message": "Course cannot be edited while it is pending review" }`

---

#### Test B3.3 — Submit an already-pending course again (expect 400)

| Field | Value |
|---|---|
| Method | POST |
| URL | `{{base_url}}/api/v1/courses/{{course_id}}/submit` |
| Headers | `Authorization: Bearer {{instructor_token}}` |

**Expected response:**
- Status: `400 Bad Request`
- Body: `{ "message": "Only draft or rejected courses can be submitted for review" }`

---

#### Test B3.4 — Submit a course belonging to a different instructor (expect 403)

| Field | Value |
|---|---|
| Method | POST |
| URL | `{{base_url}}/api/v1/courses/{{course_id}}/submit` |
| Headers | `Authorization: Bearer {{admin_token}}` *(use admin's token — not the owner)* |

**Expected response:**
- Status: `403 Forbidden`
- Body: `{ "message": "Access denied" }`

---

### 3.3 Frontend Tests (Browser UI)

#### Test F3.1 — Submit a course for review via UI

**Steps:**
1. Log in as Instructor at `http://localhost:3000/login`.
2. Navigate to `http://localhost:3000/courses`.
3. Click **Edit** on a Draft course.
4. Scroll to the bottom of the edit page.
5. Click **Submit for Review**.

**Expected result:**
- The course status changes to `"pending"` on the page.
- The **Edit** button for this course is no longer visible on the My Courses list (pending courses are read-only).

---

#### Test F3.2 — Verify pending course is read-only in the UI

**Steps:**
1. On `http://localhost:3000/courses`, observe the pending course.
2. Confirm there is no **Edit** button next to it.
3. Navigate directly to `http://localhost:3000/courses/<course_id>/edit`.

**Expected result:**
- If the page loads, all form fields should be disabled or a "cannot edit while pending" message should be visible.

---

## Test Suite 4 — US-14: Approve or Reject Course

### 4.1 What this test covers

An admin with the `approve:courses` permission can view pending courses, inspect each one, and either approve it (status → Published) or reject it (status → Rejected with a reason). On approval the instructor gets an email. On rejection the instructor can edit and resubmit.

---

### 4.2 Backend Tests (Postman)

> For these tests, use `admin_token`. Ensure there is at least one course in **Pending** status from Test B3.1.

#### Test B4.1 — List pending courses

| Field | Value |
|---|---|
| Method | GET |
| URL | `{{base_url}}/api/v1/courses/pending` |
| Headers | `Authorization: Bearer {{admin_token}}` |

**Expected response:**
- Status: `200 OK`
- Body: array of courses with `status: "pending"`, each including `instructor` and `category` objects

---

#### Test B4.2 — Get a single course for review

| Field | Value |
|---|---|
| Method | GET |
| URL | `{{base_url}}/api/v1/courses/{{course_id}}/review` |
| Headers | `Authorization: Bearer {{admin_token}}` |

**Expected response:**
- Status: `200 OK`
- Body: full course object including `instructor.full_name`, `instructor.email`, `category.name`

---

#### Test B4.3 — Approve a pending course

| Field | Value |
|---|---|
| Method | POST |
| URL | `{{base_url}}/api/v1/courses/{{course_id}}/approve` |
| Headers | `Authorization: Bearer {{admin_token}}` |

**Expected response:**
- Status: `200 OK`
- Body: course with `status: "published"` and `rejection_reason: null`

**Side effect:** instructor receives an email notification (check Mailtrap).

---

#### Test B4.4 — Approve an already-published course (expect 400)

| Field | Value |
|---|---|
| Method | POST |
| URL | `{{base_url}}/api/v1/courses/{{course_id}}/approve` |
| Headers | `Authorization: Bearer {{admin_token}}` |

**Expected response:**
- Status: `400 Bad Request`
- Body: `{ "message": "Only pending courses can be approved" }`

---

#### Test B4.5 — Reject a course (create a new pending course first)

> First, create and submit a **second** course using Tests B2.1 then B3.1. Save its ID as `course_id_2`.

| Field | Value |
|---|---|
| Method | POST |
| URL | `{{base_url}}/api/v1/courses/<course_id_2>/reject` |
| Headers | `Content-Type: application/json`, `Authorization: Bearer {{admin_token}}` |
| Body | `{ "reason": "The description is too short and lacks detail about the learning outcomes." }` |

**Expected response:**
- Status: `200 OK`
- Body: course with `status: "rejected"` and `rejection_reason` set to the reason string

**Side effect:** instructor receives a rejection email with the reason.

---

#### Test B4.6 — Reject a course with no reason (expect 400)

| Field | Value |
|---|---|
| Method | POST |
| URL | `{{base_url}}/api/v1/courses/<course_id_2>/reject` |
| Headers | `Content-Type: application/json`, `Authorization: Bearer {{admin_token}}` |
| Body | `{ "reason": "" }` |

**Expected response:**
- Status: `400 Bad Request`
- Validation error on `reason`

---

#### Test B4.7 — Instructor edits and resubmits a rejected course

**Steps:**
1. Run `PATCH /courses/<course_id_2>` with `instructor_token` — update the description.
2. Run `POST /courses/<course_id_2>/submit` with `instructor_token`.

**Expected response for submit:**
- Status: `200 OK`
- Body: `status: "pending"`, `rejection_reason` still present (cleared only on approve)

---

#### Test B4.8 — List pending courses as instructor (expect 403)

| Field | Value |
|---|---|
| Method | GET |
| URL | `{{base_url}}/api/v1/courses/pending` |
| Headers | `Authorization: Bearer {{instructor_token}}` |

**Expected response:**
- Status: `403 Forbidden` — instructor lacks `approve:courses` permission

---

### 4.3 Frontend Tests (Browser UI)

#### Test F4.1 — View pending courses list as admin

**Steps:**
1. Log in as Super Admin.
2. Navigate to `http://localhost:3000/admin/courses/pending`.

**Expected result:**
- Table shows all courses with status `"pending"`.
- Each row has a **Review** link.

---

#### Test F4.2 — Approve a course via admin UI

**Steps:**
1. On `/admin/courses/pending`, click **Review** on any pending course.
2. You are taken to `http://localhost:3000/admin/courses/<id>/review`.
3. Review the course details.
4. Click **Approve**.

**Expected result:**
- Success message appears.
- The course disappears from the pending list.
- Back on the Instructor account, the course status shows as `"published"` on `/courses`.

---

#### Test F4.3 — Reject a course with a reason via admin UI

**Steps:**
1. Navigate to `/admin/courses/pending`.
2. Click **Review** on a pending course.
3. Type a rejection reason into the reason field.
4. Click **Reject**.

**Expected result:**
- Success message appears.
- On the instructor's `/courses` page, the course shows status `"rejected"` and displays the rejection reason.
- The instructor can now click **Edit** on the rejected course again.

---

## Test Suite 5 — US-15: Search and Filter Courses

### 5.1 What this test covers

Any visitor (no account needed) can search published courses by keyword and filter by category, level, language, and price range. The results show thumbnail, title, instructor name, star rating, and price. The endpoint uses PostgreSQL full-text search on `title` and `description`.

> **Prerequisite for this suite:** At least one course must be in `"published"` status (run Suite 4 to approve one).

---

### 5.2 Backend Tests (Postman)

#### Test B5.1 — Search all published courses (no filters, no token)

| Field | Value |
|---|---|
| Method | GET |
| URL | `{{base_url}}/api/v1/courses/search` |
| Headers | *(none — this is a public endpoint)* |

**Expected response:**
- Status: `200 OK`
- Body: array of courses with `status: "published"` only
- Each result has: `course_id`, `title`, `instructor_name`, `category_name`, `level`, `language`, `price`, `rating`, `thumbnail_url`

---

#### Test B5.2 — Search by keyword

| Field | Value |
|---|---|
| Method | GET |
| URL | `{{base_url}}/api/v1/courses/search?q=TypeScript` |
| Headers | *(none)* |

**Expected response:**
- Status: `200 OK`
- Body: only courses whose title or description contains the word "TypeScript" (or a stem of it)
- If no published courses match, body is `[]`

---

#### Test B5.3 — Filter by level

| Field | Value |
|---|---|
| Method | GET |
| URL | `{{base_url}}/api/v1/courses/search?level=beginner` |
| Headers | *(none)* |

**Expected response:**
- Status: `200 OK`
- All returned courses have `level: "beginner"`

---

#### Test B5.4 — Filter by category UUID

| Field | Value |
|---|---|
| Method | GET |
| URL | `{{base_url}}/api/v1/courses/search?category={{category_id}}` |
| Headers | *(none)* |

**Expected response:**
- Status: `200 OK`
- All returned courses have `category_name` matching the category you created

---

#### Test B5.5 — Filter by price range

| Field | Value |
|---|---|
| Method | GET |
| URL | `{{base_url}}/api/v1/courses/search?minPrice=10&maxPrice=50` |
| Headers | *(none)* |

**Expected response:**
- Status: `200 OK`
- All returned courses have `price` between 10.00 and 50.00 inclusive

---

#### Test B5.6 — Combine keyword + level + price filters

| Field | Value |
|---|---|
| Method | GET |
| URL | `{{base_url}}/api/v1/courses/search?q=TypeScript&level=beginner&maxPrice=40` |
| Headers | *(none)* |

**Expected response:**
- Status: `200 OK`
- Results match all three criteria simultaneously

---

#### Test B5.7 — Search returns no results for unmatched keyword

| Field | Value |
|---|---|
| Method | GET |
| URL | `{{base_url}}/api/v1/courses/search?q=xyznonexistentword` |
| Headers | *(none)* |

**Expected response:**
- Status: `200 OK`
- Body: `[]` (empty array — not a 404)

---

#### Test B5.8 — Draft/pending courses are not returned

**Steps:**
1. Run B5.1 (no filters).
2. Verify that courses with `status: "draft"` or `status: "pending"` do NOT appear in the results.

**Expected result:**
- Every item in the response array has the field hidden (not included in the response shape), but you can verify by cross-referencing: the course you created in B2.1 (still draft or pending) should not be in the search results.

---

#### Test B5.9 — Invalid level value is rejected (expect 400)

| Field | Value |
|---|---|
| Method | GET |
| URL | `{{base_url}}/api/v1/courses/search?level=expert` |
| Headers | *(none)* |

**Expected response:**
- Status: `400 Bad Request`
- Validation error: level must be one of `beginner`, `intermediate`, `advanced`

---

### 5.3 Frontend Tests (Browser UI)

#### Test F5.1 — Open the Browse Courses page (no login required)

**Steps:**
1. Open a **private/incognito** browser window (no cookies, no login).
2. Navigate to `http://localhost:3000/search`.

**Expected result:**
- The "Browse Courses" page loads.
- The search form is visible: Keyword input, Category dropdown, Level dropdown, Language input, Min/Max Price inputs, and a Search button.
- The Results card shows published courses on initial load (or "No courses found" if none are published yet).

---

#### Test F5.2 — Search by keyword in the browser

**Steps:**
1. On `http://localhost:3000/search`, type `"TypeScript"` in the Keyword field.
2. Click **Search**.

**Expected result:**
- The results list updates.
- Only courses whose title/description match "TypeScript" are shown.
- Each result shows: thumbnail (or blank if none), title, instructor name, category, level, language, star rating, and price.

---

#### Test F5.3 — Filter by level

**Steps:**
1. Leave Keyword empty.
2. In the Level dropdown, select **Beginner**.
3. Click **Search**.

**Expected result:**
- All displayed courses show level `"Beginner"`.

---

#### Test F5.4 — Apply price range filter

**Steps:**
1. Leave Keyword and Level at defaults.
2. Type `10` in Min Price and `50` in Max Price.
3. Click **Search**.

**Expected result:**
- All displayed courses have a price between $10.00 and $50.00.

---

#### Test F5.5 — Combine filters

**Steps:**
1. Type `"React"` in Keyword.
2. Select a Category from the dropdown.
3. Select Level: **Beginner**.
4. Click **Search**.

**Expected result:**
- Results match all three criteria.
- If no courses match, "No courses found. Try different filters." message is shown.

---

#### Test F5.6 — Navigate to Browse from Navbar (any page)

**Steps:**
1. From any page (e.g. `/login`), look at the top Navbar.
2. Click the **Browse** link.

**Expected result:**
- Navigated to `/search` without a full page reload.

---

#### Test F5.7 — Confirm Browse page works without login

**Steps:**
1. In the private/incognito window from F5.1, ensure you are NOT logged in (no token).
2. Perform a search as in F5.2.

**Expected result:**
- Search works normally.
- No login prompt or 401 error.
- The Navbar shows **Login** and **Register** links (not Profile/Logout).
