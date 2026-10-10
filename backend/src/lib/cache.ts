export class TtlCache<V> {
  private store = new Map<string, { value: V; exp: number }>();
  constructor(private ttlMs: number, private maxEntries = 1000) {}

  async wrap(key: string, load: () => Promise<V>): Promise<V> {
    const hit = this.store.get(key);
    if (hit && hit.exp > Date.now()) return hit.value;
    const value = await load();
    if (this.ttlMs > 0) {
      this.store.set(key, { value, exp: Date.now() + this.ttlMs });
      if (this.store.size > this.maxEntries) {
        const oldest = this.store.keys().next().value;
        if (oldest !== undefined) this.store.delete(oldest);
      }
    }
    return value;
  }
}
