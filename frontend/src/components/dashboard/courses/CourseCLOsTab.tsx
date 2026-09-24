import React, { useState } from 'react';
import {
  Layers,
  Plus,
  Edit2,
  Trash2,
  Check,
  X,
  Sparkles,
  HelpCircle,
} from 'lucide-react';
import type{ CourseCLO, Bloom3Level } from '../../../types';
import { BLOOM_3_CONFIG } from '../../../data/mockAcademicData';

interface CourseCLOsTabProps {
  courseId: string;
  clos: CourseCLO[];
  onUpdateCLOs: (newCLOs: CourseCLO[]) => void;
  onShowToast: (msg: string) => void;
}

export const CourseCLOsTab: React.FC<CourseCLOsTabProps> = ({
  courseId,
  clos,
  onUpdateCLOs,
  onShowToast,
}) => {
  const [isAddingCLO, setIsAddingCLO] = useState<boolean>(false);
  const [newCode, setNewCode] = useState<string>(`CLO ${clos.length + 1}.1`);
  const [newDesc, setNewDesc] = useState<string>('');
  const [newBloom, setNewBloom] = useState<Bloom3Level>('remember');
  const [newStatus, setNewStatus] = useState<'active' | 'draft'>('active');

  const [editingCLOId, setEditingCLOId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<CourseCLO>>({});

  const handleStartAdd = () => {
    setNewCode(`CLO ${clos.length + 1}.1`);
    setNewDesc('');
    setNewBloom('remember');
    setNewStatus('active');
    setIsAddingCLO(true);
  };

  const handleSaveAdd = () => {
    if (!newDesc.trim()) {
      onShowToast('Vui lòng nhập mô tả chuẩn đầu ra CLO');
      return;
    }
    const newCLO: CourseCLO = {
      id: `clo-${courseId}-${Date.now()}`,
      courseId,
      code: newCode.trim() || `CLO ${clos.length + 1}.1`,
      description: newDesc.trim(),
      defaultBloom: newBloom,
      status: newStatus,
    };
    onUpdateCLOs([...clos, newCLO]);
    setIsAddingCLO(false);
    onShowToast(`Đã thêm chuẩn đầu ra: ${newCLO.code}`);
  };

  const handleDeleteCLO = (cloId: string) => {
    const clo = clos.find((c) => c.id === cloId);
    if (!clo) return;
    const confirmDel = window.confirm(`Bạn có chắc muốn xóa chuẩn đầu ra ${clo.code}?`);
    if (!confirmDel) return;
    onUpdateCLOs(clos.filter((c) => c.id !== cloId));
    onShowToast(`Đã xóa ${clo.code}`);
  };

  const handleStartEdit = (clo: CourseCLO) => {
    setEditingCLOId(clo.id);
    setEditForm({ ...clo });
  };

  const handleSaveEdit = (cloId: string) => {
    if (!editForm.description?.trim()) {
      onShowToast('Mô tả CLO không được để trống');
      return;
    }
    const updated = clos.map((c) => (c.id === cloId ? ({ ...c, ...editForm } as CourseCLO) : c));
    onUpdateCLOs(updated);
    setEditingCLOId(null);
    setEditForm({});
    onShowToast('Đã lưu chỉnh sửa chuẩn đầu ra');
  };

  return (
    <div className="space-y-4">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200/80">
        <div>
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <Layers className="w-4 h-4" style={{ color: 'var(--primary)' }} />
            <span>Danh sách Chuẩn đầu ra Học phần (Course Learning Outcomes - CLO)</span>
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Tổng cộng: <strong className="text-slate-800">{clos.length}</strong> chuẩn CLO làm cơ sở phân loại câu hỏi và ma trận đề thi
          </p>
        </div>

        <button
          type="button"
          onClick={handleStartAdd}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white shadow-xs transition-colors cursor-pointer self-start sm:self-auto"
          style={{ backgroundColor: 'var(--primary)' }}
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Thêm CLO mới</span>
        </button>
      </div>

      {/* Add CLO Form Box */}
      {isAddingCLO && (
        <div className="p-4 rounded-xl border border-slate-300 bg-white shadow-xs space-y-3 animate-in fade-in duration-150">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
            <Plus className="w-3.5 h-3.5" style={{ color: 'var(--primary)' }} />
            <span>Thêm Chuẩn đầu ra (CLO) mới</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
            <div className="md:col-span-3">
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">Mã CLO</label>
              <input
                type="text"
                value={newCode}
                onChange={(e) => setNewCode(e.target.value)}
                placeholder="CLO 1.1"
                className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 font-mono"
              />
            </div>

            <div className="md:col-span-5">
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">Mức Bloom gợi ý</label>
              <div className="grid grid-cols-3 gap-1.5">
                {(['remember', 'understand', 'apply'] as Bloom3Level[]).map((lvl) => {
                  const cfg = BLOOM_3_CONFIG[lvl];
                  const isSelected = newBloom === lvl;
                  return (
                    <button
                      key={lvl}
                      type="button"
                      onClick={() => setNewBloom(lvl)}
                      className={`px-2 py-1.5 text-[11px] font-bold rounded-lg border transition-all cursor-pointer text-center ${
                        isSelected
                          ? `${cfg.bgClass} ${cfg.textClass} ${cfg.borderClass} ring-1 ring-offset-0`
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {cfg.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="md:col-span-4">
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">Trạng thái</label>
              <select
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value as 'active' | 'draft')}
                className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 bg-white"
              >
                <option value="active">Đang áp dụng (Active)</option>
                <option value="draft">Bản nháp (Draft)</option>
              </select>
            </div>

            <div className="md:col-span-12">
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">Mô tả chuẩn đầu ra</label>
              <textarea
                rows={2}
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="Ví dụ: Trình bày được nguyên lý và các giải thuật cơ bản..."
                className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setIsAddingCLO(false)}
              className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={handleSaveAdd}
              className="px-4 py-1.5 rounded-lg text-xs font-bold text-white shadow-xs cursor-pointer"
              style={{ backgroundColor: 'var(--primary)' }}
            >
              Lưu chuẩn CLO
            </button>
          </div>
        </div>
      )}

      {/* CLO Table */}
      <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-xs">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500">
              <th className="py-2.5 px-3.5 w-24">Mã CLO</th>
              <th className="py-2.5 px-3.5 min-w-[280px]">Mô tả chuẩn đầu ra</th>
              <th className="py-2.5 px-3.5 w-36">Mức độ Bloom</th>
              <th className="py-2.5 px-3.5 w-32">Trạng thái</th>
              <th className="py-2.5 px-3.5 w-24 text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {clos.map((clo) => {
              const isEditing = editingCLOId === clo.id;
              const bloomCfg = BLOOM_3_CONFIG[clo.defaultBloom || 'remember'];

              if (isEditing) {
                return (
                  <tr key={clo.id} className="bg-indigo-50/20">
                    <td className="py-2 px-3">
                      <input
                        type="text"
                        value={editForm.code || ''}
                        onChange={(e) => setEditForm({ ...editForm, code: e.target.value })}
                        className="w-full px-2 py-1 text-xs border border-indigo-300 rounded font-mono"
                      />
                    </td>
                    <td className="py-2 px-3">
                      <textarea
                        rows={2}
                        value={editForm.description || ''}
                        onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                        className="w-full px-2 py-1 text-xs border border-indigo-300 rounded"
                      />
                    </td>
                    <td className="py-2 px-3">
                      <select
                        value={editForm.defaultBloom || 'remember'}
                        onChange={(e) =>
                          setEditForm({ ...editForm, defaultBloom: e.target.value as Bloom3Level })
                        }
                        className="w-full px-2 py-1 text-xs border border-indigo-300 rounded bg-white"
                      >
                        <option value="remember">Nhận biết</option>
                        <option value="understand">Thông hiểu</option>
                        <option value="apply">Vận dụng</option>
                      </select>
                    </td>
                    <td className="py-2 px-3">
                      <select
                        value={editForm.status || 'active'}
                        onChange={(e) =>
                          setEditForm({ ...editForm, status: e.target.value as 'active' | 'draft' })
                        }
                        className="w-full px-2 py-1 text-xs border border-indigo-300 rounded bg-white"
                      >
                        <option value="active">Đang áp dụng</option>
                        <option value="draft">Bản nháp</option>
                      </select>
                    </td>
                    <td className="py-2 px-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => handleSaveEdit(clo.id)}
                          className="p-1 rounded bg-emerald-600 text-white hover:bg-emerald-700 cursor-pointer"
                          title="Lưu"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingCLOId(null)}
                          className="p-1 rounded bg-slate-200 text-slate-700 hover:bg-slate-300 cursor-pointer"
                          title="Hủy"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              }

              return (
                <tr key={clo.id} className="hover:bg-slate-50/70 transition-colors group">
                  <td className="py-3 px-3.5 font-bold font-mono text-slate-800">
                    <span
                      className="px-2 py-0.5 rounded text-[11px] font-semibold border"
                      style={{
                        backgroundColor: 'var(--primary-light)',
                        color: 'var(--primary)',
                        borderColor: 'var(--primary-border)',
                      }}
                    >
                      {clo.code}
                    </span>
                  </td>

                  <td className="py-3 px-3.5 text-slate-700 leading-relaxed font-normal">
                    {clo.description}
                  </td>

                  <td className="py-3 px-3.5 whitespace-nowrap">
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${bloomCfg.bgClass} ${bloomCfg.textClass} ${bloomCfg.borderClass}`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${bloomCfg.dotClass}`} />
                      <span>{bloomCfg.label}</span>
                    </span>
                  </td>

                  <td className="py-3 px-3.5 whitespace-nowrap">
                    {clo.status === 'active' ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        Đang áp dụng
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">
                        Bản nháp
                      </span>
                    )}
                  </td>

                  <td className="py-3 px-3.5 text-right">
                    <div className="flex items-center justify-end gap-1 opacity-70 group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={() => handleStartEdit(clo)}
                        className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                        title="Chỉnh sửa CLO"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteCLO(clo.id)}
                        className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                        title="Xóa CLO"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
