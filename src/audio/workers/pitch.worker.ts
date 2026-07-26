import { createPitchWorkerRuntime } from "./pitch-worker-runtime";
import type { PitchWorkerResponse } from "./worker-protocol";

type WorkerMessageListener = (event: MessageEvent<unknown>) => void;

interface PitchWorkerScope {
  addEventListener(type: "message", listener: WorkerMessageListener): void;
  postMessage(message: PitchWorkerResponse): void;
}

const workerScope = globalThis as unknown as PitchWorkerScope;
const runtime = createPitchWorkerRuntime((message) => workerScope.postMessage(message));

workerScope.addEventListener("message", (event) => runtime.handleMessage(event.data));
