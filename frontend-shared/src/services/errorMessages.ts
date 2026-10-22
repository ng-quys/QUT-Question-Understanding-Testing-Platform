const defaultMessage = 'Không thể xử lý yêu cầu lúc này. Vui lòng thử lại sau.';
const httpMessages: Record<number, string> = {
  400: 'Thông tin gửi lên chưa hợp lệ. Vui lòng kiểm tra lại.',
  401: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
  403: 'Bạn không có quyền thực hiện thao tác này.',
  404: 'Không tìm thấy dữ liệu được yêu cầu.',
  405: 'Thao tác này hiện không được hỗ trợ.',
  408: 'Yêu cầu đã hết thời gian chờ. Vui lòng thử lại.',
  409: 'Dữ liệu đã thay đổi hoặc thao tác chưa phù hợp. Vui lòng tải lại và thử lại.',
  413: 'Tệp tải lên quá lớn. Vui lòng chọn tệp nhỏ hơn.',
  415: 'Định dạng tệp hoặc dữ liệu chưa được hỗ trợ.',
  422: 'Thông tin gửi lên chưa hợp lệ. Vui lòng kiểm tra lại.',
  429: 'Bạn gửi yêu cầu quá nhanh. Vui lòng chờ một chút rồi thử lại.',
  500: 'Máy chủ gặp lỗi khi xử lý yêu cầu. Vui lòng thử lại sau.',
  502: 'Chưa kết nối được dịch vụ xử lý. Vui lòng thử lại sau.',
  503: 'Dịch vụ tạm thời chưa sẵn sàng. Vui lòng thử lại sau.',
  504: 'Máy chủ phản hồi quá lâu. Vui lòng thử lại sau.',
};

/** User-facing errors only. Keep original errors in their cause for diagnostics. */
export function errorMessageVi(error: unknown, options: { status?: number; fallback?: string; login?: boolean } = {}): string {
  const detail = error as { name?: string; code?: string; message?: unknown; response?: { status?: number; data?: { message?: unknown; error_description?: unknown; error?: unknown } } } | null;
  const status = options.status ?? detail?.response?.status;
  const data = detail?.response?.data;
  const raw = typeof error === 'string' ? error : data?.message ?? data?.error_description ?? data?.error ?? detail?.message;
  const message = typeof raw === 'string' ? raw.trim() : '';
  const code = detail?.code ?? '';
  if (options.login && (status === 400 || status === 401)) return 'Mã đăng nhập hoặc mật khẩu không đúng. Vui lòng kiểm tra lại.';
  if (detail?.name === 'TimeoutError' || /ECONNABORTED|ETIMEDOUT/.test(code) || /timed?\s*out|timeout|time limit exceeded/i.test(message)) return httpMessages[408];
  if (/failed to fetch|fetch failed|network\s*error|networkerror|network request failed|load failed|ERR_NETWORK|ERR_CONNECTION|ERR_INTERNET/i.test(message + ' ' + code)) return 'Không kết nối được máy chủ. Vui lòng kiểm tra mạng và thử lại.';
  if (detail?.name === 'NotAllowedError' || /permission denied|permission dismissed/i.test(message)) return 'Chưa được cấp quyền camera hoặc micro. Vui lòng cho phép truy cập trong trình duyệt.';
  if (detail?.name === 'NotFoundError' || /requested device not found/i.test(message)) return 'Không tìm thấy camera hoặc micro. Vui lòng kiểm tra thiết bị.';
  if (detail?.name === 'NotReadableError' || /could not start video source|device in use/i.test(message)) return 'Không mở được camera hoặc micro. Hãy kiểm tra thiết bị có đang được ứng dụng khác sử dụng không.';
  if (detail?.name === 'AbortError' || /signal is aborted|operation was aborted|user aborted/i.test(message)) return 'Yêu cầu đã bị gián đoạn. Vui lòng thử lại.';
  if (detail?.name === 'QuotaExceededError') return 'Bộ nhớ trình duyệt đã đầy. Vui lòng giải phóng dung lượng và thử lại.';
  if (detail?.name === 'SyntaxError' || /unexpected token|unexpected end of json/i.test(message)) return 'Dữ liệu máy chủ trả về chưa hợp lệ. Vui lòng thử lại.';
  // Keep Vietnamese business rules, but do not display raw database/stack errors.
  if (/[À-ỹĐđ]/.test(message) && !/SQLState|SQLGrammar|JDBC exception|stack trace|org\.springframework|java\.lang\./i.test(message)) return message;
  return (status && httpMessages[status]) || options.fallback || defaultMessage;
}

export function localizedError(error: unknown, options: Parameters<typeof errorMessageVi>[1] = {}): Error {
  const result = new Error(errorMessageVi(error, options), { cause: error });
  if (error instanceof Error) result.name = error.name;
  return result;
}
