// Synthetic API responses are provided by the Playwright test; no real database writes.
import { createRoot } from 'react-dom/client';
import { QuickExamPage } from '../src/features/exams/pages/QuickExamPage';
import '../src/index.css';
import '../src/layouts/lecturer/lecturer.css';
createRoot(document.getElementById('root')!).render(<main className="lecturer-main" style={{ margin: '0 auto', padding: 24 }}>
  <QuickExamPage courses={[]} clos={[]} onShowToast={() => {}} onCreated={() => {}}/>
</main>);
