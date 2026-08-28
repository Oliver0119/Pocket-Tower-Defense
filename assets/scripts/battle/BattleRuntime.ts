/**
 * 战斗运行时（纯逻辑、无渲染依赖）——整个 MVP 的核心
 * 设计依据：docs/游戏设计方案.md 第 1 / 3 / 6 / 7 章，docs/SDD.md 第 4 章
 *
 * 该层不 import 任何 Cocos 模块，可在 Node 下无头运行（见 tools/simulate.ts），
 * 便于数值回归测试；表现层通过 EventCenter 订阅事件驱动。
 */
import { ConfigLoader } from '../core/ConfigLoader';
import { EventCenter, GameEvent } from '../core/EventCenter';
import { Rng } from '../core/Rng';
import { LevelConfig, PassiveConfig, Vec2 } from '../core/types';
import { EconomyService } from './EconomyService';
import { Enemy, Tower } from './entities';
import { Path } from './Path';
import { SkillSystem } from './SkillSystem';
import { WaveController, SpawnItem } from './WaveController';

export type BattleState = 'preparing' | 'fighting' | 'waveCleared' | 'ended';

export interface BuildResult {
  ok: boolean;
  reason?: string;
}

export class BattleRuntime {
  readonly mode: 'main' | 'endless';
  readonly level: LevelConfig | null;
  readonly economy: EconomyService;
  readonly skills: SkillSystem;
  readonly waveCtrl: WaveController;

  state: BattleState = 'preparing';
  /** 已开始的最新波次编号 */
  wave = 0;
  /** 已结算（清空并发放奖励）的波次编号 */
  clearedWaves = 0;
  time = 0;
  baseHp: number;
  readonly baseHpMax: number;

  enemies: Enemy[] = [];
  towers = new Map<number, Tower>();

  kills = 0;
  leaked = 0;
  upgrades = 0;
  prepareTimer: number;
  /** 本波清空后的间隔倒计时（仅在顺序推进模式下使用） */
  nextWaveTimer = 0;
  /**
   * 是否允许「未清空就自动开下一波」。
   * 默认 false（顺序推进）：上一波全部清空或漏完才进下一波，避免怪物堆积。
   * 玩家仍可通过 callNextWaveEarly() 主动提前召唤（GDD 1.4，奖励金币）。
   */
  autoAdvance = false;
  pendingOffers: PassiveConfig[] | null = null;

  private rng: Rng;
  private spawnQueue: SpawnItem[] = [];
  private spawnTimer = 0;
  private waveTotalHp = 0;
  private killStreakForHeal = 0;
  private groundPath: Path;
  private airPath: Path;
  private slotPos = new Map<number, Vec2>();
  private autoStart: boolean;
  private unlockedLevelId: number;
  /** 供 UI 订阅的结算结果 */
  result: 'win' | 'lose' | null = null;

  constructor(opts: { mode?: 'main' | 'endless'; levelId?: number; seed?: number; autoStart?: boolean; prepareTime?: number } = {}) {
    this.mode = opts.mode ?? 'main';
    this.level = this.mode === 'main' ? ConfigLoader.level(opts.levelId ?? 1) : null;
    this.rng = new Rng(opts.seed ?? 20260829);
    this.autoStart = opts.autoStart ?? false;

    const map = ConfigLoader.map();
    const limits = ConfigLoader.limitParams();
    this.groundPath = new Path(map.waypoints);
    this.airPath = Path.straight(map.spawn, map.base);
    map.towerSlots.forEach((s) => this.slotPos.set(s.id, { x: s.col, y: s.row }));

    const slotCount = this.level ? this.level.towerSlots : map.towerSlots.length;
    this.unlockedSlots = slotCount;
    this.unlockedTowers = this.level ? this.level.allowedTowers : ConfigLoader.allTowers().map((t) => t.id);
    this.unlockedLevelId = this.level ? this.level.id : 30;

    this.baseHpMax = limits.baseHp;
    this.baseHp = limits.baseHp;
    this.economy = new EconomyService(this.level ? this.level.initGold : limits.initGold);
    this.skills = new SkillSystem(this.rng);
    this.waveCtrl = new WaveController(this.level, this.mode);
    this.prepareTimer = opts.prepareTime ?? (opts.autoStart ? 0 : 20);

    EventCenter.emit(GameEvent.GoldChanged, this.economy.gold);
    EventCenter.emit(GameEvent.BaseHpChanged, this.baseHp);
  }

  /** 当前关卡开放的塔位数量（未开放塔位不可建造） */
  readonly unlockedSlots: number;
  /** 当前关卡可使用（或已解锁）的塔种 */
  readonly unlockedTowers: string[];

  // ---------------- 建造 / 升级 / 拆除 ----------------

  buildTower(slotId: number, towerId: string): BuildResult {
    if (this.state === 'ended') return { ok: false, reason: '战斗已结束' };
    if (slotId > this.unlockedSlots) return { ok: false, reason: '塔位未解锁' };
    if (this.towers.has(slotId)) return { ok: false, reason: '该塔位已有建筑' };
    if (!this.unlockedTowers.includes(towerId)) return { ok: false, reason: '该塔种在本关未解锁' };
    const cfg = ConfigLoader.tower(towerId);
    if (!this.economy.canAfford(cfg.cost)) return { ok: false, reason: '金币不足' };
    this.economy.spend(cfg.cost);
    const pos = this.slotPos.get(slotId)!;
    this.towers.set(slotId, new Tower(slotId, cfg, pos));
    EventCenter.emit(GameEvent.TowerBuilt, { slotId, towerId });
    EventCenter.emit(GameEvent.GoldChanged, this.economy.gold);
    return { ok: true };
  }

  upgradeTower(slotId: number): BuildResult {
    const tower = this.towers.get(slotId);
    if (!tower) return { ok: false, reason: '塔位为空' };
    if (tower.level >= 3) return { ok: false, reason: '已达最高等级' };
    const cost = this.economy.upgradeCostOf(tower, this.skills.passives.upgradeCostMul());
    if (!this.economy.canAfford(cost)) return { ok: false, reason: '金币不足' };
    this.economy.spend(cost);
    tower.upgrade();
    this.upgrades++;
    EventCenter.emit(GameEvent.TowerUpgraded, { slotId, level: tower.level });
    EventCenter.emit(GameEvent.GoldChanged, this.economy.gold);
    return { ok: true };
  }

  sellTower(slotId: number): BuildResult {
    const tower = this.towers.get(slotId);
    if (!tower) return { ok: false, reason: '塔位为空' };
    const refund = this.economy.refundOf(tower, ConfigLoader.limitParams().sellRefundRate);
    this.economy.earn(refund);
    this.towers.delete(slotId);
    EventCenter.emit(GameEvent.TowerSold, { slotId, refund });
    EventCenter.emit(GameEvent.GoldChanged, this.economy.gold);
    return { ok: true };
  }

  // ---------------- 波次流程 ----------------

  startNextWave(): void {
    if (this.state === 'ended') return;
    const total = this.waveCtrl.totalWaves();
    if (this.wave >= total) return;
    this.wave++;
    const queue = this.waveCtrl.buildQueue(this.wave, this.rng);
    this.waveTotalHp = queue.reduce((s, i) => s + i.hp, 0);
    this.spawnQueue = queue;
    this.spawnTimer = 0;
    this.nextWaveTimer = this.mode === 'endless'
      ? ConfigLoader.endlessParams().waveInterval
      : ConfigLoader.waveParams().waveInterval;
    this.state = 'fighting';
    EventCenter.emit(GameEvent.WaveStarted, { wave: this.wave, count: queue.length });
  }

  /** 玩家主动提前召唤下一波（GDD 1.4：跳过波间等待，奖励金币） */
  callNextWaveEarly(): boolean {
    if (this.state !== 'fighting' || this.spawnQueue.length > 0) return false;
    this.nextWaveTimer = 0;
    const bonus = 10 + this.wave * 2;
    this.economy.earn(bonus);
    EventCenter.emit(GameEvent.GoldChanged, this.economy.gold);
    this.startNextWave();
    return true;
  }

  /** 波次通过后选择被动；第 10 波不清空 pendingOffers 的调用由外部控制 */
  pickPassive(id: string): boolean {
    if (!this.pendingOffers) return false;
    const cfg = this.skills.pickPassive(id);
    if (!cfg) return false;
    if (cfg.effect.stat === 'instantGold') {
      this.economy.earn(cfg.effect.value);
      EventCenter.emit(GameEvent.GoldChanged, this.economy.gold);
    }
    this.pendingOffers = null;
    EventCenter.emit(GameEvent.PassivePicked, { id });
    return true;
  }

  castSkill(skillId: string): boolean {
    const ok = this.skills.cast(skillId, this.unlockedLevelId);
    if (!ok) return false;
    const cfg = ConfigLoader.activeList().find((s) => s.id === skillId)!;
    if (skillId === 'airstrike') {
      const dmg = this.waveTotalHp * cfg.params.damageRatioOfWaveHp;
      for (const e of this.enemies) this.damageEnemy(e, dmg, true);
    } else if (skillId === 'timeFreeze') {
      for (const e of this.enemies) {
        e.freezeFactor = cfg.params.slowFactor;
        e.freezeTimer = cfg.params.duration;
      }
    }
    EventCenter.emit(GameEvent.SkillCasted, { skillId });
    return true;
  }

  // ---------------- 主循环 ----------------

  update(dt: number): void {
    if (this.state === 'ended') return;
    this.time += dt;
    this.skills.tick(dt);

    if (this.state === 'preparing') {
      this.prepareTimer -= dt;
      if (this.prepareTimer <= 0) this.startNextWave();
      return;
    }

    if (this.state === 'waveCleared') {
      // 无头模式：自动选第一条被动；到点后开下一波
      if (this.autoStart && this.pendingOffers && this.pendingOffers.length > 0) {
        this.pickPassive(this.pendingOffers[0].id);
      }
      this.nextWaveTimer -= dt;
      if (this.nextWaveTimer <= 0) this.startNextWave();
      return;
    }

    // fighting
    this.spawnTick(dt);
    if (this.autoAdvance && this.spawnQueue.length === 0) {
      // 可选：出怪结束即计时开下一波（会产生波次重叠，默认关闭）
      this.nextWaveTimer -= dt;
      if (this.nextWaveTimer <= 0) this.startNextWave();
    }
    this.updateEnemies(dt);
    this.updateTowers(dt);
    this.checkWaveEnd();
  }

  private spawnTick(dt: number): void {
    if (this.spawnQueue.length === 0) return;
    this.spawnTimer -= dt;
    if (this.spawnTimer > 0) return;
    const limits = ConfigLoader.limitParams();
    if (this.enemies.length >= limits.maxAliveEnemies) {
      this.spawnTimer = 0.2; // 同屏上限，延迟生成
      return;
    }
    const item = this.spawnQueue.shift()!;
    const cfg = ConfigLoader.enemy(item.enemyId);
    const path = cfg.type === 'flying' ? this.airPath : this.groundPath;
    const e = new Enemy(cfg, path, item.speedBonus);
    e.initHp(item.hp);
    this.enemies.push(e);
    this.spawnTimer = this.mode === 'endless'
      ? ConfigLoader.endlessParams().spawnInterval
      : ConfigLoader.waveParams().spawnInterval;
    EventCenter.emit(GameEvent.EnemySpawned, { uid: e.uid, type: cfg.type });
  }

  private updateEnemies(dt: number): void {
    const survivors: Enemy[] = [];
    for (const e of this.enemies) {
      // DOT
      const dotDmg = e.tickDots(dt);
      if (dotDmg > 0) this.damageEnemy(e, dotDmg, true);
      if (!e.alive) continue;

      e.tickRegen(dt);
      e.advance(dt);

      if (e.reachedBase) {
        this.handleLeak(e);
        continue;
      }
      survivors.push(e);
    }
    this.enemies = survivors;
  }

  private handleLeak(e: Enemy): void {
    this.leaked++;
    this.baseHp = Math.max(0, this.baseHp - e.cfg.leakDamage);
    e.alive = false;
    EventCenter.emit(GameEvent.EnemyLeaked, { uid: e.uid, damage: e.cfg.leakDamage });
    EventCenter.emit(GameEvent.BaseHpChanged, this.baseHp);
    if (this.baseHp <= 0) this.endBattle('lose');
  }

  private updateTowers(dt: number): void {
    const p = this.skills.passives;
    for (const tower of this.towers.values()) {
      tower.cooldown -= dt;
      if (tower.cooldown > 0) continue;
      const stat = tower.stat;
      const range = stat.range * p.rangeMul();
      const target = this.findTarget(tower.pos, range);
      if (!target) continue;

      const attackSpeed = stat.attackSpeed * p.attackSpeedMul();
      tower.cooldown = 1 / attackSpeed;

      let raw = stat.damage * p.damageMul();
      if (this.rng.next() < p.critRate()) raw *= 2; // 暴击 2 倍

      switch (tower.cfg.attackType) {
        case 'single':
          this.damageEnemy(target, raw, tower.cfg.ignoreArmor === true, p.armorPierce());
          break;
        case 'splash': {
          const radius = (stat.splashRadius ?? tower.cfg.splashRadius ?? 1.2) * p.splashMul();
          for (const e of this.enemies) {
            if (this.dist(e.pos, target.pos) <= radius) {
              this.damageEnemy(e, raw, tower.cfg.ignoreArmor === true, p.armorPierce());
            }
          }
          break;
        }
        case 'slow': {
          const factor = Math.min(0.9, (stat.slowFactor ?? 0.4) + p.slowBonus());
          target.applySlow(factor, stat.slowDuration ?? 2);
          this.damageEnemy(target, raw, false, p.armorPierce());
          break;
        }
        case 'chain': {
          const decay = tower.cfg.chainDecay ?? 0.6;
          const chainCount = stat.chainCount ?? 3;
          const chainTargets = this.findChainTargets(target, chainCount);
          chainTargets.forEach((e, i) => {
            this.damageEnemy(e, raw * Math.pow(decay, i), true); // 电塔无视护甲
          });
          break;
        }
        case 'dot': {
          target.applyDot(tower.slotId, stat.dotDps ?? 6, stat.dotDuration ?? 3, tower.cfg.dotMaxStacks ?? 3);
          this.damageEnemy(target, raw, false, p.armorPierce());
          break;
        }
      }
      EventCenter.emit(GameEvent.TowerFired, { slotId: tower.slotId, type: tower.cfg.attackType });
    }
  }

  /** 索敌：射程内行进最远（最接近基地）的敌人 */
  private findTarget(pos: Vec2, range: number): Enemy | null {
    let best: Enemy | null = null;
    let bestDist = -1;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      if (this.dist(e.pos, pos) > range) continue;
      if (e.dist > bestDist) { bestDist = e.dist; best = e; }
    }
    return best;
  }

  /** 连锁目标：以首个目标为中心，射程 2 格内最近的若干敌人 */
  private findChainTargets(first: Enemy, count: number): Enemy[] {
    const out: Enemy[] = [first];
    const pool = this.enemies
      .filter((e) => e.alive && e !== first)
      .map((e) => ({ e, d: this.dist(e.pos, first.pos) }))
      .filter((x) => x.d <= 2)
      .sort((a, b) => a.d - b.d);
    for (let i = 0; i < count - 1 && i < pool.length; i++) out.push(pool[i].e);
    return out;
  }

  private damageEnemy(e: Enemy, raw: number, ignoreArmor: boolean, armorPierce = 0): void {
    if (!e.alive) return;
    let dmg = raw;
    if (!ignoreArmor) {
      const armor = e.cfg.armor * (1 - armorPierce);
      dmg = Math.max(1, raw - armor); // 保底 1 点
    }
    e.hp -= dmg;
    EventCenter.emit(GameEvent.EnemyDamaged, { uid: e.uid, dmg });
    if (e.hp <= 0) this.killEnemy(e);
  }

  private killEnemy(e: Enemy): void {
    e.alive = false;
    this.kills++;
    const p = this.skills.passives;
    let bounty = e.cfg.bounty * p.bountyMul();
    if (this.skills.goldRushTimer > 0) bounty *= 2; // 金币狂潮
    this.economy.earn(Math.round(bounty));
    EventCenter.emit(GameEvent.EnemyKilled, { uid: e.uid, type: e.cfg.type });
    EventCenter.emit(GameEvent.GoldChanged, this.economy.gold);

    // 生命汲取：每 N 次击杀回 1 点基地生命
    const per = p.killsPerHeal();
    if (per > 0) {
      this.killStreakForHeal++;
      if (this.killStreakForHeal >= per) {
        this.killStreakForHeal = 0;
        this.baseHp = Math.min(this.baseHpMax, this.baseHp + 1);
        EventCenter.emit(GameEvent.BaseHpChanged, this.baseHp);
      }
    }
  }

  private checkWaveEnd(): void {
    // 场上仍有敌人或本波尚未出完，均不结算
    if (this.spawnQueue.length > 0 || this.enemies.length > 0) return;
    if (this.clearedWaves >= this.wave) return;

    // 结算最早一个尚未结算的波次（波次可重叠，故按序号依次结算）
    this.clearedWaves++;
    const reward = this.waveCtrl.waveReward(this.clearedWaves);
    this.economy.earn(reward);
    EventCenter.emit(GameEvent.WaveCleared, { wave: this.clearedWaves, reward });
    EventCenter.emit(GameEvent.GoldChanged, this.economy.gold);

    const total = this.waveCtrl.totalWaves();
    if (this.clearedWaves >= total) {
      this.economy.earn(this.waveCtrl.clearReward());
      this.endBattle('win');
      return;
    }
    // 提供三选一（未达本局上限时）
    const limits = ConfigLoader.limitParams();
    const used = Object.values(this.skills.passives.snapshot()).reduce((a, b) => a + b, 0);
    this.pendingOffers = used >= limits.maxPassivePicks ? null : this.skills.offerPassives(limits.passiveChoices);
    this.state = 'waveCleared';
    this.nextWaveTimer = this.mode === 'endless'
      ? ConfigLoader.endlessParams().waveInterval
      : ConfigLoader.waveParams().waveInterval;
    EventCenter.emit(GameEvent.PassiveOffered, this.pendingOffers);
  }

  private endBattle(result: 'win' | 'lose'): void {
    this.result = result;
    this.state = 'ended';
    EventCenter.emit(GameEvent.BattleEnded, { result, stats: this.stats() });
  }

  private dist(a: Vec2, b: Vec2): number {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  stats() {
    return {
      levelId: this.level ? this.level.id : 0,
      result: this.result ?? ('lose' as const),
      waveReached: this.wave,
      totalWaves: this.mode === 'endless' ? this.wave : ConfigLoader.waveParams().waveCount,
      waveCleared: this.clearedWaves,
      kills: this.kills,
      leaked: this.leaked,
      baseHpLeft: this.baseHp,
      goldEarned: this.economy.goldEarned,
      goldLeft: this.economy.gold,
      durationSec: Math.round(this.time),
      towersBuilt: this.towers.size,
      upgrades: this.upgrades,
    };
  }
}
