export const ERROR_CODES = [
  "unsupported_type",
  "decode_failed",
  "frame_too_large",
  "canvas_unavailable",
  "out_of_memory",
  "pixels_unreadable",
  "encode_failed",
  "source_missing",
  "worker_failed",
  "unknown",
  "dest_min",
  "dest_side",
  "dest_area",
  "dest_hard",
  "dest_warn",
  "batch_too_large",
  "memory_budget",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export type ErrorParams = Record<string, string | number>;

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly params: ErrorParams | undefined;

  constructor(code: ErrorCode, params?: ErrorParams) {
    super(code);
    this.name = "AppError";
    this.code = code;
    this.params = params;
  }
}

export function isErrorCode(value: string): value is ErrorCode {
  return (ERROR_CODES as readonly string[]).includes(value);
}

export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (error instanceof Error && isErrorCode(error.message)) {
    return new AppError(error.message);
  }
  return new AppError("unknown");
}
