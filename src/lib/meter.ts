export const METER_BINS = 64;
export const CLIP_WARN = 0.02;

export type FrameMeter = {
  bins: number[];
  clipLow: number;
  clipHigh: number;
  scan: number[];
};

function luma(r: number, g: number, b: number) {
  return Math.min(255, Math.max(0, Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b)));
}

export function measureFrame(imageData: ImageData): FrameMeter {
  const bins = new Array<number>(METER_BINS).fill(0);
  const px = imageData.data;
  const n = imageData.width * imageData.height;
  let clipLow = 0;
  let clipHigh = 0;
  for (let i = 0; i < px.length; i += 4) {
    const y = luma(px[i], px[i + 1], px[i + 2]);
    bins[Math.min(METER_BINS - 1, (y * METER_BINS) >> 8)] += 1;
    if (y === 0) clipLow += 1;
    if (y === 255) clipHigh += 1;
  }
  const yRow = Math.min(imageData.height - 1, Math.floor(imageData.height / 2));
  const scan: number[] = [];
  const last = Math.max(0, imageData.width - 1);
  for (let s = 0; s < METER_BINS; s += 1) {
    const x = last === 0 ? 0 : Math.round((s / (METER_BINS - 1)) * last);
    const i = (yRow * imageData.width + x) * 4;
    scan.push(luma(px[i], px[i + 1], px[i + 2]));
  }
  return {
    bins,
    clipLow: n ? clipLow / n : 0,
    clipHigh: n ? clipHigh / n : 0,
    scan,
  };
}

export function cropImageData(src: ImageData, x: number, y: number, w: number, h: number) {
  const width = Math.max(1, Math.min(w, src.width - x));
  const height = Math.max(1, Math.min(h, src.height - y));
  const sx = Math.max(0, Math.min(src.width - 1, x));
  const sy = Math.max(0, Math.min(src.height - 1, y));
  const out = new ImageData(width, height);
  for (let row = 0; row < height; row += 1) {
    const srcOff = ((sy + row) * src.width + sx) * 4;
    out.data.set(src.data.subarray(srcOff, srcOff + width * 4), row * width * 4);
  }
  return out;
}

export function cropAround(imageData: ImageData, nx: number, ny: number, size: number) {
  const side = Math.max(1, Math.min(size, imageData.width, imageData.height));
  const cx = nx * imageData.width;
  const cy = ny * imageData.height;
  const x = Math.max(0, Math.min(imageData.width - side, Math.round(cx - side / 2)));
  const y = Math.max(0, Math.min(imageData.height - side, Math.round(cy - side / 2)));
  return cropImageData(imageData, x, y, side, side);
}
