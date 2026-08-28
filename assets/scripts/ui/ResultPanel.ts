/**
 * 结算 / 复活面板
 * 胜利：战报 + 通关奖励 + 「看视频双倍金币」点位
 * 失败：基地失守 → 「立即复活」激励视频（每局 1 次，GDD 最高价值点位）
 */
import { _decorator, Component, Label, Node } from 'cc';
import { AdService } from '../platform/AdService';
import { BattleRuntime } from '../battle/BattleRuntime';
import { BattleStats } from '../core/types';

const { ccclass, property } = _decorator;

@ccclass('ResultPanel')
export class ResultPanel extends Component {
  @property(Node) winPanel: Node | null = null;
  @property(Node) losePanel: Node | null = null;
  @property(Label) titleLabel: Label | null = null;
  @property(Label) statsLabel: Label | null = null;
  @property(Node) reviveButton: Node | null = null;
  @property(Node) doubleGoldButton: Node | null = null;

  private runtime: BattleRuntime | null = null;
  private stats: BattleStats | null = null;

  show(runtime: BattleRuntime, stats: BattleStats): void {
    this.runtime = runtime;
    this.stats = stats;
    this.node.active = true;
    const win = stats.result === 'win';
    if (this.winPanel) this.winPanel.active = win;
    if (this.losePanel) this.losePanel.active = !win;
    if (this.titleLabel) this.titleLabel.string = win ? '守塔成功！' : '基地失守！';
    if (this.statsLabel) {
      this.statsLabel.string =
        `波次 ${stats.waveReached}/${stats.totalWaves}　击杀 ${stats.kills}　` +
        `漏怪 ${stats.leaked}　剩余生命 ${stats.baseHpLeft}　用时 ${stats.durationSec}s`;
    }
    if (this.reviveButton) this.reviveButton.active = !win && AdService.remaining('revive') > 0;
    if (this.doubleGoldButton) this.doubleGoldButton.active = win && AdService.remaining('doubleGold') > 0;
  }

  hide(): void {
    this.node.active = false;
  }

  /** 复活：基地恢复满血并回到上一波（每局 1 次） */
  async onReviveClick(): Promise<void> {
    if (!this.runtime) return;
    const ok = await AdService.showRewarded('revive');
    if (!ok) return;
    this.runtime.baseHp = this.runtime.baseHpMax;
    // TODO(P1)：恢复到「上一波开始」的战场状态（当前先回到本波继续）
    this.runtime.state = 'fighting';
    this.hide();
  }

  async onDoubleGoldClick(): Promise<void> {
    if (!this.stats) return;
    const ok = await AdService.showRewarded('doubleGold');
    if (!ok) return;
    // TODO(P1)：结算奖励翻倍后写入存档
    console.log('[ResultPanel] 双倍金币已发放');
  }

  onRestartClick(): void {
    // TODO(P1)：由 GameManager 重新 startLevel 当前关卡
    console.log('[ResultPanel] 重开本关');
  }

  onBackHomeClick(): void {
    // TODO(P1)：切回 Home 场景，并按冷却弹插屏
    AdService.showInterstitial();
    this.hide();
  }
}
