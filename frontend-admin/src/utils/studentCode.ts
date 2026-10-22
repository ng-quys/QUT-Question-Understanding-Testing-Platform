export const STUDENT_CODE_PATTERN = '[0-9]{10}';
// Keep codes as strings: leading zeroes are part of the identifier.
export const isStudentCode = (value?: string): boolean => /^[0-9]{10}$/.test(value ?? '');
