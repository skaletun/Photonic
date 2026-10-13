import { afterEach, expect, it, vi } from "vitest";
import { ResampleClient } from "../src/lib/resample/client";
class FakeWorker {
  static last: FakeWorker;
  sent: { type: string; jobId?: number }[] = [];
  handler!: (event: { data: unknown }) => void;
  constructor() {
    FakeWorker.last = this;
  }
  addEventListener(type: string, callback: (event: { data: unknown }) => void) {
    if (type === "message") this.handler = callback;
  }
  postMessage(msg: { type: string; jobId?: number }) {
    this.sent.push(msg);
  }
  terminate() {}
  done(jobId: number) {
    this.handler({
      data: { type: "done", jobId, width: 1, height: 1, buffer: new ArrayBuffer(4), region: null, kind: "export" },
    });
  }
}
afterEach(() => vi.unstubAllGlobals());
const options = { destW: 1, destH: 1, kernelId: "photonic" };
it("protects export from loupe requests and schedules the latest preview afterwards", async () => {
  vi.stubGlobal("Worker", FakeWorker);
  const client = new ResampleClient();
  const exportJob = client.resample({ ...options, kind: "export" });
  await expect(client.resample({ ...options, kind: "loupe" })).rejects.toMatchObject({ name: "AbortError" });
  const stale = client.resample({ ...options, kind: "preview" });
  const staleRejected = expect(stale).rejects.toMatchObject({ name: "AbortError" });
  const latest = client.resample({ ...options, kind: "preview" });
  await staleRejected;
  expect(FakeWorker.last.sent.filter((msg) => msg.type === "abort")).toHaveLength(0);
  FakeWorker.last.done(1);
  await exportJob;
  const started = FakeWorker.last.sent.filter((msg) => msg.type === "resample");
  expect(started).toHaveLength(2);
  FakeWorker.last.done(started[1].jobId!);
  await latest;
  client.terminate();
});
it("rejects active and queued jobs on shutdown", async () => {
  vi.stubGlobal("Worker", FakeWorker);
  const client = new ResampleClient();
  const a = expect(client.resample({ ...options, kind: "export" })).rejects.toMatchObject({ name: "AbortError" });
  const b = expect(client.resample({ ...options, kind: "preview" })).rejects.toMatchObject({ name: "AbortError" });
  client.terminate();
  await Promise.all([a, b]);
});
