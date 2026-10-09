# Zero Assessment Platform

Zero Assessment Platform is an **AI-powered online examination and assessment platform** for creating exams, delivering secure online tests, and generating automated grading insights.

## Core capabilities

- Role-based access for **admins, instructors, and students**
- Exam authoring with question bank support
- Timed online exam sessions with autosave and final submission
- Automatic scoring for objective questions
- AI-assisted feedback and performance summaries
- Result dashboards for learners and instructors

## Minimal product requirements

### Functional

1. Authentication and role management
2. Exam and question management
3. Candidate exam-taking workflow
4. Submission and grading pipeline
5. AI-assisted feedback generation
6. Results and reporting

### Non-functional

- Secure session handling and protected APIs
- Reliable autosave and submission integrity
- Audit-friendly assessment history
- Scalable architecture for concurrent test takers

## Suggested architecture (MVP)

- **Frontend:** Web app for exam management and test-taking
- **Backend API:** Auth, exams, attempts, grading, reporting
- **Database:** Users, exams, questions, attempts, answers, grades
- **AI service layer:** Prompted feedback and rubric-based analysis

## Roadmap

- [ ] Initialize frontend and backend services
- [ ] Implement authentication and RBAC
- [ ] Build exam authoring and delivery flows
- [ ] Add grading and AI feedback service
- [ ] Add instructor and student dashboards
- [ ] Add CI checks and automated tests
