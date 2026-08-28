/**
 * 经济系统：关内经济独立（GDD 核心原则），金币不跨关累积
 * 规则来源：docs/游戏设计方案.md 第 7 章
 */
import { Tower } from './entities';

export class EconomyService {
  gold = 0;
  goldEarned = 0;

  constructor(initGold: number) {
    this.gold = initGold;
  }

  canAfford(amount: number): boolean {
    return this.gold >= amount;
  }

  spend(amount: number): boolean {
    if (!this.canAfford(amount)) return false;
    this.gold -= amount;
    return true;
  }

  earn(amount: number): void {
    this.gold += amount;
    this.goldEarned += amount;
  }

  /** 升级费用受「精工巧匠」被动影响 */
  upgradeCostOf(tower: Tower, costMul: number): number {
    const base = tower.nextUpgradeCost;
    if (base === null) return Infinity;
    return Math.round(base * costMul);
  }

  /** 拆除返还：累计投入 × 60% */
  refundOf(tower: Tower, rate: number): number {
    return Math.floor(tower.totalInvest * rate);
  }
}
