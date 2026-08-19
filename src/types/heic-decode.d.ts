declare module "heic-decode" {
  function decode(input: { buffer: ArrayBuffer | Uint8Array }): Promise<{
    width: number;
    height: number;
    data: Uint8ClampedArray;
  }>;
  export default decode;
}
