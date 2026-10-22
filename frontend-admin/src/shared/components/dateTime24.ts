export type DateTimeParts = { date: string; hour: string; minute: string };

export function splitDateTime24(value: string): DateTimeParts {
  const match = /^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):([0-5]\d)/.exec(value);
  return match ? { date: match[1], hour: match[2], minute: match[3] } : { date: '', hour: '', minute: '00' };
}

export function joinDateTime24(parts: DateTimeParts): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(parts.date) && /^([01]\d|2[0-3])$/.test(parts.hour) && /^[0-5]\d$/.test(parts.minute)
    ? `${parts.date}T${parts.hour}:${parts.minute}` : '';
}

export function isBeforeDateTimeMinimum(value: string, min?: string): boolean {
  return Boolean(value && min && value < min.slice(0, 16));
}
