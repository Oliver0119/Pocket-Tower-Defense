/**
 * 战斗 HUD：波次 / 金币 / 基地生命 / 主动技能 / 倍速暂停
 * 表现层只订阅事件、只调用 runtime 接口，不持有战斗数据（SDD 设计约定）
 */
import { _decorator, Component, Label, Node, ProgressBar } from 'cc';
import { EventCenter, GameEvent } from '../core/EventCenter';
import { BattleRuntime } from '../battle/BattleRuntime';
import { TowerConfig } from '../core/types';

const { ccclass, property } = _decorator;

@ccclass('BattleHUD')
export class BattleHUD extends Component {
  @property(Label) waveLabel: Label | null = null;
  @property(Label) goldLabel: Label | null = null;
  @property(Label) hpLabel: Label | null = null;
  @property(ProgressBar) hpBar: ProgressBar | null = null;
  @property(Node) towerBar: Node | null = null;
  @property(Node) skillBar: Node | null = null;

  private runtime: BattleRuntime | null = null;
  /** 建塔栏每帧刷新节流 */
  private refreshTimer = 0;

  bind(runtime: BattleRuntime): void {
    this.runtime = runtime;
    this.registerEvents();
    this.refreshAll();
  }

  private registerEvents(): void {
    EventCenter.on(GameEvent.GoldChanged, (g: number) => this.setGold(g));
    EventCenter.on(GameEvent.BaseHpChanged, (hp: number) => {
      this.setHp(hp);
    });
    EventCenter.on(GameEvent.WaveStarted, (p: { wave: number }) => this.setWave(p.wave));
    EventCenter.on(GameEvent.PassiveOffered, (offers: unknown) => {
      // TODO(P1)：弹出三选一面板（SkillChoosePanel），弹出时可暂停战斗
      console.log('[BattleHUD] 收到被动三选一：', offers);
    });
  }

  update(dt: number): void {
    if (!this.runtime) return;
    this.refreshTimer -= dt;
    if (this.refreshTimer <= 0) {
      this.refreshTimer = 0.2;
      this.setGold(this.runtime.economy.gold);
      this.setHp(this.runtime.baseHp);
    }
  }

  private setWave(wave: number): void {
    const total = this.runtime?.mode === 'endless' ? '∞' : String(this.runtime?.waveCtrl.totalWaves() ?? 10);
    if (this.waveLabel) this.waveLabel.string = `第 ${wave} / ${total} 波`;
  }

  private setGold(gold: number): void {
    if (this.goldLabel) this.goldLabel.string = String(Math.floor(gold));
  }

  private setHp(hp: number): void {
    const max = this.runtime?.baseHpMax ?? 20;
    if (this.hpLabel) this.hpLabel.string = `基地 ${hp} / ${max}`;
    if (this.hpBar) this.hpBar.progress = hp / max;
  }

  private refreshAll(): void {
    if (!this.runtime) return;
    this.setWave(this.runtime.wave);
    this.setGold(this.runtime.economy.gold);
    this.setHp(this.runtime.baseHp);
  }

  /** 建塔栏点击：由 UI 按钮绑定，传入塔 id */
  onTowerButtonClick(towerId: string): void {
    if (!this.runtime) return;
    // TODO(P1)：与「选中塔位」状态联动，当前先按最佳可用塔位自动放置
    const cfg: TowerConfig | null = null;
    void cfg;
    console.log('[BattleHUD] 选择塔：', towerId);
  }

  onSkillClick(skillId: string): void {
    this.runtime?.castSkill(skillId);
  }

  onPauseClick(): void {
    // TODO(P1)：暂停面板（暂停时不刷怪、不结算冷却）
    console.log('[BattleHUD] 暂停');
  }

  onSpeedClick(): void {
    // TODO(P1)：×1 / ×2 倍速切换
    console.log('[BattleHUD] 切换倍速');
  }

  onDestroy(): void {
    EventCenter.clear();
  }
}
