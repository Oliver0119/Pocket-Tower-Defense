/**
 * 被动技能加成聚合器
 * 数值来源：docs/游戏设计方案.md 第 4.2 节（12 条被动，同类叠加上限见 config/skills.json）
 */
import { PassiveConfig, PassiveStat } from '../core/types';

export class PassiveSet {
  /** passiveId -> 层数 */
  private stacks = new Map<string, number>();

  add(id: string, cfg: PassiveConfig): void {
    const cur = this.stacks.get(id) ?? 0;
    this.stacks.set(id, Math.min(cur + 1, cfg.maxStacks));
  }

  stacksOf(id: string): number {
    return this.stacks.get(id) ?? 0;
  }

  private sum(stat: PassiveStat, configs: PassiveConfig[], mode: 'add' | 'mul'): number {
    let total = 0;
    for (const c of configs) {
      if (c.effect.stat !== stat || c.effect.mode !== mode) continue;
      total += c.effect.value * this.stacksOf(c.id);
    }
    return total;
  }

  constructor(private configs: PassiveConfig[]) {}

  /** 攻速倍率：1 + 10% × 层数 */
  attackSpeedMul(): number { return 1 + this.sum('attackSpeed', this.configs, 'mul'); }
  /** 伤害倍率：1 + 8% × 层数 */
  damageMul(): number { return 1 + this.sum('damage', this.configs, 'mul'); }
  /** 射程倍率 */
  rangeMul(): number { return 1 + this.sum('range', this.configs, 'mul'); }
  /** 金币倍率 */
  bountyMul(): number { return 1 + this.sum('bounty', this.configs, 'mul'); }
  /** 暴击率：5% × 层数，上限 100% */
  critRate(): number { return Math.min(1, this.sum('critRate', this.configs, 'add')); }
  /** 减速效果加成（加法） */
  slowBonus(): number { return this.sum('slow', this.configs, 'add'); }
  /** 溅射范围倍率 */
  splashMul(): number { return 1 + this.sum('splash', this.configs, 'mul'); }
  /** 护甲穿透比例，上限 100% */
  armorPierce(): number { return Math.min(1, this.sum('armorPierce', this.configs, 'add')); }
  /** 主动技能冷却倍率 */
  cooldownMul(): number { return Math.max(0.4, 1 + this.sum('cooldown', this.configs, 'mul')); }
  /** 升级费用倍率 */
  upgradeCostMul(): number { return Math.max(0.5, 1 + this.sum('upgradeCost', this.configs, 'mul')); }
  /** 每多少击杀回 1 点基地生命；0 表示未点亮 */
  killsPerHeal(): number {
    const v = this.sum('killHeal', this.configs, 'add');
    return v > 0 ? v : 0;
  }

  snapshot(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [k, v] of this.stacks) out[k] = v;
    return out;
  }
}
