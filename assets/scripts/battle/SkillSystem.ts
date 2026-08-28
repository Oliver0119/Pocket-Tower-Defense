/**
 * 技能系统：3 个主动技能（冷却制）+ 被动三选一抽取
 * 数值来源：docs/游戏设计方案.md 第 4.1 / 4.2 节
 */
import { ConfigLoader } from '../core/ConfigLoader';
import { Rng } from '../core/Rng';
import { ActiveSkillConfig, PassiveConfig } from '../core/types';
import { PassiveSet } from './PassiveSet';

export class SkillSystem {
  readonly passives: PassiveSet;
  private cooldowns = new Map<string, number>();
  /** 金币狂潮剩余时间 */
  goldRushTimer = 0;

  constructor(private rng: Rng) {
    this.passives = new PassiveSet(ConfigLoader.passiveList());
    for (const s of ConfigLoader.activeList()) this.cooldowns.set(s.id, 0);
  }

  /** 已解锁的主动技能（按 unlockLevel <= 当前关卡） */
  unlockedSkills(maxLevelId: number): ActiveSkillConfig[] {
    return ConfigLoader.activeList().filter((s) => s.unlockLevel <= maxLevelId);
  }

  isReady(skillId: string): boolean {
    return (this.cooldowns.get(skillId) ?? 0) <= 0;
  }

  remainingCd(skillId: string): number {
    return Math.max(0, this.cooldowns.get(skillId) ?? 0);
  }

  /** 释放主动技能；返回是否成功（未解锁或冷却中不成功） */
  cast(skillId: string, maxLevelId: number): boolean {
    const cfg = ConfigLoader.activeList().find((s) => s.id === skillId);
    if (!cfg || cfg.unlockLevel > maxLevelId) return false;
    if (!this.isReady(skillId)) return false;
    this.cooldowns.set(skillId, cfg.cooldown * this.passives.cooldownMul());
    if (skillId === 'goldRush') this.goldRushTimer = cfg.params.duration;
    return true;
  }

  tick(dt: number): void {
    for (const [k, v] of this.cooldowns) {
      if (v > 0) this.cooldowns.set(k, Math.max(0, v - dt));
    }
    if (this.goldRushTimer > 0) this.goldRushTimer = Math.max(0, this.goldRushTimer - dt);
  }

  /** 抽取三选一（权重随机，已叠满的不再出现） */
  offerPassives(count: number): PassiveConfig[] {
    const pool = ConfigLoader.passiveList().filter(
      (p) => this.passives.stacksOf(p.id) < p.maxStacks,
    );
    return this.rng.pickWeighted(pool, count, (p) => p.weight);
  }

  pickPassive(id: string): PassiveConfig | null {
    const cfg = ConfigLoader.passiveList().find((p) => p.id === id);
    if (!cfg) return null;
    this.passives.add(id, cfg);
    return cfg;
  }

  /** 富矿开局：立即获得金币（在 pickPassive 后由外部读取） */
  instantGoldOf(cfg: PassiveConfig): number {
    return cfg.effect.stat === 'instantGold' ? cfg.effect.value * 1 : 0;
  }
}
