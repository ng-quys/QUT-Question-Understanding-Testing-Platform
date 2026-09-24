import { SupportedFileExtension, SourceDocument } from '../types';

export const MAX_FILES = 5;
export const ALLOWED_EXTENSIONS: SupportedFileExtension[] = ['pdf', 'docx', 'txt'];
export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'text/plain',
];

export interface FileValidationResult {
  validFiles: File[];
  rejectedFiles: { file: File; reason: string }[];
  errorMessage: string | null;
  exceededLimitMessage: string | null;
}

/**
 * Extract lower-case extension without leading dot
 */
export function getFileExtension(filename: string): string {
  const parts = filename.split('.');
  if (parts.length <= 1) return '';
  return parts[parts.length - 1].toLowerCase();
}

/**
 * Check if the extension is one of ['pdf', 'docx', 'txt']
 */
export function isAllowedExtension(filename: string): filename is `${string}.${SupportedFileExtension}` {
  const ext = getFileExtension(filename);
  return ALLOWED_EXTENSIONS.includes(ext as SupportedFileExtension);
}

/**
 * Format bytes into human readable KB or MB
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  if (bytes < k) return `${bytes} B`;
  const kb = bytes / k;
  if (kb < k) {
    return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`;
  }
  const mb = kb / k;
  return `${mb.toFixed(1)} MB`;
}

/**
 * Validate dropped or picked files against format and quantity limits
 */
export function validateDocumentFiles(
  newFiles: File[],
  currentCount: number
): FileValidationResult {
  const validFiles: File[] = [];
  const rejectedFiles: { file: File; reason: string }[] = [];
  let formatError = false;
  let quantityError = false;

  for (const file of newFiles) {
    if (!isAllowedExtension(file.name)) {
      formatError = true;
      rejectedFiles.push({
        file,
        reason: 'Định dạng file không được hỗ trợ. Chỉ chấp nhận PDF, DOCX và TXT.',
      });
      continue;
    }

    // Check if adding this file would exceed the limit of 5
    if (currentCount + validFiles.length >= MAX_FILES) {
      quantityError = true;
      rejectedFiles.push({
        file,
        reason: 'Chỉ được chọn tối đa 5 tài liệu.',
      });
      continue;
    }

    validFiles.push(file);
  }

  let errorMessage: string | null = null;
  if (formatError) {
    errorMessage = 'Định dạng file không được hỗ trợ. Chỉ chấp nhận PDF, DOCX và TXT.';
  }

  let exceededLimitMessage: string | null = null;
  if (quantityError || currentCount + newFiles.length > MAX_FILES) {
    exceededLimitMessage = 'Chỉ được chọn tối đa 5 tài liệu.';
  }

  return {
    validFiles,
    rejectedFiles,
    errorMessage,
    exceededLimitMessage,
  };
}

/**
 * Convert a validated browser File to a SourceDocument item
 */
export function createSourceDocument(file: File): SourceDocument {
  const ext = getFileExtension(file.name) as SupportedFileExtension;
  return {
    id: `doc-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
    file,
    name: file.name,
    size: file.size,
    sizeFormatted: formatFileSize(file.size),
    extension: ext,
    status: 'ready',
    uploadedAt: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
  };
}
