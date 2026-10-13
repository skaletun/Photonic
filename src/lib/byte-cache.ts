/** LRU with a byte budget; a single oversized value is never retained. */
export class ByteCache<T extends { data: { byteLength: number } }> {
  private items = new Map<string, T>();
  private bytes = 0;
  constructor(readonly budget = 48 * 1024 * 1024) {}
  get(key: string) {
    const item = this.items.get(key);
    if (item) { this.items.delete(key); this.items.set(key, item); }
    return item;
  }
  set(key: string, item: T) {
    const previous = this.items.get(key);
    if (previous) { this.bytes -= previous.data.byteLength; this.items.delete(key); }
    if (item.data.byteLength > this.budget) return;
    while (this.bytes + item.data.byteLength > this.budget) {
      const oldest = this.items.keys().next().value;
      if (oldest === undefined) break;
      this.bytes -= this.items.get(oldest)!.data.byteLength;
      this.items.delete(oldest);
    }
    this.items.set(key, item); this.bytes += item.data.byteLength;
  }
  clear() { this.items.clear(); this.bytes = 0; }
  get byteLength() { return this.bytes; }
}
