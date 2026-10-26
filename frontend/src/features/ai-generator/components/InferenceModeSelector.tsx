import type { InferenceBatchSize } from '@shared/types';

interface Props {
  value: InferenceBatchSize;
  onChange: (value: InferenceBatchSize) => void;
}

const options: Array<{ value: InferenceBatchSize; title: string; description: string }> = [
  { value: 1, title: 'Phương án A — Sinh 1 câu/lượt', description: 'Chế độ mặc định, mỗi lần gọi AI yêu cầu một câu.' },
  { value: 3, title: 'Phương án B — Sinh 3 câu/lượt', description: 'Chế độ thực nghiệm, mỗi lần gọi AI yêu cầu tối đa ba câu.' },
];

/** Isolated experiment control: remove this component and its single state prop after the benchmark. */
export function InferenceModeSelector({ value, onChange }: Props) {
  return <fieldset className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-4">
    <legend className="px-1 text-sm font-semibold text-slate-900">
      Chế độ sinh câu hỏi AI
      <span className="ml-2 rounded-full border border-indigo-200 bg-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-indigo-700">Thử nghiệm</span>
    </legend>
    <div className="mt-2 grid gap-2 sm:grid-cols-2">
      {options.map(option => <label key={option.value} className={`flex cursor-pointer gap-3 rounded-lg border bg-white p-3 transition-colors ${value === option.value ? 'border-indigo-500 ring-1 ring-indigo-200' : 'border-slate-200 hover:border-slate-300'}`}>
        <input type="radio" name="inference-batch-size" value={option.value} checked={value === option.value}
          onChange={() => onChange(option.value)} className="mt-0.5 accent-indigo-700" />
        <span><span className="block text-sm font-semibold text-slate-800">{option.title}</span><span className="mt-1 block text-xs text-slate-500">{option.description}</span></span>
      </label>)}
    </div>
  </fieldset>;
}
