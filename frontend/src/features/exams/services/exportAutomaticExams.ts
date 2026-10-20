import { Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx';
interface ExportableExams {variants:{code:string;questions:{content:string;answers:{label:string;content:string;correct:boolean}[]}[]}[]}

export async function exportAutomaticExams(title: string, preview: ExportableExams) {
  const children: Paragraph[] = [];
  preview.variants.forEach((variant, index) => {
    children.push(new Paragraph({ text: title, heading: HeadingLevel.HEADING_1, pageBreakBefore: index > 0 }));
    children.push(new Paragraph({ text: `Mã đề: ${variant.code} · ${variant.questions.length} câu`, spacing: { after: 240 } }));
    variant.questions.forEach((question, position) => {
      children.push(new Paragraph({ children: [new TextRun({ text: `Câu ${position + 1}. `, bold: true }), new TextRun(question.content)], spacing: { before: 180, after: 100 } }));
      question.answers.forEach(answer => children.push(new Paragraph({ text: `${answer.label}. ${answer.content}`, spacing: { after: 80 } })));
    });
  });
  children.push(new Paragraph({ text: 'ĐÁP ÁN — DÀNH CHO GIẢNG VIÊN', heading: HeadingLevel.HEADING_1, pageBreakBefore: true }));
  preview.variants.forEach(variant => {
    children.push(new Paragraph({ text: variant.code, heading: HeadingLevel.HEADING_2 }));
    children.push(new Paragraph({ text: variant.questions.map((q, i) => `${i + 1}. ${q.answers.find(a => a.correct)?.label ?? ''}`).join('     ') }));
  });
  const blob = await Packer.toBlob(new Document({ sections: [{ children }] }));
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = url; link.download = `${preview.variants[0].code}_bo_de.docx`;
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
