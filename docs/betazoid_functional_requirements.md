# Betazoid — Functional Requirements & Agile Sprint Plan

**Version:** 1.0
**Methodology:** Agile (Scrum)
**Total Sprints:** 10
**Sprint Duration:** 2 weeks
**Total Timeline:** ~20 weeks

---

## Functional Modules Overview

| # | Module | Epics |
|---|---|---|
| 1 | Authentication & User Management | Registration, Login, Profile |
| 2 | Role & Permission Management | RBAC, Dynamic Roles |
| 3 | Course Management | Create, Review, Publish, Search |
| 4 | Section & Lecture Management | Structure, Reorder, Resources |
| 5 | Video Management | YouTube Integration, Access Control |
| 6 | Article Management | Rich Text, Reading Time |
| 7 | Quiz Management | Questions, Answers, Attempts |
| 8 | Enrollment & Order Management | Purchase, Payment, Coupon |
| 9 | Coupon Management | Discount Codes, Usage Limits |
| 10 | Progress Tracking | Lecture Completion, Course Progress |
| 11 | Certificate Management | Auto-generation, Verification |
| 12 | Review & Rating | Student Reviews, Average Rating |
| 13 | Payout Management | Earnings, Platform Cut, Processing |
| 14 | Admin Dashboard | Platform Overview, Analytics |

---

## Sprint 1 — Authentication & User Management

**Epic:** Authentication & User Management

---

### US-01 — User Registration

> As a new user, I want to register with my full name, email, Gmail, and password so that I can create an account on Betazoid.

**Acceptance Criteria:**
- User can submit registration form with all required fields
- System validates email uniqueness
- Password is hashed before storing
- User receives a confirmation email after registration

---

### US-02 — User Login

> As a registered user, I want to log in with my email and password so that I can access my account.

**Acceptance Criteria:**
- System returns a JWT access token and refresh token on success
- Invalid credentials return an appropriate error message
- Refresh token rotates on each use

---

### US-03 — User Logout

> As a logged-in user, I want to log out so that my session is terminated securely.

**Acceptance Criteria:**
- Refresh token is invalidated on logout
- User is redirected to the login page

---

### US-04 — Password Reset

> As a user who forgot their password, I want to receive a password reset email so that I can regain access to my account.

**Acceptance Criteria:**
- Reset link is sent to the registered email
- Link expires after 30 minutes
- Password is updated successfully after reset

---

### US-05 — Profile Management

> As a logged-in user, I want to view and update my profile so that my information stays current.

**Acceptance Criteria:**
- User can update name, bio, and profile photo
- Gmail field is visible but not editable after registration
- Changes are saved and reflected immediately

---

## Sprint 2 — Role & Permission Management

**Epic:** Dynamic RBAC

---

### US-06 — Create Role

> As a Super Admin, I want to create a new role so that I can define custom access levels for platform staff.

**Acceptance Criteria:**
- Role requires a unique name and optional description
- Created role appears in the roles list immediately

---

### US-07 — Assign Permissions to Role

> As a Super Admin, I want to assign permissions to a role so that I can control what actions each role can perform.

**Acceptance Criteria:**
- Permissions are listed by module and action
- Super Admin can check/uncheck permissions per role
- Changes take effect immediately without system restart

---

### US-08 — Assign Role to User

> As a Super Admin, I want to assign one or more roles to a user so that they gain the appropriate access.

**Acceptance Criteria:**
- Super Admin can search for a user and assign roles
- User can hold multiple roles simultaneously
- Access changes apply on the user's next request

---

### US-09 — Edit or Delete Role

> As a Super Admin, I want to edit or delete a role so that I can keep the role structure up to date.

**Acceptance Criteria:**
- Role name and description can be updated
- Deleting a role removes all associated user_role and role_permission records
- System warns before deletion if the role is currently assigned to users

---

### US-10 — Enforce Permissions on API Requests

> As the system, I want to enforce permissions on every API request so that unauthorized users cannot access restricted resources.

**Acceptance Criteria:**
- Every protected endpoint checks the authenticated user's permissions
- Unauthorized requests return a 403 response
- Permission checks use cached data from Redis to reduce database load

---

## Sprint 3 — Category & Course Management

**Epic:** Course Management

---

### US-11 — Category Management

> As an Admin, I want to create and manage course categories and subcategories so that courses are organized logically.

**Acceptance Criteria:**
- Categories can have an optional parent category
- Categories can be renamed or deleted
- Deleting a parent category prompts reassignment of subcategories

---

### US-12 — Create Course

> As an Instructor, I want to create a new course with basic details so that I can begin building my course content.

**Acceptance Criteria:**
- Instructor fills in title, description, price, thumbnail, language, level, and category
- Course is saved in Draft status by default
- Instructor can return and continue editing a draft

---

### US-13 — Submit Course for Review

> As an Instructor, I want to submit my course for review so that it can be published on the platform.

**Acceptance Criteria:**
- Course status changes from Draft to Pending on submission
- Admin/Moderator receives a notification of the pending course
- Instructor cannot edit the course while it is Pending

---

### US-14 — Approve or Reject Course

> As an Admin or Moderator, I want to approve or reject a submitted course so that only quality content is published.

**Acceptance Criteria:**
- Moderator can view the full course content before deciding
- Approved course status changes to Published
- Rejected course returns to the Instructor with a reason
- Instructor can edit and resubmit a rejected course

---

### US-15 — Search and Filter Courses

> As a Student, I want to search and filter courses so that I can find courses relevant to my interests.

**Acceptance Criteria:**
- Student can search by keyword
- Filters available: category, level, language, price range
- Results show course thumbnail, title, instructor name, rating, and price

---

## Sprint 4 — Section, Lecture & Resource Management

**Epic:** Section & Lecture Management

---

### US-16 — Section Management

> As an Instructor, I want to create and reorder sections within my course so that the course content is structured logically.

**Acceptance Criteria:**
- Instructor can add, rename, reorder, and delete sections
- Order number updates automatically on drag and drop reorder

---

### US-17 — Create Lecture

> As an Instructor, I want to create a lecture and choose its content type so that I can deliver content in the appropriate format.

**Acceptance Criteria:**
- Instructor selects content type: video, article, or quiz
- Lecture is linked to the correct section
- Instructor can reorder lectures within a section

---

### US-18 — Free Preview Toggle

> As an Instructor, I want to mark a lecture as free preview so that prospective students can sample the course before purchasing.

**Acceptance Criteria:**
- Free preview toggle is available per lecture
- Free preview lectures are accessible to non-enrolled users on the course page

---

### US-19 — Attach Lecture Resources

> As an Instructor, I want to attach downloadable resources to a lecture so that students have supplementary materials.

**Acceptance Criteria:**
- Instructor can upload files (PDF, ZIP, slide) or add external links
- Multiple resources can be attached to a single lecture
- Resources are listed and downloadable on the lecture page

---

## Sprint 5 — Video & Article Lecture Content

**Epic:** Video Management & Article Management

---

### US-20 — Submit YouTube Video to Lecture

> As an Instructor, I want to submit a YouTube Video ID and Playlist ID for a video lecture so that the video is linked to Betazoid.

**Acceptance Criteria:**
- Instructor pastes YouTube Video ID and Playlist ID into the lecture form
- System stores both identifiers and fetches video duration from YouTube API
- Video is displayed in an embedded YouTube player on the lecture page

---

### US-21 — Grant Gmail Access on Enrollment

> As the system, I want to grant a student's Gmail access to the course YouTube playlist on enrollment so that they can watch the video lectures.

**Acceptance Criteria:**
- Gmail grant is triggered automatically after successful payment
- Grant is processed as a background job via BullMQ
- Student can access videos within 60 seconds of enrollment

---

### US-22 — Revoke Gmail Access on Cancellation

> As the system, I want to revoke a student's Gmail access from the YouTube playlist on refund or cancellation so that they can no longer watch the videos.

**Acceptance Criteria:**
- Revocation is triggered automatically on enrollment cancellation
- Revocation is processed as a background job
- Student loses video access within 60 seconds of cancellation

---

### US-23 — Create Article Lecture

> As an Instructor, I want to create an article lecture with rich text content so that students can read written lessons.

**Acceptance Criteria:**
- Instructor uses a rich text editor to write the article
- Reading time is calculated and displayed automatically
- Article content is rendered cleanly on the lecture page for students

---

## Sprint 6 — Quiz System

**Epic:** Quiz Management

---

### US-24 — Create Quiz

> As an Instructor, I want to create a quiz for a lecture and set a passing percentage so that students are assessed on the content.

**Acceptance Criteria:**
- Instructor sets quiz title and pass percentage (0–100)
- Quiz is linked to one lecture

---

### US-25 — Add Quiz Questions and Answers

> As an Instructor, I want to add questions and answer options to a quiz so that students have meaningful questions to answer.

**Acceptance Criteria:**
- Each question has a text field and multiple answer options
- Instructor marks exactly one answer as correct per question
- Questions and answers can be reordered

---

### US-26 — Attempt Quiz

> As a Student, I want to attempt a quiz so that I can test my understanding of the lecture content.

**Acceptance Criteria:**
- Student selects one answer per question and submits
- System calculates score and compares against pass percentage
- Result (pass/fail) and score are displayed immediately after submission
- Student's selected answers are recorded in quiz_attempt_answers

---

### US-27 — Reattempt Quiz

> As a Student, I want to reattempt a quiz so that I can improve my score.

**Acceptance Criteria:**
- Student can attempt the quiz multiple times
- Each attempt is recorded separately with its own score and timestamp
- Previous attempt results are visible to the student

---

## Sprint 7 — Enrollment, Orders & Coupons

**Epic:** Enrollment & Order Management

---

### US-28 — Enroll in a Course

> As a Student, I want to enroll in a course by making a payment so that I can access the course content.

**Acceptance Criteria:**
- Student clicks enroll and is taken to the checkout page
- Payment details are submitted and an order record is created
- On payment success, enrollment is activated and Gmail is granted playlist access
- On payment failure, enrollment is not created

---

### US-29 — Apply Coupon at Checkout

> As a Student, I want to apply a coupon code at checkout so that I can receive a discount on the course price.

**Acceptance Criteria:**
- Student enters a coupon code and the discount is applied instantly
- System validates coupon expiry date and usage limit
- Discount type (percentage or fixed) is applied correctly to the order amount
- Used count increments after successful order

---

### US-30 — Manage Coupons

> As an Admin, I want to create and manage coupon codes so that I can run promotional campaigns.

**Acceptance Criteria:**
- Admin sets coupon code, discount type, discount value, expiry date, and usage limit
- Coupons can be deactivated manually before expiry
- Admin can view used count per coupon

---

## Sprint 8 — Progress Tracking & Certification

**Epic:** Progress Tracking & Certificate Management

---

### US-31 — Track Lecture Progress

> As a Student, I want my lecture progress to be tracked automatically so that I can see how far I have come in a course.

**Acceptance Criteria:**
- Lecture is marked complete when the student finishes watching, reading, or passing the quiz
- Overall course progress percentage is displayed on the student's dashboard
- Progress persists across sessions

---

### US-32 — Auto-generate Certificate

> As a Student, I want to receive a certificate automatically when I complete all lectures in a course so that I have proof of completion.

**Acceptance Criteria:**
- Certificate is generated when lecture progress reaches 100%
- Certificate contains student name, course title, completion date, and a unique certificate code
- Certificate is downloadable as a PDF

---

### US-33 — Verify Certificate

> As anyone, I want to verify a certificate using its unique code so that authenticity can be confirmed.

**Acceptance Criteria:**
- A public verification page accepts a certificate code
- If valid, the page displays the student name, course title, and issue date
- If invalid, an appropriate message is shown

---

## Sprint 9 — Reviews, Ratings & Payouts

**Epic:** Reviews & Payout Management

---

### US-34 — Submit Course Review

> As an enrolled Student, I want to submit a rating and review for a course I have taken so that I can share my experience with others.

**Acceptance Criteria:**
- Student selects a rating from 1 to 5 and optionally writes a comment
- Only one review is allowed per student per course
- Submitted review appears on the course page immediately
- Average rating on the course page updates automatically

---

### US-35 — View Instructor Earnings

> As an Instructor, I want to view my earnings per course so that I can track my revenue on the platform.

**Acceptance Criteria:**
- Instructor sees gross revenue, platform cut percentage, and net amount per payout record
- Earnings are broken down by course and time period

---

### US-36 — Process Instructor Payout

> As an Admin, I want to process instructor payouts so that instructors receive their earnings.

**Acceptance Criteria:**
- Admin views pending payout records per instructor
- Admin marks a payout as paid after processing
- Payout date is recorded on status change
- Instructor receives a notification when payout is processed

---

## Sprint 10 — Admin Dashboard, Polish & Testing

**Epic:** Admin Dashboard & Quality Assurance

---

### US-37 — Admin Dashboard Overview

> As an Admin, I want a dashboard overview so that I can monitor platform health at a glance.

**Acceptance Criteria:**
- Dashboard shows total users, total courses, total enrollments, and total revenue
- Pending course approvals are highlighted
- Recent orders and new user registrations are listed

---

### US-38 — API Testing

> As a Developer, I want all API endpoints to have unit and integration tests so that the platform is stable and regression-free.

**Acceptance Criteria:**
- Minimum 80% code coverage on backend services
- All critical paths (auth, enrollment, YouTube grant/revoke) have integration tests
- Tests run automatically on every pull request via GitHub Actions

---

### US-39 — Responsive Design

> As a User, I want the platform to be responsive and accessible on mobile and desktop so that I can learn from any device.

**Acceptance Criteria:**
- All pages render correctly on screen widths from 375px to 1440px
- Navigation is usable on touch devices
- Core actions (enroll, watch, attempt quiz) work on mobile browsers

---

### US-40 — Docker Containerization

> As a Developer, I want the application to be containerized with Docker so that it can be deployed consistently across environments.

**Acceptance Criteria:**
- Docker Compose file covers Next.js frontend, NestJS backend, PostgreSQL, and Redis
- Environment variables are managed via .env files
- Application starts successfully with a single docker-compose up command

---

## Sprint Summary

| Sprint | Focus | User Stories | Duration |
|---|---|---|---|
| Sprint 1 | Authentication & User Management | US-01 to US-05 | 2 weeks |
| Sprint 2 | Roles & Permissions | US-06 to US-10 | 2 weeks |
| Sprint 3 | Categories & Courses | US-11 to US-15 | 2 weeks |
| Sprint 4 | Sections & Lectures | US-16 to US-19 | 2 weeks |
| Sprint 5 | Video & Articles | US-20 to US-23 | 2 weeks |
| Sprint 6 | Quiz System | US-24 to US-27 | 2 weeks |
| Sprint 7 | Enrollment & Orders | US-28 to US-30 | 2 weeks |
| Sprint 8 | Progress & Certificates | US-31 to US-33 | 2 weeks |
| Sprint 9 | Reviews & Payouts | US-34 to US-36 | 2 weeks |
| Sprint 10 | Dashboard & QA | US-37 to US-40 | 2 weeks |

**Total User Stories:** 40
**Total Duration:** 20 weeks (~5 months)