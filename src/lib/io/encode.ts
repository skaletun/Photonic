/**
 * Кодирует ImageData в Blob выбранного MIME.
 * JPEG непрозрачен: подложка белая.
 */

import type { ExportFormat } from "../config";
import { AppError } from "../errors";

export function formatToMime(format: ExportFormat, originalMime: string) {
  if (format === "original") {
    if (originalMime === "image/gif" || originalMime === "image/bmp") return "image/png";
    if (
      originalMime === "image/heic" ||
      originalMime === "image/heif" ||
      originalMime === "image/avif"
    ) {
      return "image/jpeg";
    }
    return originalMime;
  }
  if (format === "png") return "image/png";
  if (format === "jpeg") return "image/jpeg";
  if (format === "webp") return "image/webp";
  return "image/png";
}

export function extensionForMime(mime: string) {
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/webp") return "webp";
  return "png";
}

export function encodeImageData(imageData: ImageData, mime: string, quality: number) {
  const canvas = document.createElement("canvas");
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return Promise.reject(new AppError("canvas_unavailable"));
  }
  if (mime === "image/jpeg") {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.putImageData(imageData, 0, 0);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        canvas.width = 0;
        canvas.height = 0;
        if (!blob) {
          reject(new AppError("encode_failed"));
          return;
        }
        resolve(blob);
      },
      mime,
      quality,
    );
  });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function stemFromName(name: string) {
  return name.replace(/\.[^.]+$/, "") || "image";
}
