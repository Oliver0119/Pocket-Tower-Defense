/**
 * 全局类型定义（纯逻辑层，不依赖 Cocos）
 * 数据来源：docs/游戏设计方案.md 第 3 / 4 / 5 / 6 章
 */

export type EnemyType = 'normal' | 'fast' | 'armor' | 'flying' | 'boss';
export type TowerAttackType = 'single' | 'splash' | 'slow' | 'chain' | 'dot';

/** 二维坐标，单位为「格」 */
export interface GridPos {
  col: number;
  row: number;
}

/** 浮点坐标（用于插值计算） */
export interface Vec2 {
  x: number;
  y: number;
}

export interface EnemyConfig {
  id: string;
  name: string;
  type: EnemyType;
  /** HP 系数：实际 HP = 基础HP × 波次成长 × 关卡成长 × hpFactor */
  hpFactor: number;
  /** 移速（格/秒） */
  speed: number;
  /** 固定减伤 */
  armor: number;
  /** 击杀赏金 */
  bounty: number;
  /** 漏怪扣血 */
  leakDamage: number;
  ability: 'none' | 'ignoreSlow30' | 'flatArmor' | 'straightLine' | 'regen2pctPer10s';
}

export interface TowerLevelConfig {
  level: 1 | 2 | 3;
  upgradeCost: number;
  damage: number;
  range: number;
  attackSpeed: number;
  skin: string;
  splashRadius?: number;
  slowFactor?: number;
  slowDuration?: number;
  chainCount?: number;
  dotDps?: number;
  dotDuration?: number;
}

export interface TowerConfig {
  id: string;
  name: string;
  role: string;
  cost: number;
  attackType: TowerAttackType;
  levels: TowerLevelConfig[];
  splashRadius?: number;
  slowFactor?: number;
  slowDuration?: number;
  ignoreArmor?: boolean;
  chainDecay?: number;
  dotMaxStacks?: number;
}

export interface LevelConfig {
  id: number;
  chapter: number;
  name: string;
  towerSlots: number;
  initGold: number;
  allowedTowers: string[];
  mix: Record<string, number>;
  bossWaves: number[];
  doubleBossWaves?: number[];
  hpScale: number;
}

export interface WaveParams {
  waveCount: number;
  baseHp: number;
  hpWaveBase: number;
  hpLevelBase: number;
  spawnInterval: number;
  waveInterval: number;
  bossWave: number;
  bossWaveFromChapter: number;
  bossWaveExtra: number;
}

export interface EndlessParams {
  baseHp: number;
  hpWaveBase: number;
  spawnInterval: number;
  waveInterval: number;
  bossEveryWaves: number;
  extraBossEveryWaves: number;
  speedBonusEveryWaves: number;
  speedBonusStep: number;
  speedBonusMax: number;
  baseHealEveryWaves: number;
  baseHealAmount: number;
  passiveEveryWaves: number;
}

export interface LimitParams {
  maxAliveEnemies: number;
  maxBullets: number;
  baseHp: number;
  initGold: number;
  sellRefundRate: number;
  passiveChoices: number;
  maxPassivePicks: number;
}

export type PassiveStat =
  | 'attackSpeed' | 'critRate' | 'bounty' | 'range' | 'damage'
  | 'slow' | 'splash' | 'killHeal' | 'armorPierce' | 'instantGold'
  | 'cooldown' | 'upgradeCost';

export interface PassiveConfig {
  id: string;
  name: string;
  desc: string;
  effect: { stat: PassiveStat; mode: 'add' | 'mul'; value: number };
  maxStacks: number;
  weight: number;
}

export interface ActiveSkillConfig {
  id: string;
  name: string;
  desc: string;
  cooldown: number;
  unlockLevel: number;
  params: Record<string, number>;
}

export interface MapConfig {
  grid: { cols: number; rows: number; cellSize: number };
  waypoints: GridPos[];
  spawn: GridPos;
  base: GridPos;
  towerSlots: { id: number; col: number; row: number }[];
}

/** 玩家进度（存档与排行榜展示用），字段与 GDD 第 5.3 节一致 */
export interface PlayerProgress {
  openid: string;
  maxLevel: number;
  totalStars: number;
  unlockedTowers: string[];
  bestWave: number;
  bestScore: number;
  updatedAt: number;
}

/** 战斗结束后统计 */
export interface BattleStats {
  levelId: number;
  result: 'win' | 'lose';
  waveReached: number;
  /** 已结算的波次数 */
  waveCleared: number;
  totalWaves: number;
  kills: number;
  leaked: number;
  baseHpLeft: number;
  goldEarned: number;
  goldLeft: number;
  durationSec: number;
  towersBuilt: number;
  upgrades: number;
}
