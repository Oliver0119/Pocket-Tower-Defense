/**
 * 波次生成与出怪队列
 * 公式来源：docs/游戏设计方案.md 第 5.3 / 7.1 节
 *   主线：N(w) = 6 + floor(w × 1.2)，HP(w,n) = 60 × 1.15^(w-1) × 1.12^(n-1) × hpFactor × levelHpScale
 *   无尽：N(w) = 8 + floor(w × 1.5)，HP(w) = 60 × 1.16^(w-1) × hpFactor
 */
import { ConfigLoader } from '../core/ConfigLoader';
import { EnemyConfig, LevelConfig } from '../core/types';

export interface SpawnItem {
  enemyId: string;
  hp: number;
  speedBonus: number;
}

export class WaveController {
  constructor(
    private level: LevelConfig | null,
    private mode: 'main' | 'endless',
  ) {}

  /** 该波敌人总数 */
  countOf(wave: number): number {
    if (this.mode === 'endless') return 8 + Math.floor(wave * 1.5);
    return 6 + Math.floor(wave * 1.2);
  }

  /** 该波单体基础 HP（不含怪物自身 hpFactor 与关卡 hpScale） */
  baseHpOf(wave: number): number {
    if (this.mode === 'endless') {
      const p = ConfigLoader.endlessParams();
      return p.baseHp * Math.pow(p.hpWaveBase, wave - 1);
    }
    const p = ConfigLoader.waveParams();
    const n = this.level ? this.level.id : 1;
    return p.baseHp * Math.pow(p.hpWaveBase, wave - 1) * Math.pow(p.hpLevelBase, n - 1);
  }

  /** 该波是否包含 BOSS（主线第 4 章起额外在第 5 波出一只） */
  bossCountOf(wave: number): number {
    if (this.mode === 'endless') {
      const p = ConfigLoader.endlessParams();
      let c = wave % p.bossEveryWaves === 0 ? 1 : 0;
      if (wave % p.extraBossEveryWaves === 0) c += 1;
      return c;
    }
    const p = ConfigLoader.waveParams();
    if (!this.level) return 0;
    let c = 0;
    if (wave === p.bossWave) c = 1;
    if (this.level.chapter >= p.bossWaveFromChapter && wave === p.bossWaveExtra) c += 1;
    if (this.level.doubleBossWaves?.includes(wave)) c += 1;
    return c;
  }

  /** 生成一波的出怪队列（已按配比分配怪物类型） */
  buildQueue(wave: number, rng: { next(): number }): SpawnItem[] {
    const total = this.countOf(wave);
    const baseHp = this.baseHpOf(wave);
    const hpScale = this.level ? this.level.hpScale : 1;
    const mix = this.level ? this.level.mix : { normal: 0.5, fast: 0.2, armor: 0.15, flying: 0.15 };

    const items: SpawnItem[] = [];
    const entries = Object.entries(mix);
    let assigned = 0;
    entries.forEach(([id, ratio], idx) => {
      const count = idx === entries.length - 1 ? total - assigned : Math.round(total * ratio);
      for (let i = 0; i < count; i++) {
        const cfg = ConfigLoader.enemy(id);
        items.push({ enemyId: id, hp: baseHp * cfg.hpFactor * hpScale, speedBonus: this.speedBonusOf(wave) });
      }
      assigned += count;
    });

    const bossCount = this.bossCountOf(wave);
    for (let i = 0; i < bossCount; i++) {
      const cfg = ConfigLoader.enemy('boss');
      items.push({ enemyId: 'boss', hp: baseHp * cfg.hpFactor * hpScale, speedBonus: this.speedBonusOf(wave) });
    }

    // 洗牌，使出怪顺序随机化（rng 保证可复现）
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(rng.next() * (i + 1));
      [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
  }

  /** 无尽模式每 10 波移速 +5%（上限 +50%） */
  speedBonusOf(wave: number): number {
    if (this.mode !== 'endless') return 0;
    const p = ConfigLoader.endlessParams();
    const steps = Math.floor(wave / p.speedBonusEveryWaves);
    return Math.min(p.speedBonusMax, steps * p.speedBonusStep);
  }

  /** 波次结算奖励：15 + 5 × w */
  waveReward(wave: number): number {
    return 15 + 5 * wave;
  }

  /** 通关奖励：60 + 20 × n（无尽模式为 0） */
  clearReward(): number {
    if (this.mode === 'endless' || !this.level) return 0;
    return 60 + 20 * this.level.id;
  }

  totalWaves(): number {
    return this.mode === 'endless' ? Infinity : ConfigLoader.waveParams().waveCount;
  }

  /** 敌人配置查询（供外部计算赏金） */
  static enemyCfg(id: string): EnemyConfig {
    return ConfigLoader.enemy(id);
  }
}
