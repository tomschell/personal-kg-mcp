export class LruCache<K, V> {
  private readonly map = new Map<K, V>();
  constructor(private readonly maxSize: number) {}
  get(key: K): V | undefined {
    if (!this.map.has(key)) return undefined;
    const value = this.map.get(key)!;
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }
  set(key: K, value: V): void {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, value);
    if (this.map.size > this.maxSize) {
      const firstKey = this.map.keys().next().value as K;
      this.map.delete(firstKey);
    }
  }
  delete(key: K): void {
    this.map.delete(key);
  }
  clear(): void {
    this.map.clear();
  }
}


