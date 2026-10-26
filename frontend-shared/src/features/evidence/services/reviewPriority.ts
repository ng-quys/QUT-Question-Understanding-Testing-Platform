/** Review priority, never a probability of cheating or a deduction from the exam grade. */
export function reviewPriority(score: number): string {
  if (score <= 0) return 'Thông tin giám sát';
  return `Cần xem xét: ${score >= 50 ? 'Cao' : score >= 25 ? 'Trung bình' : 'Thấp'}`;
}
