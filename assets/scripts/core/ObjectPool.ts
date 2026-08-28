/**
 * 对象池：敌人/子弹/特效必须复用，禁止运行时频繁创建节点（SDD 设计约定）
 */
export class ObjectPool<T> {
  private free: T[] = [];
  private active = new Set<T>();
  private created = 0;

  constructor(
    private factory: () => T,
    private reset: (item: T) => void,
    private readonly maxSize = 256,
  ) {}

  acquire(): T | null {
    if (this.active.size >= this.maxSize) return null;
    let item = this.free.pop();
    if (!item) {
      item = this.factory();
      this.created++;
    }
    this.reset(item);
    this.active.add(item);
    return item;
  }

  release(item: T): void {
    if (!this.active.delete(item)) return;
    this.free.push(item);
  }

  releaseAll(): void {
    for (const item of this.active) this.free.push(item);
    this.active.clear();
  }

  get activeCount(): number {
    return this.active.size;
  }

  /** 统计用：累计创建过的对象数（用于验证「无运行时峰值创建」） */
  get createdCount(): number {
    return this.created;
  }
}
