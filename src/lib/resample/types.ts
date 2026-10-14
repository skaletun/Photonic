import type { ColorSpace } from "../config";

export type Region = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type UnsharpOptions = {
  enabled: boolean;
  amount: number;
  radius: number;
  threshold: number;
};

export type ResampleEngineOptions = {
  src: Uint8ClampedArray;
  srcW: number;
  srcH: number;
  destW: number;
  destH: number;
  kernelId?: string;
  coherent?: boolean;
  a?: number;
  colorSpace?: ColorSpace;
  region?: Region;
  onProgress?: (value: number) => void;
  shouldAbort?: () => boolean;
};

export type ResampleJobOptions = {
  destW: number;
  destH: number;
  kernelId: string;
  a?: number;
  colorSpace?: ColorSpace;
  region?: Region;
  kind?: string;
  unsharp?: UnsharpOptions;
};

export type Contribs = {
  indices: Int32Array;
  weights: Float32Array;
  offsets: Int32Array;
  counts: Int32Array;
};
