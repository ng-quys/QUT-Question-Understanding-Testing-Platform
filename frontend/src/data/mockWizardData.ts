import type{ CLOItem, UploadedDocFile } from '../types';

export interface SubjectOption {
  id: string;
  code: string;
  name: string;
  credits: number;
  department: string;
}

export interface SemesterOption {
  id: string;
  name: string;
  academicYear: string;
  classes: string[];
}

export const SUBJECT_OPTIONS: SubjectOption[] = [
  {
    id: 'SUBJ-01',
    code: 'INT3306',
    name: 'Lập trình Web nâng cao',
    credits: 3,
    department: 'Khoa Công nghệ Phần mềm',
  },
  {
    id: 'SUBJ-02',
    code: 'INT2204',
    name: 'Cơ sở dữ liệu & Quản trị CSDL',
    credits: 4,
    department: 'Khoa Hệ thống Thông tin',
  },
  {
    id: 'SUBJ-03',
    code: 'INT3401',
    name: 'Trí tuệ nhân tạo ứng dụng',
    credits: 3,
    department: 'Khoa Khoa học Máy tính',
  },
  {
    id: 'SUBJ-04',
    code: 'INT2208',
    name: 'Lập trình Hướng đối tượng (Java)',
    credits: 3,
    department: 'Khoa Công nghệ Phần mềm',
  },
  {
    id: 'SUBJ-05',
    code: 'INT2202',
    name: 'Cấu trúc Dữ liệu & Giải thuật',
    credits: 4,
    department: 'Khoa Khoa học Máy tính',
  },
];

export const SEMESTER_OPTIONS: SemesterOption[] = [
  {
    id: 'SEM-2026-1',
    name: 'Học kỳ 1 (2026-2027)',
    academicYear: '2026-2027',
    classes: ['D21CQCN01-B', 'D21CQCN02-B', 'D21CQAT01-B', 'CLC-K21CN'],
  },
  {
    id: 'SEM-2026-2',
    name: 'Học kỳ 2 (2026-2027)',
    academicYear: '2026-2027',
    classes: ['D22CQCN01-B', 'D22CQCN02-B', 'D22CQAT01-B'],
  },
  {
    id: 'SEM-2025-2',
    name: 'Học kỳ Hè (2025-2026)',
    academicYear: '2025-2026',
    classes: ['HE2026-L01', 'HE2026-L02'],
  },
];

export const INITIAL_DOCUMENTS: UploadedDocFile[] = [
  {
    id: 'DOC-01',
    name: 'Giao_trinh_Lap_trinh_Web_Nang_Cao_v3.pdf',
    size: '14.8 MB',
    type: 'pdf',
    uploadDate: '18/08/2026',
    status: 'ready',
  },
  {
    id: 'DOC-02',
    name: 'Slide_BaiGiang_Chuong_1_den_6_React_Node.pptx',
    size: '8.4 MB',
    type: 'pptx',
    uploadDate: '19/08/2026',
    status: 'ready',
  },
  {
    id: 'DOC-03',
    name: 'De_cuong_Chi_tiet_Chuan_Dau_Ra_INT3306.docx',
    size: '1.2 MB',
    type: 'docx',
    uploadDate: '20/08/2026',
    status: 'ready',
  },
];

export const INITIAL_CLOS: CLOItem[] = [
  {
    id: 'CLO-1',
    code: 'CLO 1.1',
    description: 'Trình bày và phân tích được kiến trúc Client-Server, Virtual DOM, Component Lifecycle và cơ chế Rendering trong React.',
    bloomLevel: 'remember',
    weightPercent: 20,
  },
  {
    id: 'CLO-2',
    code: 'CLO 1.2',
    description: 'Hiểu rõ các phương thức HTTP, cấu trúc RESTful API, cơ chế Middleware và bất đồng bộ (Async/Await) trong Node.js/Express.',
    bloomLevel: 'understand',
    weightPercent: 25,
  },
  {
    id: 'CLO-3',
    code: 'CLO 2.1',
    description: 'Vận dụng React Hooks (useState, useEffect, useMemo), Context API và State Management để xây dựng giao diện tương tác động.',
    bloomLevel: 'apply',
    weightPercent: 30,
  },
  {
    id: 'CLO-4',
    code: 'CLO 3.1',
    description: 'Phân tích và triển khai các giải pháp bảo mật Web: Xác thực JWT, phân quyền RBAC, phòng chống tấn công XSS, CSRF và tối ưu hiệu năng.',
    bloomLevel: 'analyze',
    weightPercent: 25,
  },
];

export const AI_EXTRACTED_SAMPLE_CLOS: CLOItem[] = [
  {
    id: 'CLO-AI-1',
    code: 'CLO 1.1',
    description: 'Giải thích nguyên lý hoạt động của Single Page Application (SPA), Hydration và Server-Side Rendering (SSR).',
    bloomLevel: 'understand',
    weightPercent: 15,
  },
  {
    id: 'CLO-AI-2',
    code: 'CLO 2.1',
    description: 'Xây dựng hoàn chỉnh luồng nghiệp vụ CRUD kết hợp ORM/ODM (Prisma, Mongoose) và cơ chế Transaction trong cơ sở dữ liệu.',
    bloomLevel: 'apply',
    weightPercent: 35,
  },
  {
    id: 'CLO-AI-3',
    code: 'CLO 2.2',
    description: 'Thiết lập pipeline kiểm thử Unit Test và Integration Test cho API endpoint bằng Jest/Supertest.',
    bloomLevel: 'apply',
    weightPercent: 25,
  },
  {
    id: 'CLO-AI-4',
    code: 'CLO 3.1',
    description: 'Đánh giá kiến trúc Microservices vs Monolithic trong phát triển ứng dụng Web quy mô lớn.',
    bloomLevel: 'analyze',
    weightPercent: 25,
  },
];
