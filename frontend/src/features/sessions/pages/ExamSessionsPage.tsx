import type { Course } from '../../../types';
import { AssignedSittings } from '../components/AssignedSittings';

interface Props { courses: Course[]; onShowToast: (message: string) => void; onCreateExam: () => void }
export const ExamSessionsPage = ({ onShowToast, onCreateExam }: Props) => <>
  <AssignedSittings onShowToast={onShowToast} onCreateExam={onCreateExam} />
</>;
