import { AppError, type AppErrorCode } from "./audio-types";

export type MicrophonePermissionState = PermissionState | "unknown";

export interface MicrophoneAccessDependencies {
  isSecureContext: boolean;
  getUserMedia: ((constraints: MediaStreamConstraints) => Promise<MediaStream>) | null;
  queryPermissionState: (() => Promise<PermissionState>) | null;
}

export interface StoppableMediaStream {
  getTracks(): readonly Pick<MediaStreamTrack, "stop">[];
}

export function createMicrophoneConstraints(): MediaStreamConstraints {
  return {
    audio: {
      channelCount: { ideal: 1 },
      echoCancellation: { ideal: false },
      noiseSuppression: { ideal: false },
      autoGainControl: { ideal: false },
      sampleRate: { ideal: 48_000 },
    },
  };
}

export function createBrowserMicrophoneDependencies(): MicrophoneAccessDependencies {
  const mediaDevices = globalThis.navigator?.mediaDevices;
  const permissions = globalThis.navigator?.permissions;

  return {
    isSecureContext: globalThis.isSecureContext === true,
    getUserMedia:
      typeof mediaDevices?.getUserMedia === "function"
        ? (constraints) => mediaDevices.getUserMedia(constraints)
        : null,
    queryPermissionState:
      typeof permissions?.query === "function"
        ? async () => {
            // Some TypeScript DOM libraries still omit the Media Capture permission names.
            const descriptor = { name: "microphone" } as PermissionDescriptor;
            return (await permissions.query(descriptor)).state;
          }
        : null,
  };
}

export async function readMicrophonePermissionState(
  queryPermissionState: MicrophoneAccessDependencies["queryPermissionState"],
): Promise<MicrophonePermissionState> {
  if (!queryPermissionState) {
    return "unknown";
  }

  try {
    const state = await queryPermissionState();
    return state === "denied" || state === "granted" || state === "prompt" ? state : "unknown";
  } catch {
    // Permission queries are not uniformly implemented, so getUserMedia remains authoritative.
    return "unknown";
  }
}

function getErrorName(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("name" in error)) {
    return null;
  }

  return typeof error.name === "string" ? error.name : null;
}

function isPermissionFailure(error: unknown): boolean {
  const name = getErrorName(error);
  return name === "NotAllowedError" || name === "PermissionDeniedError";
}

export function mapMicrophoneError(
  error: unknown,
  permissionState: MicrophonePermissionState = "unknown",
): AppErrorCode {
  if (error instanceof AppError) {
    return error.code;
  }

  switch (getErrorName(error)) {
    case "NotAllowedError":
    case "PermissionDeniedError":
      // The platform has no distinct "dismissed" result; a remaining prompt state is the
      // strongest available signal that the denial was not persisted.
      return permissionState === "prompt" ? "permission-dismissed" : "permission-denied";
    case "NotFoundError":
    case "DevicesNotFoundError":
    case "OverconstrainedError":
    case "ConstraintNotSatisfiedError":
      return "device-not-found";
    case "NotReadableError":
    case "TrackStartError":
      return "device-disconnected";
    case "SecurityError":
      return "unsupported-browser";
    default:
      return "unknown";
  }
}

export async function requestMicrophoneAccess(
  dependencies: MicrophoneAccessDependencies = createBrowserMicrophoneDependencies(),
): Promise<MediaStream> {
  if (!dependencies.isSecureContext || !dependencies.getUserMedia) {
    throw new AppError("unsupported-browser");
  }

  try {
    return await dependencies.getUserMedia(createMicrophoneConstraints());
  } catch (error) {
    const permissionState = isPermissionFailure(error)
      ? await readMicrophonePermissionState(dependencies.queryPermissionState)
      : "unknown";
    throw new AppError(mapMicrophoneError(error, permissionState), error);
  }
}

export function stopMediaStream(stream: StoppableMediaStream): void {
  let firstError: unknown;

  for (const track of stream.getTracks()) {
    try {
      track.stop();
    } catch (error) {
      firstError ??= error;
    }
  }

  if (firstError !== undefined) {
    throw firstError;
  }
}
