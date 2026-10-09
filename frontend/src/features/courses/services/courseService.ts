import { apiFetch } from '../../../services/api';
import type { Course } from '../../../types';

interface TeacherCourseResponse {
  id: number;
  code: string;
  name: string;
  credits: number;
  department: string | null;
  chaptersCount: number;
  cloCount: number;
  questionCount: number;
  status: 'active' | 'draft' | 'inactive';
}

export interface CreateCourseRequest {
  code: string;
  name: string;
  credits: number;
  department: string;
}

function mapCourse(data: TeacherCourseResponse): Course {
  return {
    id: String(data.id),
    code: data.code,
    name: data.name,
    credits: data.credits,
    department: data.department ?? '',
    chaptersCount: data.chaptersCount,
    cloCount: data.cloCount,
    questionCount: data.questionCount,

    // FE hiện tại chỉ support active | draft.
    status: data.status === 'draft' ? 'draft' : 'active',

    updatedAt: 'Hôm nay',
  };
}

export async function getTeacherCourses(): Promise<Course[]> {
  const data = await apiFetch<TeacherCourseResponse[]>(
    '/teacher/courses',
    {
      method: 'GET',
    }
  );

  return data.map(mapCourse);
}

export async function createTeacherCourse(
  request: CreateCourseRequest
): Promise<Course> {
  const data = await apiFetch<TeacherCourseResponse>(
    '/teacher/courses',
    {
      method: 'POST',
      body: JSON.stringify(request),
    }
  );

  return mapCourse(data);
}