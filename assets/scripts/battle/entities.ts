/**
 * 战斗实体：敌人与塔（纯数据 + 行为，不含任何渲染依赖）
 */
import { EnemyConfig, TowerConfig, Vec2 } from '../core/types';
import { Path } from './Path';

/** 持续伤害（DOT）堆叠项 */
export interface DotStack {
  /** 来源塔位，用于同塔刷新不叠层 */
  sourceId: number;
  dps: number;
  remain: number;
}

export class Enemy {
  static seq = 0;
  readonly uid: number;
  hp: number;
  maxHp: number;
  dist = 0;
  pos: Vec2;
  alive = true;
  reachedBase = false;

  /** 减速剩余时间（秒）与当前减速强度 */
  slowTimer = 0;
  slowFactor = 0;
  /** 全局冻结（主动技能）剩余时间 */
  freezeTimer = 0;
  freezeFactor = 0;

  dots: DotStack[] = [];
  regenTimer = 0;

  constructor(
    public cfg: EnemyConfig,
    public path: Path,
    /** 额外移速加成（无尽模式） */
    public speedBonus = 0,
  ) {
    this.uid = ++Enemy.seq;
    this.maxHp = cfg.hpFactor; // 占位，正式 HP 由外部按公式设置
    this.hp = this.maxHp;
    this.pos = path.positionAt(0);
  }

  /** 按波次公式设置实际血量（构造时的 maxHp 仅占位） */
  initHp(hp: number): void {
    this.maxHp = hp;
    this.hp = hp;
  }

  get isFlying(): boolean {
    return this.cfg.type === 'flying';
  }

  /** 当前实际移速（格/秒） */
  currentSpeed(): number {
    let s = this.cfg.speed * (1 + this.speedBonus);
    if (this.slowTimer > 0) {
      let slow = this.slowFactor;
      if (this.cfg.ability === 'ignoreSlow30') slow *= 0.7; // 快速怪无视 30% 减速
      s *= 1 - slow;
    }
    if (this.freezeTimer > 0) s *= 1 - this.freezeFactor;
    return Math.max(0.1, s);
  }

  advance(dt: number): void {
    this.dist += this.currentSpeed() * dt;
    this.pos = this.path.positionAt(this.dist);
    if (this.dist >= this.path.total) {
      this.reachedBase = true;
    }
    if (this.slowTimer > 0) this.slowTimer -= dt;
    if (this.freezeTimer > 0) this.freezeTimer -= dt;
  }

  /** BOSS：每 10 秒回复 2% 最大生命 */
  tickRegen(dt: number): number {
    if (this.cfg.ability !== 'regen2pctPer10s') return 0;
    this.regenTimer += dt;
    if (this.regenTimer < 10) return 0;
    this.regenTimer -= 10;
    const heal = this.maxHp * 0.02;
    const before = this.hp;
    this.hp = Math.min(this.maxHp, this.hp + heal);
    return this.hp - before;
  }

  tickDots(dt: number): number {
    let total = 0;
    for (const dot of this.dots) {
      total += dot.dps * dt;
      dot.remain -= dt;
    }
    this.dots = this.dots.filter((d) => d.remain > 0);
    return total;
  }

  applyDot(sourceId: number, dps: number, duration: number, maxStacks: number): void {
    const exist = this.dots.find((d) => d.sourceId === sourceId);
    if (exist) {
      exist.remain = duration; // 同塔刷新时长，不叠层
      exist.dps = Math.max(exist.dps, dps);
      return;
    }
    if (this.dots.length >= maxStacks) {
      // 达到上限则替换剩余时间最短的一层
      this.dots.sort((a, b) => a.remain - b.remain);
      this.dots[0] = { sourceId, dps, remain: duration };
      return;
    }
    this.dots.push({ sourceId, dps, remain: duration });
  }

  applySlow(factor: number, duration: number): void {
    if (factor >= this.slowFactor) this.slowFactor = factor;
    this.slowTimer = Math.max(this.slowTimer, duration);
  }
}

export class Tower {
  readonly slotId: number;
  readonly cfg: TowerConfig;
  level: 1 | 2 | 3 = 1;
  cooldown = 0;
  pos: Vec2;
  totalInvest: number;

  constructor(slotId: number, cfg: TowerConfig, pos: Vec2) {
    this.slotId = slotId;
    this.cfg = cfg;
    this.pos = pos;
    this.totalInvest = cfg.cost;
  }

  get stat() {
    return this.cfg.levels[this.level - 1];
  }

  get nextUpgradeCost(): number | null {
    if (this.level >= 3) return null;
    return this.cfg.levels[this.level].upgradeCost; // levels[level] 即下一级
  }

  upgrade(): void {
    if (this.level >= 3) return;
    this.totalInvest += this.cfg.levels[this.level].upgradeCost;
    this.level = (this.level + 1) as 1 | 2 | 3;
  }
}
