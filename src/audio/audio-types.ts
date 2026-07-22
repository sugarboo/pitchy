export type AppErrorCode =
  | "unsupported-browser"
  | "permission-denied"
  | "permission-dismissed"
  | "device-not-found"
  | "device-disconnected"
  | "audio-context-failed"
  | "worklet-load-failed"
  | "worker-failed"
  | "storage-failed"
  | "unknown";

export type AudioEngineStatus =
  | "idle"
  | "requesting-permission"
  | "starting"
  | "running"
  | "suspended"
  | "stopping"
  | "error";

export class AppError extends Error {
  readonly code: AppErrorCode;

  constructor(code: AppErrorCode, cause?: unknown) {
    super(code, cause === undefined ? undefined : { cause });
    this.name = "AppError";
    this.code = code;
  }
}

export function toAppError(error: unknown): AppError {
  return error instanceof AppError ? error : new AppError("unknown", error);
}
