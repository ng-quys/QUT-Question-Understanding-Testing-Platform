/** Spring LocalDateTime exam schedules are wall-clock times in Vietnam. */
export function examDate(value: string): Date {
  const plain = /^\d{4}-\d{2}-\d{2}T/.test(value)
    && !/(?:Z|[+-]\d{2}:\d{2})$/i.test(value);
  return new Date(plain ? `${value}+07:00` : value);
}
