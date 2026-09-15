import React, { useState } from 'react';
import { X, Settings, Sliders, Database, AlertCircle, CheckCircle2 } from 'lucide-react';
import { MatrixCustomConfig } from './types';

interface MatrixCustomizationModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: MatrixCustomConfig;
  onSaveConfig: (newConfig: MatrixCustomConfig) => void;
}

export const MatrixCustomizationModal: React.FC<MatrixCustomizationModalProps> = ({
  isOpen,
  onClose,
  config,
  onSaveConfig,
}) => {
  const [enableDistributionControl, setEnableDistributionControl] = useState<boolean>(
    config.enableDistributionControl ?? true
  );
  const [showAvailability, setShowAvailability] = useState<boolean>(config.showAvailability);
  const [pointsPerQuestion, setPointsPerQuestion] = useState<number>(config.pointsPerQuestion);
  const [nbPct, setNbPct] = useState<number>(config.bloomGuidance.nb);
  const [thPct, setThPct] = useState<number>(config.bloomGuidance.th);
  const [vdPct, setVdPct] = useState<number>(config.bloomGuidance.vd);

  if (!isOpen) return null;

  const totalPct = nbPct + thPct + vdPct;
  const is100Percent = totalPct === 100;

  const handleSave = () => {
    onSaveConfig({
      targetTotal: config.targetTotal,
      showAvailability,
      pointsPerQuestion,
      enableDistributionControl,
      bloomGuidance: {
        nb: nbPct,
        th: thPct,
        vd: vdPct,
      },
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-150">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Settings className="w-4 h-4 text-slate-500" />
            <h3 className="text-sm font-bold text-slate-900">Tùy chỉnh cấu hình ma trận</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Switch Toggle: Bật/Tắt tính năng kiểm soát Tỉ lệ phân bổ định hướng */}
          <div
            className={`p-3.5 rounded-xl border transition-all ${
              enableDistributionControl
                ? 'bg-indigo-50/50 border-indigo-200'
                : 'bg-slate-50 border-slate-200'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sliders
                  className={`w-4 h-4 ${
                    enableDistributionControl ? 'text-[var(--primary)]' : 'text-slate-500'
                  }`}
                />
                <span className="text-xs font-bold text-slate-900">
                  Kiểm soát Tỉ lệ phân bổ định hướng
                </span>
              </div>
              <button
                type="button"
                onClick={() => setEnableDistributionControl(!enableDistributionControl)}
                className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${
                  enableDistributionControl ? 'bg-[var(--primary)]' : 'bg-slate-300'
                }`}
                title={
                  enableDistributionControl
                    ? 'Bật tính năng kiểm soát tỉ lệ phân bổ'
                    : 'Tắt tính năng kiểm soát tỉ lệ phân bổ'
                }
              >
                <div
                  className={`w-4 h-4 rounded-full bg-white transition-transform absolute top-1 shadow-xs ${
                    enableDistributionControl ? 'left-6' : 'left-1'
                  }`}
                />
              </button>
            </div>
            <p className="text-[11px] text-slate-600 mt-2 leading-relaxed">
              {enableDistributionControl
                ? 'Đang BẬT: Bảng ma trận bên ngoài sẽ giám sát tỉ lệ (yêu cầu tổng chính xác 100% hoặc 10 điểm) và hiển thị cảnh báo đỏ khi có sai lệch.'
                : 'Đang TẮT: Bảng ma trận không bắt buộc tổng tỉ lệ đạt 100%, cho phép tùy chỉnh tự do.'}
            </p>
          </div>

          {/* Bloom distribution guidance */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <span>Tỷ lệ phân bổ định hướng Bloom (%)</span>
              </label>
              <span className="text-[11px] text-slate-400">
                Thang điểm 10 tương ứng
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center">
              {/* NB */}
              <div className="p-2 rounded-xl bg-emerald-50 border border-emerald-200/80">
                <span className="text-[11px] font-bold text-emerald-800 block">Nhận biết</span>
                <div className="flex items-center justify-center gap-1 mt-1">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={nbPct}
                    onChange={(e) => setNbPct(parseInt(e.target.value, 10) || 0)}
                    className="w-14 text-center font-black text-xs bg-white rounded border border-emerald-300 py-1 focus:outline-none focus:border-emerald-500"
                  />
                  <span className="text-[10px] text-emerald-700 font-bold">%</span>
                </div>
                <span className="text-[10px] text-emerald-600 font-medium block mt-1">
                  {(nbPct / 10).toFixed(1)} điểm
                </span>
              </div>

              {/* TH */}
              <div className="p-2 rounded-xl bg-blue-50 border border-blue-200/80">
                <span className="text-[11px] font-bold text-blue-800 block">Thông hiểu</span>
                <div className="flex items-center justify-center gap-1 mt-1">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={thPct}
                    onChange={(e) => setThPct(parseInt(e.target.value, 10) || 0)}
                    className="w-14 text-center font-black text-xs bg-white rounded border border-blue-300 py-1 focus:outline-none focus:border-blue-500"
                  />
                  <span className="text-[10px] text-blue-700 font-bold">%</span>
                </div>
                <span className="text-[10px] text-blue-600 font-medium block mt-1">
                  {(thPct / 10).toFixed(1)} điểm
                </span>
              </div>

              {/* VD */}
              <div className="p-2 rounded-xl bg-indigo-50 border border-indigo-200/80">
                <span className="text-[11px] font-bold text-indigo-800 block">Vận dụng</span>
                <div className="flex items-center justify-center gap-1 mt-1">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={vdPct}
                    onChange={(e) => setVdPct(parseInt(e.target.value, 10) || 0)}
                    className="w-14 text-center font-black text-xs bg-white rounded border border-indigo-300 py-1 focus:outline-none focus:border-indigo-500"
                  />
                  <span className="text-[10px] text-indigo-700 font-bold">%</span>
                </div>
                <span className="text-[10px] text-indigo-600 font-medium block mt-1">
                  {(vdPct / 10).toFixed(1)} điểm
                </span>
              </div>
            </div>

            {/* Total Indicator */}
            <div
              className={`p-2.5 rounded-lg border text-xs flex items-center justify-between ${
                is100Percent
                  ? 'bg-emerald-50/80 border-emerald-300 text-emerald-800'
                  : enableDistributionControl
                  ? 'bg-red-50 border-red-300 text-red-700'
                  : 'bg-amber-50 border-amber-200 text-amber-800'
              }`}
            >
              <div className="flex items-center gap-1.5 font-medium">
                {is100Percent ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>Tổng tỉ lệ chuẩn: 100% (10.0 / 10 điểm)</span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                    <span>
                      Tổng tỉ lệ: <strong>{totalPct}%</strong> ({(totalPct / 10).toFixed(1)}/10 điểm)
                      {enableDistributionControl && ' — Cần đạt đúng 100%'}
                    </span>
                  </>
                )}
              </div>

              {!is100Percent && (
                <button
                  type="button"
                  onClick={() => {
                    setNbPct(40);
                    setThPct(30);
                    setVdPct(30);
                  }}
                  className="px-2 py-0.5 rounded text-[10px] font-bold bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 cursor-pointer"
                  title="Đặt nhanh về tỉ lệ chuẩn 40% - 30% - 30%"
                >
                  Đặt 40-30-30
                </button>
              )}
            </div>
          </div>

          {/* Toggle question availability */}
          <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
            <div>
              <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <Database className="w-3.5 h-3.5 text-slate-500" />
                Kiểm tra khả dụng Ngân hàng câu hỏi
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Hiển thị số câu sẵn sàng (Cần X / Có Y câu) trên mỗi hàng
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowAvailability(!showAvailability)}
              className={`w-10 h-6 rounded-full transition-colors relative cursor-pointer ${
                showAvailability ? 'bg-[var(--primary)]' : 'bg-slate-200'
              }`}
            >
              <div
                className={`w-4 h-4 rounded-full bg-white transition-transform absolute top-1 ${
                  showAvailability ? 'left-5' : 'left-1'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200/60 rounded-xl cursor-pointer"
          >
            Đóng
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-4 py-2 text-xs font-bold text-white rounded-xl shadow-2xs hover:opacity-90 cursor-pointer"
            style={{ backgroundColor: 'var(--primary)' }}
          >
            Lưu tùy chỉnh
          </button>
        </div>
      </div>
    </div>
  );
};
