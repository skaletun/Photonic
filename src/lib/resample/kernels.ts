/**
 * Классические ядра реконструкции.
 * Все функции принимают x в пикселях источника (после учёта filterScale)
 * и возвращают вес. Отрицательные лепестки у Lanczos / Kaiser-sinc дают звон.
 */

export function sinc(x: number) {
  if (x === 0) return 1;
  const pix = Math.PI * x;
  return Math.sin(pix) / pix;
}

export function nearestKernel(x: number) {
  return Math.abs(x) < 0.5 ? 1 : 0;
}

/** Треугольник — билинейная интерполяция. */
export function bilinearKernel(x: number) {
  const ax = Math.abs(x);
  return ax < 1 ? 1 - ax : 0;
}

/** Cubic Keys / Catmull–Rom при a = -0.5. */
export function bicubicKernel(x: number, a = -0.5) {
  const ax = Math.abs(x);
  const ax2 = ax * ax;
  const ax3 = ax2 * ax;
  if (ax < 1) return (a + 2) * ax3 - (a + 3) * ax2 + 1;
  if (ax < 2) return a * ax3 - 5 * a * ax2 + 8 * a * ax - 4 * a;
  return 0;
}

/** Lanczos: sinc(x) * sinc(x/a), носитель |x| < a. */
export function lanczosKernel(x: number, a = 3) {
  const ax = Math.abs(x);
  if (ax >= a) return 0;
  if (ax < 1e-8) return 1;
  return sinc(x) * sinc(x / a);
}

/** Модифицированная Bessel I0 — окно Кайзера. */
function besselI0(x: number) {
  let sum = 1;
  let term = 1;
  const y = (x * x) / 4;
  for (let k = 1; k < 24; k += 1) {
    term *= y / (k * k);
    sum += term;
    if (term < 1e-16 * sum) break;
  }
  return sum;
}

export const PHOTONIC_SUPPORT = 3;
export const PHOTONIC_KAISER_BETA = 6;
const KAISER_I0_BETA = besselI0(PHOTONIC_KAISER_BETA);

/**
 * Эталон Photonic: оконный sinc Кайзера, support=3.
 * Нулевые узлы на целых (интерполирующее), боковые лепестки ниже, чем у Lanczos-3.
 */
export function photonicKernel(x: number) {
  const ax = Math.abs(x);
  if (ax >= PHOTONIC_SUPPORT) return 0;
  if (ax < 1e-8) return 1;
  const t = ax / PHOTONIC_SUPPORT;
  const window = besselI0(PHOTONIC_KAISER_BETA * Math.sqrt(1 - t * t)) / KAISER_I0_BETA;
  return sinc(x) * window;
}

/** Mitchell–Netravali (B = C = 1/3). Для цветности: резче B-сплайна, меньше звона, чем Catmull–Rom. */
export function mitchellKernel(x: number, B = 1 / 3, C = 1 / 3) {
  const ax = Math.abs(x);
  const ax2 = ax * ax;
  const ax3 = ax2 * ax;
  if (ax < 1) {
    return ((12 - 9 * B - 6 * C) * ax3 + (-18 + 12 * B + 6 * C) * ax2 + (6 - 2 * B)) / 6;
  }
  if (ax < 2) {
    return ((-B - 6 * C) * ax3 + (6 * B + 30 * C) * ax2 + (-12 * B - 48 * C) * ax + (8 * B + 24 * C)) / 6;
  }
  return 0;
}

/** Оконный sinc (Hann). Меньше звона, чем у Lanczos того же a. */
export function sincHannKernel(x: number, a = 3) {
  const ax = Math.abs(x);
  if (ax >= a) return 0;
  if (ax < 1e-8) return 1;
  const window = 0.5 + 0.5 * Math.cos((Math.PI * ax) / a);
  return sinc(x) * window;
}

/** Кубический B-сплайн — аппроксимирующий, мягче, почти без звона. */
export function bsplineKernel(x: number) {
  const ax = Math.abs(x);
  if (ax < 1) return 0.5 * ax * ax * ax - ax * ax + 2 / 3;
  if (ax < 2) return (-1 / 6) * ax * ax * ax + ax * ax - 2 * ax + 4 / 3;
  return 0;
}

export type KernelFn = (x: number, param?: number) => number;

export type KernelMeta = {
  id: string;
  name: string;
  support: number;
  variableSupport: boolean;
  interpolating: boolean;
  fn: KernelFn;
};

export const KERNELS: Record<string, KernelMeta> = {
  "photonic-tcr": {
    id: "photonic-tcr",
    name: "Photonic TCR",
    support: 3,
    variableSupport: false,
    interpolating: true,
    fn: photonicKernel,
  },
  photonic: {
    id: "photonic",
    name: "Photonic",
    support: 3,
    variableSupport: false,
    interpolating: true,
    fn: photonicKernel,
  },
  nearest: {
    id: "nearest",
    name: "Nearest",
    support: 0.5,
    variableSupport: false,
    interpolating: true,
    fn: nearestKernel,
  },
  bilinear: {
    id: "bilinear",
    name: "Bilinear",
    support: 1,
    variableSupport: false,
    interpolating: true,
    fn: bilinearKernel,
  },
  bicubic: {
    id: "bicubic",
    name: "Bicubic",
    support: 2,
    variableSupport: false,
    interpolating: true,
    fn: bicubicKernel,
  },
  lanczos: {
    id: "lanczos",
    name: "Lanczos",
    support: 3,
    variableSupport: true,
    interpolating: true,
    fn: lanczosKernel,
  },
  sinc: {
    id: "sinc",
    name: "Sinc",
    support: 3,
    variableSupport: true,
    interpolating: true,
    fn: sincHannKernel,
  },
  bspline: {
    id: "bspline",
    name: "B-Spline",
    support: 2,
    variableSupport: false,
    interpolating: false,
    fn: bsplineKernel,
  },
  mitchell: {
    id: "mitchell",
    name: "Mitchell",
    support: 2,
    variableSupport: false,
    interpolating: false,
    fn: mitchellKernel,
  },
};

export function getKernel(id: string): KernelMeta {
  return KERNELS[id] ?? KERNELS.photonic;
}

export function kernelSupport(id: string, a: number) {
  const k = getKernel(id);
  return k.variableSupport ? a : k.support;
}

export function kernelWeight(id: string, x: number, a = 3) {
  const k = getKernel(id);
  return k.variableSupport ? k.fn(x, a) : k.fn(x);
}
