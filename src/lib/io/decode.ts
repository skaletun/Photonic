import { ACCEPT_EXT, ACCEPT_TYPES, MAX_AREA, MAX_SIDE } from "../config";
import { memoryBudget } from "../memory";
import { AppError } from "../errors";
import { readPassport, type ImagePassport } from "./exif";
import { decodeHeifBuffer } from "./heif";

function mimeFromName(name: string) {
  const lower = name.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".bmp")) return "image/bmp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".heic")) return "image/heic";
  if (lower.endsWith(".heif")) return "image/heif";
  if (lower.endsWith(".avif")) return "image/avif";
  return "";
}

function ascii(bytes: Uint8Array, start: number, len: number) {
  return String.fromCharCode(...bytes.subarray(start, start + len));
}

export function sniffMagic(bytes: Uint8Array) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "image/png";
  }
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") return "image/webp";
  if (bytes.length >= 6 && ascii(bytes, 0, 3) === "GIF") return "image/gif";
  if (bytes.length >= 2 && bytes[0] === 0x42 && bytes[1] === 0x4d) return "image/bmp";
  if (bytes.length >= 12 && ascii(bytes, 4, 4) === "ftyp") {
    const brand = ascii(bytes, 8, 4);
    if (brand === "avif" || brand === "avis") return "image/avif";
    if (brand === "heic" || brand === "heix" || brand === "mif1" || brand === "msf1" || brand === "heif") {
      return "image/heic";
    }
  }
  return "";
}

export function sniffMime(file: File, bytes?: Uint8Array) {
  const type = (file.type || "").toLowerCase();
  if ((ACCEPT_TYPES as readonly string[]).includes(type)) {
    if (type === "image/x-windows-bmp") return "image/bmp";
    if (type === "image/heif") return "image/heic";
    return type;
  }
  return mimeFromName(file.name) || (bytes ? sniffMagic(bytes) : "");
}

export function isSupportedFile(file: File) {
  if (sniffMime(file)) return true;
  const lower = file.name.toLowerCase();
  return ACCEPT_EXT.some((ext) => lower.endsWith(ext));
}

export function acceptAttr() {
  return ["image/*", ...ACCEPT_EXT].join(",");
}

function isHeif(mime: string) {
  return mime === "image/heic" || mime === "image/heif";
}

export type DecodedImage = {
  width: number;
  height: number;
  imageData: ImageData;
  display: ImageBitmap;
  mime: string;
  name: string;
  isGif: boolean;
  bytes: Uint8Array;
  passport: ImagePassport;
};

async function bitmapFromFile(blob: Blob, mime: string, bytes: Uint8Array) {
  try {
    return await createImageBitmap(blob, { imageOrientation: "from-image" });
  } catch {
    if (!isHeif(mime)) throw new AppError("decode_failed");
    const imageData = await decodeHeifBuffer(bytes.slice());
    return createImageBitmap(imageData);
  }
}

/** Декодирует файл в ImageData + облегчённый bitmap для слоя «до». */
export async function decodeFile(file: File): Promise<DecodedImage> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = sniffMime(file, bytes);
  if (!mime) {
    throw new AppError("unsupported_type");
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await bitmapFromFile(new Blob([new Uint8Array(bytes)], { type: mime === "image/heic" ? "image/heic" : mime }), mime, bytes);
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("decode_failed");
  }

  const { width, height } = bitmap;
  if (width > MAX_SIDE || height > MAX_SIDE || width * height > MAX_AREA) {
    bitmap.close();
    throw new AppError("frame_too_large", { w: width, h: height, max: MAX_SIDE });
  }

  if (width * height * 12 > memoryBudget()) { bitmap.close(); throw new AppError("memory_budget"); }

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
      bytes,
      passport: readPassport(bytes, mime),
    };
  } catch (error) {
    bitmap.close();
    canvas.width = 0;
    canvas.height = 0;
    throw new AppError(
      error instanceof AppError
        ? error.code
        : error instanceof Error && /memory|alloc|size/i.test(error.message)
          ? "out_of_memory"
          : "pixels_unreadable",
    );
  }
}
