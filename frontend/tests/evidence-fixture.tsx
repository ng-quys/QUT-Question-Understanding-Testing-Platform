// Isolated manual browser tests. Product pages use the real authenticated API.
import { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { EvidenceTimeline } from '../src/features/evidence/components/EvidenceTimeline';
import type { evidenceApi, EvidenceEvent } from '../src/features/evidence/services/evidenceApi';

const events: EvidenceEvent[] = ['uploaded', 'pending', 'failed', 'none', 'local'].map((status, index) => ({ id: index + 1, event: 'NO_FACE', active: true, occurredAt: '2026-10-16T10:00:00', module: 'M10', duration: 2.5, riskScore: 20, riskLevel: 'LOW', provider: status === 'local' ? 'local' : 'supabase', evidenceStatus: status, hasEvidence: status !== 'none' }));
function Fixture() {
  const [mode, setMode] = useState('success'), [calls, setCalls] = useState(0);
  const api = useMemo<typeof evidenceApi>(() => ({
    events: async () => ({ items: events, total: events.length, size: 20, page: 0 }),
    link: async (_audience, _attempt, event) => {
      setCalls(value => value + 1);
      if (event === 2) throw new Error('Ảnh đang chờ tải lên. Vui lòng thử lại sau.');
      if (event === 3) throw new Error('Ảnh tải lên thất bại; bản local được giữ để gửi lại.');
      if (event === 5) return { provider: 'local', url: null, expiresAt: null };
      return { provider: 'supabase', url: mode === 'broken' ? '/tests/missing-evidence.jpg' : '/tests/evidence.svg', expiresAt: new Date(Date.now() + (mode === 'broken' ? -1000 : mode === 'expiry' ? 1500 : 180000)).toISOString() };
    },
    local: async () => new Blob(['<svg xmlns="http://www.w3.org/2000/svg" width="400" height="240"><rect width="400" height="240" fill="#e8eef8"/><text x="30" y="120">Synthetic local evidence</text></svg>'], { type: 'image/svg+xml' }),
    history: async () => ({ items: [], total: 0 }),
  }), [mode]);
  return <main style={{ maxWidth: 950, margin: '24px auto', padding: 16 }}><h1>Kiểm thử ảnh bằng chứng (dữ liệu giả)</h1><label>Tình huống <select aria-label="Tình huống kiểm thử" value={mode} onChange={event => { setMode(event.target.value); setCalls(0); }}><option value="success">Ảnh hợp lệ</option><option value="expiry">Link hết hạn nhanh</option><option value="broken">Ảnh lỗi và link hết hạn</option></select></label><p role="status">Số lần cấp link: {calls}</p><EvidenceTimeline key={mode} attemptId={125} audience="teacher" api={api} /></main>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
