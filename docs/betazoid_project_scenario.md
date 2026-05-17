# Betazoid — Project Scenario & System Design Document

**Version:** 1.0
**Prepared by:** Betazoid Development Team
**Year:** 2026

---

## 1. Executive Summary

Betazoid is a comprehensive online learning platform designed to bridge the gap between knowledge providers and learners across the globe. Built on the model of modern e-learning ecosystems, Betazoid enables qualified instructors to create, publish, and monetize structured educational courses, while providing students with a seamless and engaging learning experience through video lectures, articles, quizzes, and downloadable resources.

The platform operates on a multi-role architecture governed by a fully dynamic Role-Based Access Control (RBAC) system, allowing platform administrators to define, assign, and revoke access permissions without any changes to the underlying system code. This design ensures that Betazoid can scale its operational structure as the organization grows, accommodating new roles and responsibilities at any stage.

At its core, Betazoid addresses three primary stakeholders: students who seek quality education, instructors who wish to share expertise and generate revenue, and administrators who manage and maintain platform integrity. The platform integrates with YouTube's private playlist infrastructure for secure video streaming, ensuring that course content is only accessible to enrolled students via their registered Gmail accounts.

Betazoid is designed for long-term scalability, commercial viability, and institutional adoption, with features including coupon-based discount management, instructor payout tracking, certificate generation, and a full quiz and progress tracking system.

---

## 2. Project Scope & Objectives

### 2.1 Project Scope

The scope of Betazoid encompasses the full lifecycle of online education delivery, from course creation and publication to student enrollment, learning, assessment, and certification. The platform is designed to support an unlimited number of users, courses, and categories, with the infrastructure capable of handling concurrent sessions at scale.

The following areas are within the scope of this project:

- User registration, authentication, and profile management
- Dynamic role and permission management via an administrative panel
- Course creation, structuring, and publication workflow
- Lecture content management including videos, articles, quizzes, and downloadable resources
- Secure video hosting and streaming via YouTube private playlists
- Student enrollment, order processing, and coupon-based discount application
- Lecture progress tracking and course completion certification
- Quiz creation, attempt recording, and scoring
- Instructor revenue tracking and payout management
- Student review and rating system

### 2.2 Objectives

#### 2.2.1 Objectives for Students

- Provide a clean, intuitive interface for browsing and discovering courses by category, level, and language
- Enable seamless enrollment and access to purchased course content
- Track individual lecture and overall course progress automatically
- Support quiz participation with instant scoring and pass/fail feedback
- Issue verifiable certificates upon successful course completion
- Allow students to leave ratings and written reviews for completed courses

#### 2.2.2 Objectives for Instructors

- Provide a structured course builder supporting sections, lectures, and multiple content types
- Enable video upload and management via YouTube private playlist integration
- Allow instructors to attach downloadable resources to individual lectures
- Offer a transparent revenue and payout dashboard
- Support quiz creation with configurable questions, answers, and passing thresholds

#### 2.2.3 Objectives for Administrators

- Provide a centralized admin panel for managing users, courses, roles, and permissions
- Enable dynamic role creation and permission assignment without code changes
- Manage coupon creation, discount configuration, and usage tracking
- Oversee course approval workflows and content moderation
- Monitor platform-wide analytics including revenue, enrollments, and active users

---

## 3. Technical Specifications

### 3.1 Recommended Tech Stack

#### 3.1.1 Frontend

| Layer                        | Technology                           |
| ---------------------------- | ------------------------------------ |
| Framework                    | Next.js 1(App Router)                |
| Language                     | TypeScript                           |
| Styling                      | Tailwind CSS                         |
| State Management             | Zustand                              |
| Server State / Data Fetching | TanStack Query                       |
| Video Player                 | YouTube IFrame API (embedded player) |
| Form Handling                | React Hook Form with Zod validation  |
| HTTP Client                  | Axios                                |

Next.js 14 with the App Router is selected as the frontend framework. It provides server-side rendering for SEO-optimised course discovery pages, React Server Components for reduced client-side JavaScript, and a file-based routing system that maps naturally to the platform structure. TypeScript is used throughout the frontend codebase to enforce type safety, improve developer tooling, and reduce runtime errors. Tailwind CSS provides utility-first styling that keeps the UI consistent and maintainable at scale.

#### 3.1.2 Backend

| Layer               | Technology                                        |
| ------------------- | ------------------------------------------------- |
| Framework           | NestJS                                            |
| Language            | TypeScript                                        |
| Authentication      | JWT with refresh token rotation via Passport.js   |
| Authorization       | Custom RBAC Guard based on role-permission tables |
| API Architecture    | RESTful API with versioning (/api/v1/)            |
| ORM                 | TypeORM or Prisma                                 |
| Email Service       | Nodemailer with SendGrid or Mailgun               |
| Queue / Jobs        | BullMQ with Redis for background tasks            |
| YouTube Integration | Google YouTube Data API v3                        |
| Validation          | class-validator and class-transformer             |

NestJS is selected as the backend framework due to its modular architecture, built-in dependency injection, and first-class TypeScript support. It shares the same language as the frontend, allowing seamless type sharing across the stack. NestJS modules map directly to platform domains such as users, courses, enrollments, and payouts, making the codebase highly organised and testable. The RBAC Guard reads the authenticated user role and permission records on each request and enforces access control before the request reaches the controller. YouTube API calls for granting and revoking Gmail access to private playlists are handled as BullMQ background jobs to avoid blocking the enrollment response.

#### 3.1.3 Database

| Layer            | Technology                                                    |
| ---------------- | ------------------------------------------------------------- |
| Primary Database | PostgreSQL                                                    |
| ORM              | TypeORM or Prisma (integrated with NestJS)                    |
| Caching Layer    | Redis (session management, rate limiting, permission caching) |
| Search           | Meilisearch for course search and filtering                   |

PostgreSQL is chosen as the primary relational database for Betazoid due to its robustness, ACID compliance, and strong support for complex relational queries required by the platform schema. TypeORM or Prisma integrates natively with NestJS and provides a type-safe query interface that is consistent with the TypeScript-first development approach. Redis serves as the caching and queue layer, handling user session tokens, rate limiting, permission lookup caching, and BullMQ job queues for background processing.

#### 3.1.4 Infrastructure

| Layer            | Technology                                            |
| ---------------- | ----------------------------------------------------- |
| Hosting          | AWS, DigitalOcean, or Railway                         |
| File Storage     | AWS S3 or Cloudflare R2 (thumbnails, resources, PDFs) |
| CDN              | Cloudflare                                            |
| Containerization | Docker with Docker Compose                            |
| CI/CD            | GitHub Actions                                        |

### 3.2 Video Hosting and Streaming Strategy

Betazoid does not self-host video files. Instead, all course video content is managed through YouTube's private playlist infrastructure. This approach eliminates the cost and complexity of video encoding, storage, and adaptive bitrate streaming, leveraging YouTube's globally distributed delivery network at no additional cost.

The video management workflow operates as follows:

1. The instructor uploads their video directly to their YouTube channel and sets the video visibility to Private.
2. The instructor adds the video to a designated private playlist created for that specific course on Betazoid.
3. The instructor submits the YouTube Video ID and Playlist ID through the Betazoid course builder interface, which stores these identifiers in the Videos table.
4. When a student successfully enrolls in the course, the Betazoid backend calls the YouTube Data API v3 to add the student's registered Gmail address as a viewer of the private playlist.
5. The student can then access the video lectures inside Betazoid via an embedded YouTube IFrame player, which streams directly from YouTube. The video remains private and cannot be accessed outside of the playlist sharing context.
6. If the student's enrollment is cancelled or refunded, the backend calls the YouTube API again to remove the student's Gmail from the playlist, immediately revoking their access to the video content.

This strategy ensures content security, eliminates bandwidth costs for Betazoid, and provides students with a high-quality streaming experience backed by YouTube's infrastructure.

---

## 4. Database Design & Architecture

### 4.1 Database Scenario

Betazoid is an online learning platform developed to provide, manage, and deliver educational courses to learners worldwide. Betazoid integrates with YouTube to stream course video content securely through private playlists, where access is granted to Students via their registered Gmail address.

Each **User** has a unique **User_ID** and has the following attributes: **Full_Name**, **Email**, **Gmail**, **Password**, **Profile_Photo**, **Bio**, and **Joined_Date**, where **Gmail** is the Google account address used to grant the User access to private YouTube playlists containing course video content. A User can be assigned one or more **Roles**, and each Role can be assigned to one or more Users. This relationship is managed through a **User_Role** record, which has a unique **User_Role_ID** and the following attributes: **User_ID** and **Role_ID**. Each Role has a unique **Role_ID** and the following attributes: **Role_Name** and **Description**. The Super Admin can create, modify, or remove Roles at any time without any change to the system code.

Each Role can have one or more **Permissions** assigned to it, and each Permission can belong to multiple Roles. This relationship is managed through a **Role_Permission** record, which has a unique **Role_Permission_ID** and the following attributes: **Role_ID** and **Permission_ID**. Each Permission has a unique **Permission_ID** and the following attributes: **Permission_Name** and **Module**, where **Permission_Name** represents the specific action such as *create*, *read*, *update*, or *delete*, and **Module** represents the section of the system the action belongs to such as *courses*, *lectures*, *users*, or *payouts*. The Super Admin can assign or revoke Permissions from any Role at any time without any change to the system code.

Each **Course** has a unique **Course_ID** and has the following attributes: **Title**, **Description**, **Price**, **Thumbnail**, **Language**, **Level**, and **Status**, where **Level** indicates whether the course is *beginner*, *intermediate*, or *advanced*, and **Status** indicates whether the course is *draft*, *pending*, *published*, or *rejected*. Each Course is created by one Instructor but an Instructor can create many Courses. Each Course belongs to one **Category**, but one Category can have many Courses. Each Category has a unique **Category_ID** and the following attributes: **Category_Name** and **Parent_Category_ID**, where **Parent_Category_ID** references another Category to allow subcategories to exist under a main category. If a Category has no parent, the Parent_Category_ID is null.

Each Course can have one or more **Sections**. Each Section has a unique **Section_ID** and the following attributes: **Course_ID**, **Section_Title**, and **Order_Number**, where **Order_Number** maintains the sequence of Sections within a Course. Each Section can have one or more **Lectures**. Each Lecture acts as a container for different types of content. Each Lecture has a unique **Lecture_ID** and the following attributes: **Section_ID**, **Lecture_Title**, **Content_Type**, **Order_Number**, and **Is_Free_Preview**, where **Content_Type** indicates whether the Lecture contains a *video*, *article*, or *quiz*, and **Is_Free_Preview** indicates whether the Lecture is accessible to a User before purchasing the Course.

If the **Content_Type** of a Lecture is *video*, the Lecture is associated with one **Video**. Each Video has a unique **Video_ID** and the following attributes: **Lecture_ID**, **YouTube_Video_ID**, **YouTube_Playlist_ID**, and **Duration**, where **YouTube_Video_ID** is the unique identifier of the video on YouTube, **YouTube_Playlist_ID** is the identifier of the private YouTube playlist the video belongs to, and **Duration** represents the length of the video in seconds fetched from the YouTube API. Each Video belongs to only one Lecture and each Lecture can have only one Video. When a Student enrolls in a Course, the system automatically grants the Student's **Gmail** access to the **YouTube_Playlist_ID** associated with all video Lectures in that Course. When a Student's enrollment is revoked or refunded, the system automatically removes the Student's **Gmail** access from the associated YouTube playlist.

If the **Content_Type** of a Lecture is *article*, the Lecture is associated with one **Article**. Each Article has a unique **Article_ID** and the following attributes: **Lecture_ID**, **Content**, and **Reading_Time**, where **Content** stores the rich text body of the article and **Reading_Time** represents the estimated time in minutes to read the article. Each Article belongs to only one Lecture and each Lecture can have only one Article.

If the **Content_Type** of a Lecture is *quiz*, the Lecture is associated with one **Quiz**. Each Quiz has a unique **Quiz_ID** and the following attributes: **Lecture_ID**, **Quiz_Title**, and **Pass_Percentage**, where **Pass_Percentage** represents the minimum score required to pass the quiz. Each Quiz can have one or more **Quiz_Questions**. Each Quiz_Question has a unique **Question_ID** and the following attributes: **Quiz_ID**, **Question_Text**, and **Order_Number**. Each Quiz_Question can have one or more **Quiz_Answers**. Each Quiz_Answer has a unique **Answer_ID** and the following attributes: **Question_ID**, **Answer_Text**, and **Is_Correct**, where **Is_Correct** indicates whether the answer is the correct option.

Regardless of the **Content_Type**, each Lecture can have zero or more **Lecture_Resources** attached to it. Each Lecture_Resource has a unique **Resource_ID** and the following attributes: **Lecture_ID**, **Resource_Title**, **Resource_Type**, and **Resource_URL**, where **Resource_Type** indicates whether the resource is a *PDF*, *ZIP*, *source code*, *slide*, or *external link*.

A Student can enroll in one or more Courses, and each Course can have many Students enrolled. Each **Enrollment** has a unique **Enrollment_ID** and the following attributes: **User_ID**, **Course_ID**, and **Enrolled_Date**. Each Enrollment is associated with one **Order**, and each Order is associated with one Enrollment. Each Order has a unique **Order_ID** and the following attributes: **Enrollment_ID**, **Amount**, **Coupon_ID**, **Payment_Method**, **Payment_Status**, and **Order_Date**, where **Payment_Status** indicates whether the payment is *pending*, *completed*, or *failed*, and **Coupon_ID** is null if no Coupon was applied. Each **Coupon** has a unique **Coupon_ID** and the following attributes: **Coupon_Code**, **Discount_Type**, **Discount_Value**, **Expiry_Date**, **Usage_Limit**, and **Used_Count**, where **Discount_Type** indicates whether the discount is a *percentage* or a *fixed* amount. One Coupon can be applied to many Orders but each Order can have only one Coupon applied to it.

Each Student can track their progress per Lecture. Each **Lecture_Progress** record has a unique **Progress_ID** and the following attributes: **User_ID**, **Lecture_ID**, **Is_Completed**, and **Last_Watched_At**, where **Is_Completed** indicates whether the Student has fully completed the Lecture. When all Lectures in a Course are completed by a Student, the system generates a **Certificate** for that Student. Each Certificate has a unique **Certificate_ID** and the following attributes: **User_ID**, **Course_ID**, **Issued_Date**, and **Certificate_Code**, where **Certificate_Code** is a unique verifiable code generated by the system.

If a Lecture contains a **Quiz**, each Student attempt is recorded. Each **Quiz_Attempt** has a unique **Attempt_ID** and the following attributes: **User_ID**, **Quiz_ID**, **Score**, **Is_Passed**, and **Attempted_At**, where **Is_Passed** indicates whether the Student met the **Pass_Percentage** of the Quiz. Each Quiz_Attempt can have one or more **Quiz_Attempt_Answers** recording the Student's selected answers. Each Quiz_Attempt_Answer has a unique **Attempt_Answer_ID** and the following attributes: **Attempt_ID**, **Question_ID**, and **Answer_ID**.

Each Course can have one or more **Reviews** written by enrolled Students, but each Student can write only one Review per Course. Each Review has a unique **Review_ID** and the following attributes: **User_ID**, **Course_ID**, **Rating**, **Comment**, and **Review_Date**, where **Rating** is a numeric value between 1 and 5.

Each Instructor is eligible for a **Payout** based on their course revenue. Each Payout has a unique **Payout_ID** and the following attributes: **Instructor_ID**, **Amount**, **Platform_Cut**, **Net_Amount**, **Status**, and **Payout_Date**, where **Platform_Cut** represents the percentage the platform deducts, **Net_Amount** represents the final amount transferred to the Instructor, and **Status** indicates whether the payout is *pending* or *paid*.

---

### 4.2 ER Diagram

The Entity-Relationship Diagram for Betazoid follows the standard ER model notation, using rectangles to represent entities, diamonds to represent relationships, and ellipses to represent attributes. Underlined attributes indicate primary keys. Cardinality is annotated on each relationship line to indicate the nature of associations between entities.

The diagram covers the following entity groups:

- Users, Roles, Permissions and their junction tables (User_Roles, Role_Permissions)
- Courses, Categories, Sections, and Lectures
- Content entities: Videos, Articles, Quizzes, Quiz_Questions, Quiz_Answers, and Lecture_Resources
- Quiz_Attempts and Quiz_Attempt_Answers
- Enrollments, Orders, and Coupons
- Lecture_Progress and Certificates
- Reviews and Payouts

The ER diagram has been prepared separately as a draw.io file and is to be referenced alongside this document.

---

### 4.3 Cardinality Reference

| Entity A       | Relationship      | Entity B             | Cardinality |
| -------------- | ----------------- | -------------------- | ----------- |
| USERS          | HAS ROLE          | USER_ROLES           | 1 : N       |
| ROLES          | HAS ROLE          | USER_ROLES           | 1 : N       |
| ROLES          | HAS PERMISSION    | ROLE_PERMISSIONS     | 1 : N       |
| PERMISSIONS    | HAS PERMISSION    | ROLE_PERMISSIONS     | 1 : N       |
| USERS          | TEACHES           | COURSES              | 1 : N       |
| COURSES        | IN CATEGORY       | CATEGORIES           | N : 1       |
| CATEGORIES     | PARENT OF         | CATEGORIES (self)    | 1 : N       |
| COURSES        | HAS SECTIONS      | SECTIONS             | 1 : N       |
| SECTIONS       | HAS LECTURES      | LECTURES             | 1 : N       |
| LECTURES       | HAS VIDEO         | VIDEOS               | 1 : 1       |
| LECTURES       | HAS ARTICLE       | ARTICLES             | 1 : 1       |
| LECTURES       | IS QUIZ           | QUIZZES              | 1 : 1       |
| LECTURES       | HAS RESOURCE      | LECTURE_RESOURCES    | 1 : N       |
| QUIZZES        | HAS QUESTION      | QUIZ_QUESTIONS       | 1 : N       |
| QUIZ_QUESTIONS | HAS ANSWER        | QUIZ_ANSWERS         | 1 : N       |
| USERS          | ATTEMPTS QUIZ     | QUIZ_ATTEMPTS        | 1 : N       |
| QUIZZES        | ATTEMPTS QUIZ     | QUIZ_ATTEMPTS        | 1 : N       |
| QUIZ_ATTEMPTS  | HAS ANSWER RECORD | QUIZ_ATTEMPT_ANSWERS | 1 : N       |
| QUIZ_QUESTIONS | RECORDED IN       | QUIZ_ATTEMPT_ANSWERS | 1 : N       |
| QUIZ_ANSWERS   | RECORDED IN       | QUIZ_ATTEMPT_ANSWERS | 1 : N       |
| USERS          | ENROLLS IN        | ENROLLMENTS          | 1 : N       |
| COURSES        | ENROLLS IN        | ENROLLMENTS          | 1 : N       |
| ENROLLMENTS    | PAID VIA          | ORDERS               | 1 : 1       |
| COUPONS        | APPLIES TO        | ORDERS               | 1 : N       |
| USERS          | TRACKS PROGRESS   | LECTURE_PROGRESS     | 1 : N       |
| LECTURES       | TRACKS PROGRESS   | LECTURE_PROGRESS     | 1 : N       |
| USERS          | EARNS CERT        | CERTIFICATES         | 1 : N       |
| COURSES        | EARNS CERT        | CERTIFICATES         | 1 : N       |
| USERS          | WRITES REVIEW     | REVIEWS              | 1 : N       |
| COURSES        | WRITES REVIEW     | REVIEWS              | 1 : N       |
| USERS          | RECEIVES PAY      | PAYOUTS              | 1 : N       |

---

### 4.4 Database Tables

#### Table 1: users

| Column        | Data Type    | Constraint              | Description                            |
| ------------- | ------------ | ----------------------- | -------------------------------------- |
| user_id       | BIGINT       | PK, AUTO INCREMENT      | Unique identifier for each user        |
| full_name     | VARCHAR(150) | NOT NULL                | Full name of the user                  |
| email         | VARCHAR(255) | NOT NULL, UNIQUE        | Login email address                    |
| gmail         | VARCHAR(255) | NOT NULL                | Gmail used for YouTube playlist access |
| password      | VARCHAR(255) | NOT NULL                | Hashed password                        |
| profile_photo | VARCHAR(500) | NULLABLE                | URL to profile image                   |
| bio           | TEXT         | NULLABLE                | Short user biography                   |
| joined_date   | TIMESTAMP    | NOT NULL, DEFAULT NOW() | Account creation timestamp             |

#### Table 2: roles

| Column      | Data Type    | Constraint         | Description                       |
| ----------- | ------------ | ------------------ | --------------------------------- |
| role_id     | BIGINT       | PK, AUTO INCREMENT | Unique identifier for each role   |
| role_name   | VARCHAR(100) | NOT NULL, UNIQUE   | Name of the role                  |
| description | TEXT         | NULLABLE           | Description of the role's purpose |

#### Table 3: user_roles

| Column       | Data Type | Constraint          | Description           |
| ------------ | --------- | ------------------- | --------------------- |
| user_role_id | BIGINT    | PK, AUTO INCREMENT  | Unique identifier     |
| user_id      | BIGINT    | FK -> users.user_id | Reference to the user |
| role_id      | BIGINT    | FK -> roles.role_id | Reference to the role |

#### Table 4: permissions

| Column          | Data Type    | Constraint         | Description                                  |
| --------------- | ------------ | ------------------ | -------------------------------------------- |
| permission_id   | BIGINT       | PK, AUTO INCREMENT | Unique identifier                            |
| permission_name | VARCHAR(100) | NOT NULL           | Action: create, read, update, delete         |
| module          | VARCHAR(100) | NOT NULL           | System module: courses, users, payouts, etc. |

#### Table 5: role_permissions

| Column             | Data Type | Constraint                      | Description                 |
| ------------------ | --------- | ------------------------------- | --------------------------- |
| role_permission_id | BIGINT    | PK, AUTO INCREMENT              | Unique identifier           |
| role_id            | BIGINT    | FK -> roles.role_id             | Reference to the role       |
| permission_id      | BIGINT    | FK -> permissions.permission_id | Reference to the permission |

#### Table 6: categories

| Column             | Data Type    | Constraint                             | Description                      |
| ------------------ | ------------ | -------------------------------------- | -------------------------------- |
| category_id        | BIGINT       | PK, AUTO INCREMENT                     | Unique identifier                |
| category_name      | VARCHAR(150) | NOT NULL                               | Name of the category             |
| parent_category_id | BIGINT       | FK -> categories.category_id, NULLABLE | Self-reference for subcategories |

#### Table 7: courses

| Column      | Data Type     | Constraint                   | Description                            |
| ----------- | ------------- | ---------------------------- | -------------------------------------- |
| course_id   | BIGINT        | PK, AUTO INCREMENT           | Unique identifier for the course       |
| user_id     | BIGINT        | FK -> users.user_id          | Reference to the instructor            |
| category_id | BIGINT        | FK -> categories.category_id | Reference to the category              |
| title       | VARCHAR(300)  | NOT NULL                     | Course title                           |
| description | TEXT          | NOT NULL                     | Full course description                |
| price       | DECIMAL(10,2) | NOT NULL                     | Price of the course                    |
| thumbnail   | VARCHAR(500)  | NULLABLE                     | URL to course thumbnail image          |
| language    | VARCHAR(80)   | NOT NULL                     | Language of instruction                |
| level       | ENUM          | NOT NULL                     | beginner, intermediate, or advanced    |
| status      | ENUM          | NOT NULL                     | draft, pending, published, or rejected |

#### Table 8: sections

| Column        | Data Type    | Constraint              | Description                     |
| ------------- | ------------ | ----------------------- | ------------------------------- |
| section_id    | BIGINT       | PK, AUTO INCREMENT      | Unique identifier               |
| course_id     | BIGINT       | FK -> courses.course_id | Reference to the parent course  |
| section_title | VARCHAR(255) | NOT NULL                | Title of the section            |
| order_number  | INT          | NOT NULL                | Display order within the course |

#### Table 9: lectures

| Column          | Data Type    | Constraint                | Description                      |
| --------------- | ------------ | ------------------------- | -------------------------------- |
| lecture_id      | BIGINT       | PK, AUTO INCREMENT        | Unique identifier                |
| section_id      | BIGINT       | FK -> sections.section_id | Reference to the parent section  |
| lecture_title   | VARCHAR(255) | NOT NULL                  | Title of the lecture             |
| content_type    | ENUM         | NOT NULL                  | video, article, or quiz          |
| order_number    | INT          | NOT NULL                  | Display order within the section |
| is_free_preview | BOOLEAN      | NOT NULL, DEFAULT FALSE   | Accessible before enrollment     |

#### Table 10: videos

| Column              | Data Type   | Constraint                        | Description                         |
| ------------------- | ----------- | --------------------------------- | ----------------------------------- |
| video_id            | BIGINT      | PK, AUTO INCREMENT                | Unique identifier                   |
| lecture_id          | BIGINT      | FK -> lectures.lecture_id, UNIQUE | Reference to the parent lecture     |
| youtube_video_id    | VARCHAR(50) | NOT NULL                          | YouTube video identifier            |
| youtube_playlist_id | VARCHAR(50) | NOT NULL                          | YouTube private playlist identifier |
| duration            | INT         | NULLABLE                          | Video duration in seconds           |

#### Table 11: articles

| Column       | Data Type | Constraint                        | Description                       |
| ------------ | --------- | --------------------------------- | --------------------------------- |
| article_id   | BIGINT    | PK, AUTO INCREMENT                | Unique identifier                 |
| lecture_id   | BIGINT    | FK -> lectures.lecture_id, UNIQUE | Reference to the parent lecture   |
| content      | LONGTEXT  | NOT NULL                          | Rich text body of the article     |
| reading_time | INT       | NULLABLE                          | Estimated reading time in minutes |

#### Table 12: quizzes

| Column          | Data Type    | Constraint                        | Description                      |
| --------------- | ------------ | --------------------------------- | -------------------------------- |
| quiz_id         | BIGINT       | PK, AUTO INCREMENT                | Unique identifier                |
| lecture_id      | BIGINT       | FK -> lectures.lecture_id, UNIQUE | Reference to the parent lecture  |
| quiz_title      | VARCHAR(255) | NOT NULL                          | Title of the quiz                |
| pass_percentage | DECIMAL(5,2) | NOT NULL                          | Minimum score percentage to pass |

#### Table 13: quiz_questions

| Column        | Data Type | Constraint            | Description                   |
| ------------- | --------- | --------------------- | ----------------------------- |
| question_id   | BIGINT    | PK, AUTO INCREMENT    | Unique identifier             |
| quiz_id       | BIGINT    | FK -> quizzes.quiz_id | Reference to the parent quiz  |
| question_text | TEXT      | NOT NULL              | The question content          |
| order_number  | INT       | NOT NULL              | Display order within the quiz |

#### Table 14: quiz_answers

| Column      | Data Type | Constraint                       | Description                            |
| ----------- | --------- | -------------------------------- | -------------------------------------- |
| answer_id   | BIGINT    | PK, AUTO INCREMENT               | Unique identifier                      |
| question_id | BIGINT    | FK -> quiz_questions.question_id | Reference to the parent question       |
| answer_text | TEXT      | NOT NULL                         | The answer option content              |
| is_correct  | BOOLEAN   | NOT NULL                         | Whether this answer is the correct one |

#### Table 15: lecture_resources

| Column         | Data Type    | Constraint                | Description                                 |
| -------------- | ------------ | ------------------------- | ------------------------------------------- |
| resource_id    | BIGINT       | PK, AUTO INCREMENT        | Unique identifier                           |
| lecture_id     | BIGINT       | FK -> lectures.lecture_id | Reference to the parent lecture             |
| resource_title | VARCHAR(255) | NOT NULL                  | Display name of the resource                |
| resource_type  | ENUM         | NOT NULL                  | pdf, zip, source_code, slide, external_link |
| resource_url   | VARCHAR(500) | NOT NULL                  | URL or path to the resource file            |

#### Table 16: coupons

| Column         | Data Type     | Constraint          | Description                       |
| -------------- | ------------- | ------------------- | --------------------------------- |
| coupon_id      | BIGINT        | PK, AUTO INCREMENT  | Unique identifier                 |
| coupon_code    | VARCHAR(100)  | NOT NULL, UNIQUE    | The discount code string          |
| discount_type  | ENUM          | NOT NULL            | percentage or fixed               |
| discount_value | DECIMAL(10,2) | NOT NULL            | The discount amount or percentage |
| expiry_date    | DATE          | NOT NULL            | Coupon expiration date            |
| usage_limit    | INT           | NOT NULL            | Maximum number of uses            |
| used_count     | INT           | NOT NULL, DEFAULT 0 | Number of times used              |

#### Table 17: enrollments

| Column        | Data Type | Constraint              | Description                       |
| ------------- | --------- | ----------------------- | --------------------------------- |
| enrollment_id | BIGINT    | PK, AUTO INCREMENT      | Unique identifier                 |
| user_id       | BIGINT    | FK -> users.user_id     | Reference to the enrolled student |
| course_id     | BIGINT    | FK -> courses.course_id | Reference to the enrolled course  |
| enrolled_date | TIMESTAMP | NOT NULL, DEFAULT NOW() | Timestamp of enrollment           |

#### Table 18: orders

| Column         | Data Type     | Constraint                              | Description                        |
| -------------- | ------------- | --------------------------------------- | ---------------------------------- |
| order_id       | BIGINT        | PK, AUTO INCREMENT                      | Unique identifier                  |
| enrollment_id  | BIGINT        | FK -> enrollments.enrollment_id, UNIQUE | Reference to the linked enrollment |
| coupon_id      | BIGINT        | FK -> coupons.coupon_id, NULLABLE       | Reference to applied coupon if any |
| amount         | DECIMAL(10,2) | NOT NULL                                | Final amount paid after discount   |
| payment_method | VARCHAR(100)  | NOT NULL                                | Payment method used                |
| payment_status | ENUM          | NOT NULL                                | pending, completed, or failed      |
| order_date     | TIMESTAMP     | NOT NULL, DEFAULT NOW()                 | Timestamp of order creation        |

#### Table 19: lecture_progress

| Column          | Data Type | Constraint                | Description                                |
| --------------- | --------- | ------------------------- | ------------------------------------------ |
| progress_id     | BIGINT    | PK, AUTO INCREMENT        | Unique identifier                          |
| user_id         | BIGINT    | FK -> users.user_id       | Reference to the student                   |
| lecture_id      | BIGINT    | FK -> lectures.lecture_id | Reference to the lecture                   |
| is_completed    | BOOLEAN   | NOT NULL, DEFAULT FALSE   | Whether the lecture is marked complete     |
| last_watched_at | TIMESTAMP | NULLABLE                  | Last time the student accessed the lecture |

#### Table 20: certificates

| Column           | Data Type    | Constraint              | Description                        |
| ---------------- | ------------ | ----------------------- | ---------------------------------- |
| certificate_id   | BIGINT       | PK, AUTO INCREMENT      | Unique identifier                  |
| user_id          | BIGINT       | FK -> users.user_id     | Reference to the student           |
| course_id        | BIGINT       | FK -> courses.course_id | Reference to the completed course  |
| issued_date      | TIMESTAMP    | NOT NULL, DEFAULT NOW() | Date the certificate was issued    |
| certificate_code | VARCHAR(100) | NOT NULL, UNIQUE        | Unique verifiable certificate code |

#### Table 21: quiz_attempts

| Column       | Data Type    | Constraint              | Description                         |
| ------------ | ------------ | ----------------------- | ----------------------------------- |
| attempt_id   | BIGINT       | PK, AUTO INCREMENT      | Unique identifier                   |
| user_id      | BIGINT       | FK -> users.user_id     | Reference to the student            |
| quiz_id      | BIGINT       | FK -> quizzes.quiz_id   | Reference to the quiz               |
| score        | DECIMAL(5,2) | NOT NULL                | Score achieved in this attempt      |
| is_passed    | BOOLEAN      | NOT NULL                | Whether the student passed the quiz |
| attempted_at | TIMESTAMP    | NOT NULL, DEFAULT NOW() | Timestamp of the attempt            |

#### Table 22: quiz_attempt_answers

| Column            | Data Type | Constraint                       | Description                      |
| ----------------- | --------- | -------------------------------- | -------------------------------- |
| attempt_answer_id | BIGINT    | PK, AUTO INCREMENT               | Unique identifier                |
| attempt_id        | BIGINT    | FK -> quiz_attempts.attempt_id   | Reference to the quiz attempt    |
| question_id       | BIGINT    | FK -> quiz_questions.question_id | Reference to the question        |
| answer_id         | BIGINT    | FK -> quiz_answers.answer_id     | Reference to the selected answer |

#### Table 23: reviews

| Column      | Data Type | Constraint              | Description                        |
| ----------- | --------- | ----------------------- | ---------------------------------- |
| review_id   | BIGINT    | PK, AUTO INCREMENT      | Unique identifier                  |
| user_id     | BIGINT    | FK -> users.user_id     | Reference to the reviewing student |
| course_id   | BIGINT    | FK -> courses.course_id | Reference to the reviewed course   |
| rating      | TINYINT   | NOT NULL, CHECK (1-5)   | Numeric rating from 1 to 5         |
| comment     | TEXT      | NULLABLE                | Written review comment             |
| review_date | TIMESTAMP | NOT NULL, DEFAULT NOW() | Timestamp of review submission     |

#### Table 24: payouts

| Column        | Data Type     | Constraint          | Description                         |
| ------------- | ------------- | ------------------- | ----------------------------------- |
| payout_id     | BIGINT        | PK, AUTO INCREMENT  | Unique identifier                   |
| instructor_id | BIGINT        | FK -> users.user_id | Reference to the instructor         |
| amount        | DECIMAL(10,2) | NOT NULL            | Gross revenue before platform cut   |
| platform_cut  | DECIMAL(5,2)  | NOT NULL            | Platform deduction percentage       |
| net_amount    | DECIMAL(10,2) | NOT NULL            | Final amount paid to the instructor |
| status        | ENUM          | NOT NULL            | pending or paid                     |
| payout_date   | TIMESTAMP     | NULLABLE            | Date the payout was processed       |
