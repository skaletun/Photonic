/**
 * Мост к Web Worker: очередь из одной активной задачи, abort, прогресс.
 */

import { AppError, isErrorCode } from "../errors";
import type { Region, ResampleJobOptions } from "./types";

export type ResampleResult = {
  width: number;
  height: number;
  data: Uint8ClampedArray;
  region: Region | null;
  kind: string;
};

type Pending = {
  resolve: (value: ResampleResult) => void;
  reject: (error: Error) => void;
  onProgress?: (value: number) => void;
  options: ResampleJobOptions;
};

type WorkerMessage =
  | { type: "progress"; jobId: number; value: number }
  | { type: "aborted"; jobId: number }
  | { type: "error"; jobId: number; code?: string; message?: string }
  | {
      type: "done";
      jobId: number;
      width: number;
      height: number;
      buffer: ArrayBuffer;
      region: Region | null;
      kind: string;
    }
  | { type: "sourceReady"; width: number; height: number };

export class ResampleClient {
  private worker: Worker;
  private seq = 0;
  private activeId = 0;
  private pending = new Map<number, Pending>();
  private queue: number[] = [];
  private activeKind = "";

  constructor() {
    this.worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    this.worker.addEventListener("message", (event: MessageEvent<WorkerMessage>) => this.handle(event.data));
    this.worker.addEventListener("error", () => {
      const err = new AppError("worker_failed");
      for (const job of this.pending.values()) job.reject(err);
      this.pending.clear();
      this.queue = [];
      this.activeId = 0;
    });
  }

  /**
   * Передаёт буфер в worker (zero-copy). ImageData на главном потоке после этого непригоден.
   */
  setSource(imageData: ImageData) {
    this.abortActive();
    for (const id of this.queue) this.cancel(id);
    this.queue = [];
    this.worker.postMessage(
      {
        type: "setSource",
        width: imageData.width,
        height: imageData.height,
        buffer: imageData.data.buffer,
      },
      [imageData.data.buffer],
    );
  }

  abortActive() {
    if (!this.activeId) return;
    this.worker.postMessage({ type: "abort", jobId: this.activeId });
    const job = this.pending.get(this.activeId);
    if (job) {
      job.reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
      this.pending.delete(this.activeId);
    }
    this.activeId = 0;
  }

  resample(options: ResampleJobOptions, onProgress?: (value: number) => void) {
    const protectedJob = this.activeKind === "export" && this.activeId !== 0;
    if (protectedJob && options.kind === "loupe") return Promise.reject(this.abortError());
    if (!protectedJob && this.activeId) this.abortActive();
    for (const id of this.queue) this.cancel(id);
    this.queue = [];
    const jobId = (this.seq += 1);

    return new Promise<ResampleResult>((resolve, reject) => {
      this.pending.set(jobId, { resolve, reject, onProgress, options });
      this.queue.push(jobId);
      this.startNext();
    });
  }

  terminate() {
    this.abortActive();
    for (const id of this.queue) this.cancel(id);
    this.queue = [];
    this.worker.terminate();
    this.pending.clear();
  }

  private abortError() {
    return Object.assign(new Error("aborted"), { name: "AbortError" });
  }
  private cancel(id: number) {
    this.pending.get(id)?.reject(this.abortError());
    this.pending.delete(id);
  }
  private startNext() {
    if (this.activeId) return;
    const id = this.queue.shift();
    if (id === undefined) return;
    const job = this.pending.get(id);
    if (!job) return;
    this.activeId = id;
    this.activeKind = job.options.kind ?? "preview";
    this.worker.postMessage({ type: "resample", jobId: id, options: job.options });
  }

  private handle(msg: WorkerMessage) {
    if (msg.type === "progress") {
      this.pending.get(msg.jobId)?.onProgress?.(msg.value);
      return;
    }
    if (msg.type === "sourceReady") return;

    const job = this.pending.get(msg.jobId);
    if (!job) return;
    this.pending.delete(msg.jobId);
    if (this.activeId === msg.jobId) {
      this.activeId = 0;
      this.activeKind = "";
    }
    this.startNext();

    if (msg.type === "aborted") {
      job.reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
      return;
    }
    if (msg.type === "error") {
      const code = msg.code ?? msg.message ?? "unknown";
      job.reject(new AppError(isErrorCode(code) ? code : "unknown"));
      return;
    }
    if (msg.type === "done") {
      job.resolve({
        width: msg.width,
        height: msg.height,
        data: new Uint8ClampedArray(msg.buffer),
        region: msg.region,
        kind: msg.kind,
      });
    }
  }
}

export function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}
