import type { Dispatch, RefObject } from "react";
import type { Action, UiState } from "@/lib/app-state";
import type { PreviewHandle } from "@/components/Preview";
import type { ImagePassport } from "@/lib/io/exif";
import type { StatusMsg } from "@/lib/i18n";
import type { StatusKind } from "@/lib/config";
import type { ResampleClient } from "@/lib/resample/client";
import { ByteCache } from "@/lib/byte-cache";
import type { KernelId } from "@/lib/config";
import type { ResampleJobOptions, Region } from "@/lib/resample/types";
import type { ResampleResult } from "@/lib/resample/client";

export const EMPTY_PASSPORT: ImagePassport = {
  hasExif: false,
  copyright: "",
  jpegApp1: null,
  tiff: null,
  icc: null,
  iccKind: "none",
};
export type Runtime = {
  state: RefObject<UiState>;
  dispatch: Dispatch<Action>;
  client: RefObject<ResampleClient | null>;
  preview: RefObject<PreviewHandle | null>;
  source: RefObject<{ display: ImageBitmap | null; passport: ImagePassport; version: number }>;
  full: RefObject<{ image: ImageData | null; fingerprint: string }>;
  cache: ByteCache<ImageData>;
  operation: RefObject<AbortController | null>;
  previewImage: RefObject<ImageData | null>;
  status: (msg: StatusMsg, kind?: StatusKind) => void;
};
export function currentScale(state: UiState) {
  return state.recipeScale ? state.recipeScale / 100 : state.sourceWidth ? state.destW / state.sourceWidth : 1;
}
export function jobOptions(
  state: UiState,
  extra: Partial<{ kernelId: KernelId; kind: string; destW: number; destH: number; region: Region }> = {},
): ResampleJobOptions {
  const kernelId = extra.kernelId ?? state.kernel;
  return {
    destW: state.destW,
    destH: state.destH,
    kernelId,
    a: state.lanczosA,
    colorSpace: (kernelId === "photonic" || kernelId === "photonic-tcr") ? "linear" : state.colorSpace,
    unsharp: {
      enabled: state.unsharpEnabled,
      amount: state.unsharpAmount,
      radius: state.unsharpRadius,
      threshold: state.unsharpThreshold,
    },
    ...extra,
  };
}
export function resultImage(result: ResampleResult) {
  return new ImageData(result.data as Uint8ClampedArray<ArrayBuffer>, result.width, result.height);
}
