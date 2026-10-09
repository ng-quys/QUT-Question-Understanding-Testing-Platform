import { apiFetch } from '../../../services/api';
import type { Bloom3Level, CourseChapter, CourseCLO, CourseTopic } from '../../../types';

type ChapterResponse = { id: number; courseId: number; order: number; code: string; name: string; topics: TopicResponse[] };
type TopicResponse = { id: number; chapterId: number; code: string; name: string; questionCount: number };
type CloResponse = { id: number; courseId: number; code: string; description: string; defaultBloom: Bloom3Level; status: 'active' | 'draft'; notes?: string | null };

const mapTopic = (x: TopicResponse): CourseTopic => ({ id: String(x.id), chapterId: String(x.chapterId), code: x.code, name: x.name, questionCount: x.questionCount });
const mapChapter = (x: ChapterResponse): CourseChapter => ({ id: String(x.id), courseId: String(x.courseId), order: x.order, code: x.code, name: x.name, topics: x.topics.map(mapTopic) });
const mapClo = (x: CloResponse): CourseCLO => ({ id: String(x.id), courseId: String(x.courseId), code: x.code, description: x.description, defaultBloom: x.defaultBloom, status: x.status, notes: x.notes ?? undefined });

export async function getCourseStructure(courseId: string): Promise<CourseChapter[]> {
  const data = await apiFetch<ChapterResponse[]>(`/teacher/courses/${courseId}/structure`);
  return data.map(mapChapter);
}
export async function createChapter(courseId: string, body: { code: string; name: string }): Promise<CourseChapter> {
  return mapChapter(await apiFetch<ChapterResponse>(`/teacher/courses/${courseId}/chapters`, { method: 'POST', body: JSON.stringify(body) }));
}
export async function updateChapter(courseId: string, chapterId: string, body: { code: string; name: string }): Promise<CourseChapter> {
  return mapChapter(await apiFetch<ChapterResponse>(`/teacher/courses/${courseId}/chapters/${chapterId}`, { method: 'PUT', body: JSON.stringify(body) }));
}
export async function deleteChapter(courseId: string, chapterId: string): Promise<void> {
  await apiFetch<void>(`/teacher/courses/${courseId}/chapters/${chapterId}`, { method: 'DELETE' });
}
export async function createTopic(courseId: string, chapterId: string, body: { code: string; name: string }): Promise<CourseTopic> {
  return mapTopic(await apiFetch<TopicResponse>(`/teacher/courses/${courseId}/chapters/${chapterId}/topics`, { method: 'POST', body: JSON.stringify(body) }));
}
export async function updateTopic(courseId: string, chapterId: string, topicId: string, body: { code: string; name: string }): Promise<CourseTopic> {
  return mapTopic(await apiFetch<TopicResponse>(`/teacher/courses/${courseId}/chapters/${chapterId}/topics/${topicId}`, { method: 'PUT', body: JSON.stringify(body) }));
}
export async function deleteTopic(courseId: string, chapterId: string, topicId: string): Promise<void> {
  await apiFetch<void>(`/teacher/courses/${courseId}/chapters/${chapterId}/topics/${topicId}`, { method: 'DELETE' });
}
export async function getCourseClos(courseId: string): Promise<CourseCLO[]> {
  return (await apiFetch<CloResponse[]>(`/teacher/courses/${courseId}/clos`)).map(mapClo);
}
export async function createClo(courseId: string, body: Omit<CourseCLO, 'id' | 'courseId'>): Promise<CourseCLO> {
  return mapClo(await apiFetch<CloResponse>(`/teacher/courses/${courseId}/clos`, { method: 'POST', body: JSON.stringify(body) }));
}
export async function updateClo(courseId: string, cloId: string, body: Omit<CourseCLO, 'id' | 'courseId'>): Promise<CourseCLO> {
  return mapClo(await apiFetch<CloResponse>(`/teacher/courses/${courseId}/clos/${cloId}`, { method: 'PUT', body: JSON.stringify(body) }));
}
export async function deleteClo(courseId: string, cloId: string): Promise<void> {
  await apiFetch<void>(`/teacher/courses/${courseId}/clos/${cloId}`, { method: 'DELETE' });
}
