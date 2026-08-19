import type { KernelId } from "./config";

export const SAMPLE_FILES = [
  {
    id: "photo" as const,
    file: "photo.jpg",
    mime: "image/jpeg",
    kernel: "photonic" as KernelId,
    scale: 100,
  },
  {
    id: "type" as const,
    file: "type.png",
    mime: "image/png",
    kernel: "photonic" as KernelId,
    scale: 100,
  },
  {
    id: "pixel" as const,
    file: "pixel.png",
    mime: "image/png",
    kernel: "nearest" as KernelId,
    scale: 400,
  },
];

export type SampleId = (typeof SAMPLE_FILES)[number]["id"];
