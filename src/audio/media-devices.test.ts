import { describe, expect, it, vi } from "vitest";
import { AppError, toAppError } from "./audio-types";
import {
  createMicrophoneConstraints,
  type MicrophoneAccessDependencies,
  mapMicrophoneError,
  readMicrophonePermissionState,
  requestMicrophoneAccess,
  stopMediaStream,
} from "./media-devices";

function namedError(name: string): Error {
  const error = new Error(name);
  error.name = name;
  return error;
}

function createDependencies(
  overrides: Partial<MicrophoneAccessDependencies> = {},
): MicrophoneAccessDependencies {
  return {
    isSecureContext: true,
    getUserMedia: vi.fn(async () => ({ getTracks: () => [] }) as unknown as MediaStream),
    queryPermissionState: null,
    ...overrides,
  };
}

describe("microphone constraints", () => {
  it("requests mono input with browser processing disabled as ideal preferences", async () => {
    const stream = { getTracks: () => [] } as unknown as MediaStream;
    const getUserMedia = vi.fn(async (_constraints: MediaStreamConstraints) => stream);

    const result = await requestMicrophoneAccess(createDependencies({ getUserMedia }));

    expect(result).toBe(stream);
    expect(getUserMedia).toHaveBeenCalledExactlyOnceWith(createMicrophoneConstraints());
  });

  it("rejects before requesting media outside a supported secure context", async () => {
    const getUserMedia = vi.fn(async (_constraints: MediaStreamConstraints) => {
      throw new Error("must not run");
    });

    await expect(
      requestMicrophoneAccess(createDependencies({ getUserMedia, isSecureContext: false })),
    ).rejects.toMatchObject({ code: "unsupported-browser" });
    expect(getUserMedia).not.toHaveBeenCalled();

    await expect(
      requestMicrophoneAccess(createDependencies({ getUserMedia: null })),
    ).rejects.toMatchObject({ code: "unsupported-browser" });
  });
});

describe("microphone error mapping", () => {
  it("distinguishes a dismissed prompt from a persistent denial when state is available", () => {
    const error = namedError("NotAllowedError");

    expect(mapMicrophoneError(error, "prompt")).toBe("permission-dismissed");
    expect(mapMicrophoneError(error, "denied")).toBe("permission-denied");
    expect(mapMicrophoneError(error, "unknown")).toBe("permission-denied");
  });

  it.each([
    ["NotFoundError", "device-not-found"],
    ["OverconstrainedError", "device-not-found"],
    ["NotReadableError", "device-disconnected"],
    ["SecurityError", "unsupported-browser"],
    ["InvalidStateError", "unknown"],
  ] as const)("maps %s to %s", (name, expectedCode) => {
    expect(mapMicrophoneError(namedError(name))).toBe(expectedCode);
  });

  it("uses a post-failure permission query for a dismissed prompt", async () => {
    const getUserMedia = vi.fn(async (_constraints: MediaStreamConstraints) => {
      throw namedError("NotAllowedError");
    });
    const queryPermissionState = vi.fn(async () => "prompt" as PermissionState);

    await expect(
      requestMicrophoneAccess(createDependencies({ getUserMedia, queryPermissionState })),
    ).rejects.toMatchObject({ code: "permission-dismissed" });
    expect(queryPermissionState).toHaveBeenCalledOnce();
  });

  it("falls back conservatively when permission state cannot be queried", async () => {
    const getUserMedia = vi.fn(async (_constraints: MediaStreamConstraints) => {
      throw namedError("NotAllowedError");
    });
    const queryPermissionState = vi.fn(async (): Promise<PermissionState> => {
      throw new Error("Permissions API unavailable");
    });

    expect(await readMicrophonePermissionState(queryPermissionState)).toBe("unknown");
    await expect(
      requestMicrophoneAccess(createDependencies({ getUserMedia, queryPermissionState })),
    ).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("preserves the original browser failure as the AppError cause", async () => {
    const browserError = namedError("NotFoundError");
    const getUserMedia = vi.fn(async (_constraints: MediaStreamConstraints) => {
      throw browserError;
    });

    try {
      await requestMicrophoneAccess(createDependencies({ getUserMedia }));
      throw new Error("Expected requestMicrophoneAccess to reject");
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect(error).toMatchObject({ code: "device-not-found", cause: browserError });
    }
  });
});

describe("microphone resource cleanup", () => {
  it("stops every track returned by the permission probe", () => {
    const firstStop = vi.fn();
    const secondStop = vi.fn();

    stopMediaStream({ getTracks: () => [{ stop: firstStop }, { stop: secondStop }] });

    expect(firstStop).toHaveBeenCalledOnce();
    expect(secondStop).toHaveBeenCalledOnce();
  });

  it("normalizes unknown failures without replacing an existing AppError", () => {
    const existing = new AppError("device-not-found");

    expect(toAppError(existing)).toBe(existing);
    expect(toAppError(new Error("unexpected"))).toMatchObject({ code: "unknown" });
  });
});
