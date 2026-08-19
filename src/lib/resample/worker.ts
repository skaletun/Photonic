import { resamplePhotonic } from "./photonic";
import { resampleSeparable } from "./separable";
import type { ResampleJobOptions } from "./types";
import { unsharpMask } from "./unsharp";

type SourceFrame = { width: number; height: number; data: Uint8ClampedArray };

type Incoming =
  | { type: "abort"; jobId: number }
  | { type: "setSource"; width: number; height: number; buffer: ArrayBuffer }
  | { type: "resample"; jobId: number; options: ResampleJobOptions };

let source: SourceFrame | null = null;
let runningJob = 0;

self.onmessage = async (event: MessageEvent<Incoming>) => {
  const msg = event.data;
  if (msg.type === "abort") {
    if (runningJob === msg.jobId) runningJob = 0;
    return;
  }

  if (msg.type === "setSource") {
    source = {
      width: msg.width,
      height: msg.height,
      data: new Uint8ClampedArray(msg.buffer),
    };
    self.postMessage({ type: "sourceReady", width: source.width, height: source.height });
    return;
  }

  if (msg.type !== "resample") return;

  const jobId = msg.jobId;
  runningJob = jobId;
  const opts = msg.options;

  const shouldAbort = () => runningJob !== jobId;

  try {
    if (!source) throw new Error("source_missing");

    const resample = opts.kernelId === "photonic" ? resamplePhotonic : resampleSeparable;
    const pixels = await resample({
      src: source.data,
      srcW: source.width,
      srcH: source.height,
      destW: opts.destW,
      destH: opts.destH,
      kernelId: opts.kernelId ?? "photonic",
      a: opts.a,
      colorSpace: opts.kernelId === "photonic" ? "linear" : opts.colorSpace,
      region: opts.region,
      shouldAbort,
      onProgress: (value) => {
        if (shouldAbort()) return;
        self.postMessage({ type: "progress", jobId, value });
      },
    });

    if (!pixels || shouldAbort()) {
      self.postMessage({ type: "aborted", jobId });
      return;
    }

    const width = opts.region?.w ?? opts.destW;
    const height = opts.region?.h ?? opts.destH;

    if (opts.unsharp?.enabled && opts.unsharp.amount > 0) {
      unsharpMask(pixels, width, height, opts.unsharp);
    }

    if (shouldAbort()) {
      self.postMessage({ type: "aborted", jobId });
      return;
    }

    self.postMessage(
      {
        type: "done",
        jobId,
        width,
        height,
        region: opts.region ?? null,
        kind: opts.kind ?? "full",
        buffer: pixels.buffer,
      },
      { transfer: [pixels.buffer] },
    );
  } catch (error) {
    self.postMessage({
      type: "error",
      jobId,
      code: error instanceof Error ? error.message : "unknown",
    });
  }
};
