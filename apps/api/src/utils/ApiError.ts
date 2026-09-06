/** ApiError — servisler fırlatır, errorHandler yakalar. Sessiz hata yutma yok; mesajlar Türkçe. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code: string = 'API_ERROR',
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
  static badRequest(message = 'Geçersiz istek', details?: unknown): ApiError {
    return new ApiError(400, message, 'BAD_REQUEST', details);
  }
  static unauthorized(message = 'Oturum gerekli'): ApiError {
    return new ApiError(401, message, 'UNAUTHORIZED');
  }
  static forbidden(message = 'Bu işlem için yetkiniz yok'): ApiError {
    return new ApiError(403, message, 'FORBIDDEN');
  }
  /** Kapsam dışı kaynak 404 döner (D7) — varlığın bilgisi sızmaz. */
  static notFound(message = 'Kayıt bulunamadı'): ApiError {
    return new ApiError(404, message, 'NOT_FOUND');
  }
  static conflict(message = 'Çakışma', details?: unknown): ApiError {
    return new ApiError(409, message, 'CONFLICT', details);
  }
}
