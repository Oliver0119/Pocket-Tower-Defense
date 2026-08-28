/**
 * 可复现随机数（mulberry32）
 * 战斗与三选一抽取均走此 RNG，保证同一 seed 下模拟结果可复现，便于数值回归测试。
 */
export class Rng {
  private state: number;

  constructor(seed = 20260829) {
    this.state = seed >>> 0;
  }

  /** [0, 1) */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** [0, max) 整数 */
  int(maxExclusive: number): number {
    return Math.floor(this.next() * maxExclusive);
  }

  pick<T>(arr: T[]): T {
    return arr[this.int(arr.length)];
  }

  /** 按权重取若干个不重复元素 */
  pickWeighted<T>(arr: T[], count: number, weightOf: (item: T) => number): T[] {
    const pool = arr.slice();
    const out: T[] = [];
    while (out.length < count && pool.length > 0) {
      const total = pool.reduce((s, it) => s + weightOf(it), 0);
      let r = this.next() * total;
      let idx = 0;
      for (let i = 0; i < pool.length; i++) {
        r -= weightOf(pool[i]);
        if (r <= 0) { idx = i; break; }
      }
      out.push(pool.splice(idx, 1)[0]);
    }
    return out;
  }
}
