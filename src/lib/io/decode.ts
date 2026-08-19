import { ACCEPT_EXT, ACCEPT_TYPES, MAX_AREA, MAX_SIDE } from "../config";
import { AppError } from "../errors";

function mimeFromName(name: string) {
  const lower = name.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".bmp")) return "image/bmp";
  if (lower.endsWith(".gif")) return "image/gif";
  return "";
}

export function sniffMime(file: File) {
  const type = (file.type || "").toLowerCase();
  if ((ACCEPT_TYPES as readonly string[]).includes(type)) {
    return type === "image/x-windows-bmp" ? "image/bmp" : type;
  }
  return mimeFromName(file.name);
}

export function isSupportedFile(file: File) {
  if (sniffMime(file)) return true;
  const lower = file.name.toLowerCase();
  return ACCEPT_EXT.some((ext) => lower.endsWith(ext));
}

export function acceptAttr() {
  return [...ACCEPT_TYPES, ...ACCEPT_EXT].join(",");
}

export type DecodedImage = {
  width: number;
  height: number;
  imageData: ImageData;
  display: ImageBitmap;
  mime: string;
  name: string;
  isGif: boolean;
};

/** Декодирует файл в ImageData + облегчённый bitmap для слоя «до». */
export async function decodeFile(file: File): Promise<DecodedImage> {
  const mime = sniffMime(file);
  if (!mime) {
    throw new AppError("unsupported_type");
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new AppError("decode_failed");
  }

  const { width, height } = bitmap;
  if (width > MAX_SIDE || height > MAX_SIDE || width * height > MAX_AREA) {
    bitmap.close();
    throw new AppError("frame_too_large", { w: width, h: height, max: MAX_SIDE });
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    bitmap.close();
    throw new AppError("canvas_unavailable");
  }

  try {
    ctx.drawImage(bitmap, 0, 0);
    const imageData = ctx.getImageData(0, 0, width, height);
    const long = Math.max(width, height);
    const previewSide = Math.min(2048, long);
    const scale = previewSide / long;
    const display = await createImageBitmap(bitmap, {
      resizeWidth: Math.max(1, Math.round(width * scale)),
      resizeHeight: Math.max(1, Math.round(height * scale)),
      resizeQuality: "high",
    });
    bitmap.close();
    canvas.width = 0;
    canvas.height = 0;
    return {
      width,
      height,
      imageData,
      display,
      mime,
      name: file.name,
      isGif: mime === "image/gif",
    };
  } catch (error) {
    bitmap.close();
    canvas.width = 0;
    canvas.height = 0;
    throw new AppError(
      error instanceof Error && /memory|alloc|size/i.test(error.message) ? "out_of_memory" : "pixels_unreadable",
    );
  }
}
