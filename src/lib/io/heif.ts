import { AppError } from "../errors";

type HeicDecode = (input: { buffer: ArrayBuffer | Uint8Array }) => Promise<{
  width: number;
  height: number;
  data: Uint8ClampedArray | ArrayBuffer;
}>;

let decodeHeic: HeicDecode | null = null;

async function loadDecoder(): Promise<HeicDecode> {
  if (decodeHeic) return decodeHeic;
  const mod = await import(/* webpackChunkName: "heif-decode" */ "heic-decode");
  const fn = mod.default;
  if (typeof fn !== "function") throw new AppError("decode_failed");
  decodeHeic = fn;
  return fn;
}

/** Lazy wasm HEIF decode. Not in the main chunk or the service-worker precache. */
export async function decodeHeifBuffer(buffer: ArrayBuffer | Uint8Array) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  try {
    const decode = await loadDecoder();
    const result = await decode({ buffer: bytes });
    const needed = result.width * result.height * 4;
    const source = result.data instanceof Uint8ClampedArray ? result.data : new Uint8ClampedArray(result.data);
    if (source.length < needed) throw new AppError("decode_failed");
    const pixels = new Uint8ClampedArray(needed);
    pixels.set(source.subarray(0, needed));
    return new ImageData(pixels, result.width, result.height);
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("decode_failed");
  }
}
