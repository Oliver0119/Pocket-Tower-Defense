/**
 * 共享的「自动玩家」策略（供 simulate / tune 复用）
 * 目标：模拟一个会沿路径布防、先铺开再升级、技能即放的普通休闲玩家，
 * 用来做数值回归，而不是追求最优解。
 */
import { ConfigLoader } from '../assets/scripts/core/ConfigLoader';
import { BattleRuntime } from '../assets/scripts/battle/BattleRuntime';
import { BattleStats, LevelConfig, TowerConfig } from '../assets/scripts/core/types';

let _samples: { x: number; y: number }[] | null = null;

/** 路径采样点：地面折线 + 飞行直线（各每 0.5 格一点） */
export function pathSamples(): { x: number; y: number }[] {
  if (_samples) return _samples;
  const map = ConfigLoader.map();
  const pts: { x: number; y: number }[] = [];
  const push = (a: { col: number; row: number }, b: { col: number; row: number }) => {
    const len = Math.hypot(b.col - a.col, b.row - a.row);
    const steps = Math.max(1, Math.round(len / 0.5));
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      pts.push({ x: a.col + (b.col - a.col) * t, y: a.row + (b.row - a.row) * t });
    }
  };
  for (let i = 1; i < map.waypoints.length; i++) push(map.waypoints[i - 1], map.waypoints[i]);
  push(map.spawn, map.base); // 飞行直线
  _samples = pts;
  return pts;
}

export function resetSamples(): void {
  _samples = null;
}

/** 贪心最大覆盖选点 */
export function pickBestSlot(rt: BattleRuntime, towerId: string): number | null {
  const range = ConfigLoader.tower(towerId).levels[0].range;
  const pts = pathSamples();
  const covered = new Array(pts.length).fill(false);
  for (const t of rt.towers.values()) {
    const r = t.stat.range;
    pts.forEach((p, i) => {
      if (Math.hypot(p.x - t.pos.x, p.y - t.pos.y) <= r) covered[i] = true;
    });
  }
  let bestSlot: number | null = null;
  let bestGain = 0;
  for (let slot = 1; slot <= rt.unlockedSlots; slot++) {
    if (rt.towers.has(slot)) continue;
    const sp = ConfigLoader.map().towerSlots.find((s) => s.id === slot);
    if (!sp) continue;
    let gain = 0;
    pts.forEach((p, i) => {
      if (covered[i]) return;
      if (Math.hypot(p.x - sp.col, p.y - sp.row) <= range) gain++;
    });
    if (gain > bestGain) { bestGain = gain; bestSlot = slot; }
  }
  return bestSlot;
}

/**
 * 按关卡敌人构成挑选最合适的塔（模拟一个「看得懂关卡提示」的玩家）：
 * 护甲多 → 优先电塔（无视护甲）；飞行多 → 优先远程；否则按性价比
 */
function bestTowerFor(level: LevelConfig, affordable: TowerConfig[]): TowerConfig {
  const mix = level.mix;
  const armorRatio = mix.armor ?? 0;
  const flyRatio = mix.flying ?? 0;
  let best = affordable[0];
  let bestScore = -1;
  for (const cfg of affordable) {
    const lv = cfg.levels[0];
    let score = (lv.damage * lv.attackSpeed) / cfg.cost;
    if (armorRatio >= 0.2 && cfg.attackType === 'chain') score *= 4;      // 破甲
    else if (armorRatio >= 0.2 && lv.damage >= 40) score *= 1.8;          // 高伤单体
    if (flyRatio >= 0.15 && lv.range >= 3.0) score *= 1.3;                // 覆盖飞行
    if (score > bestScore) { bestScore = score; best = cfg; }
  }
  return best;
}

export interface AutoPlayOptions {
  /** 布塔目标数量（铺够就转升级），默认 min(开放塔位, 8) */
  targetTowers?: number;
  /** 升级时保留的金币缓冲 */
  upgradeBuffer?: number;
  maxSeconds?: number;
}

/** 被动优先级：伤害 > 攻速 > 金币 > 暴击 > 射程 > 穿透 > 其他 */
const PASSIVE_PRIORITY = ['powerBless', 'swiftWind', 'goldenHand', 'deadlyStrike', 'eagleEye', 'armorPierce', 'richStart'];

function bestPassive(ids: string[]): string {
  for (const p of PASSIVE_PRIORITY) if (ids.includes(p)) return p;
  return ids[0];
}

export function autoPlay(level: LevelConfig, seed: number, opts: AutoPlayOptions = {}): BattleStats {
  const targetTowers = opts.targetTowers ?? Math.min(10, 10);
  const buffer = opts.upgradeBuffer ?? 120;
  const maxSeconds = opts.maxSeconds ?? 900;

  // autoStart=false：由本策略自行挑选被动，波次推进仍由 runtime 自动完成
  const rt = new BattleRuntime({ mode: 'main', levelId: level.id, seed, autoStart: false, prepareTime: 0 });
  const dt = 1 / 30;
  let t = 0;

  while (rt.state !== 'ended' && t < maxSeconds) {
    const cap = Math.min(targetTowers, rt.unlockedSlots);
    const affordable = level.allowedTowers
      .map((id) => ConfigLoader.tower(id))
      .filter((c) => c.cost <= rt.economy.gold)
      .sort((a, b) => a.cost - b.cost);

    if (rt.towers.size < cap && affordable.length > 0) {
      const pick = bestTowerFor(level, affordable);
      const slot = pickBestSlot(rt, pick.id);
      if (slot !== null) rt.buildTower(slot, pick.id);
    } else if (rt.towers.size < rt.unlockedSlots && rt.economy.gold > 400) {
      // 金币充裕时继续铺塔
      const pick = bestTowerFor(level, affordable);
      const slot = pickBestSlot(rt, pick.id);
      if (slot !== null && affordable.length > 0) rt.buildTower(slot, pick.id);
    } else {
      // 升级：选覆盖率最高且未满级的塔
      let best: number | null = null;
      let bestScore = -1;
      for (const tower of rt.towers.values()) {
        if (tower.level >= 3) continue;
        const cost = rt.economy.upgradeCostOf(tower, rt.skills.passives.upgradeCostMul());
        if (!rt.economy.canAfford(cost + buffer)) continue;
        const pts = pathSamples();
        let cover = 0;
        for (const p of pts) if (Math.hypot(p.x - tower.pos.x, p.y - tower.pos.y) <= tower.stat.range) cover++;
        const score = cover / (tower.level * tower.level);
        if (score > bestScore) { bestScore = score; best = tower.slotId; }
      }
      if (best !== null) rt.upgradeTower(best);
    }

    // 被动三选一：按优先级选择（普通玩家会选直观收益高的）
    if (rt.pendingOffers && rt.pendingOffers.length > 0) {
      rt.pickPassive(bestPassive(rt.pendingOffers.map((p) => p.id)));
    }

    for (const s of rt.skills.unlockedSkills(level.id)) {
      if (rt.skills.isReady(s.id)) rt.castSkill(s.id);
    }

    rt.update(dt);
    t += dt;
  }
  return rt.stats();
}
