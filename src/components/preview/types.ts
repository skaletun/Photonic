import type { KernelId, ViewMode } from "@/lib/config";
import type { SampleId } from "@/lib/samples";
export type PreviewHandle = {
  applyTransform: () => void;
  setSplit: (t: number) => void;
  zoomBy: (factor: number) => void;
  resetView: () => void;
  drawPreview: (args: { bitmap: ImageBitmap; imageData: ImageData; overview: boolean }) => void;
  drawVersus: (args: { a: ImageData; b: ImageData; overview: boolean }) => void;
  showLoupe: (imageData: ImageData | null) => void;
  destCenter: () => { x: number; y: number };
  destPointFromClient: (clientX: number, clientY: number) => { x: number; y: number };
  paintGrid: (id: string, imageData: ImageData) => void;
  clearGrid: () => void;
  getSplit: () => number;
};

export type PreviewProps = {
  hasSource: boolean;
  viewMode: ViewMode;
  kernel: KernelId;
  versusA: KernelId;
  versusB: KernelId;
  holdOriginal: boolean;
  onViewMode: (mode: ViewMode) => void;
  onVersusKernel: (side: "a" | "b", id: KernelId) => void;
  onLoupePoint: (nx: number, ny: number, side: "a" | "b") => void;
  onOpen: () => void;
  onSample: (id: SampleId) => void;
  onHoldOriginal: (hold: boolean) => void;
};
