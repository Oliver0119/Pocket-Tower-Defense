/**
 * 波次间三选一面板：展示 3 条被动，支持「看视频刷新一次」（激励视频点位）
 * 合规：刷新按钮与技能卡片不重叠，文案不诱导误触（GDD 第 9 章）
 */
import { _decorator, Component, Label, Node } from 'cc';
import { PassiveConfig } from '../core/types';
import { AdService } from '../platform/AdService';
import { BattleRuntime } from '../battle/BattleRuntime';

const { ccclass, property } = _decorator;

@ccclass('SkillChoosePanel')
export class SkillChoosePanel extends Component {
  @property(Node) cardRow: Node | null = null;
  @property(Label) titleLabel: Label | null = null;
  @property(Node) rerollButton: Node | null = null;

  private runtime: BattleRuntime | null = null;
  private offers: PassiveConfig[] = [];
  /** 本局已重抽次数，上限 3（与 AdService 保持一致） */
  private rerollUsed = 0;

  show(runtime: BattleRuntime, offers: PassiveConfig[]): void {
    this.runtime = runtime;
    this.offers = offers;
    this.node.active = true;
    this.render();
  }

  hide(): void {
    this.node.active = false;
  }

  private render(): void {
    if (this.titleLabel) {
      this.titleLabel.string = `选择一项强化（本局已选 ${this.pickedCount()} / 9）`;
    }
    // TODO(P1)：按 offers 内容刷新 3 张卡片的图标、名称与描述
    if (this.rerollButton) {
      this.rerollButton.active = AdService.remaining('reroll') > 0;
    }
  }

  private pickedCount(): number {
    const snap = this.runtime?.skills.passives.snapshot() ?? {};
    return Object.values(snap).reduce((a, b) => a + b, 0);
  }

  onPick(index: number): void {
    const target = this.offers[index];
    if (!this.runtime || !target) return;
    this.runtime.pickPassive(target.id);
    this.hide();
  }

  async onRerollClick(): Promise<void> {
    if (!this.runtime) return;
    if (AdService.remaining('reroll') <= 0) return;
    const ok = await AdService.showRewarded('reroll');
    if (!ok) return;
    this.rerollUsed++;
    this.offers = this.runtime.skills.offerPassives(3);
    this.render();
  }
}
