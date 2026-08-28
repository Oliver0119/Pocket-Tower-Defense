/**
 * 游戏流程管理：关卡解锁、进度存档、战斗生命周期
 * 纯逻辑层，不依赖 Cocos；UI 层通过调用本类推进流程
 */
import { ConfigLoader } from './ConfigLoader';
import { EventCenter, GameEvent } from './EventCenter';
import { BattleRuntime } from '../battle/BattleRuntime';
import { BattleStats, PlayerProgress } from './types';
import { SaveManager } from '../platform/SaveManager';

export class GameManager {
  private static instance: GameManager | null = null;
  private runtime: BattleRuntime | null = null;
  private progress: PlayerProgress;

  private constructor() {
    this.progress = SaveManager.load() ?? {
      openid: '',
      maxLevel: 1,
      totalStars: 0,
      unlockedTowers: ['arrow', 'frost'],
      bestWave: 0,
      bestScore: 0,
      updatedAt: Date.now(),
    };
  }

  static getInstance(): GameManager {
    if (!GameManager.instance) GameManager.instance = new GameManager();
    return GameManager.instance;
  }

  getProgress(): PlayerProgress {
    return this.progress;
  }

  isLevelUnlocked(levelId: number): boolean {
    return levelId <= this.progress.maxLevel;
  }

  /** 开始一场主线关卡 */
  startLevel(levelId: number, seed?: number): BattleRuntime {
    if (!this.isLevelUnlocked(levelId)) throw new Error(`关卡未解锁：${levelId}`);
    this.runtime = new BattleRuntime({ mode: 'main', levelId, seed, autoStart: false });
    return this.runtime;
  }

  /** 开始无尽模式 */
  startEndless(seed?: number): BattleRuntime {
    this.runtime = new BattleRuntime({ mode: 'endless', seed, autoStart: false });
    return this.runtime;
  }

  get current(): BattleRuntime | null {
    return this.runtime;
  }

  /** 战斗结束后调用：结算进度并存档 */
  finishBattle(): BattleStats | null {
    if (!this.runtime) return null;
    const stats = this.runtime.stats();
    if (stats.result === 'win' && this.runtime.mode === 'main') {
      const next = stats.levelId + 1;
      if (next <= ConfigLoader.allLevels().length && next > this.progress.maxLevel) {
        this.progress.maxLevel = next;
      }
      this.progress.totalStars += 1;
    }
    this.progress.updatedAt = Date.now();
    SaveManager.save(this.progress);
    EventCenter.emit(GameEvent.BattleEnded, stats);
    this.runtime = null;
    return stats;
  }

  /** 更新无尽模式最好成绩（本地；联网上报见 CloudService） */
  updateEndlessRecord(wave: number, score: number): void {
    if (wave > this.progress.bestWave) this.progress.bestWave = wave;
    if (score > this.progress.bestScore) this.progress.bestScore = score;
    SaveManager.save(this.progress);
  }
}
