/**
 * 广告服务：三个激励视频点位 + 插屏，内建合规限制（SDD 设计约定：业务层无法绕过）
 * 合规红线来源：docs/游戏设计方案.md 第 9 章
 *   · 激励视频：复活（每局 1 次）/ 双倍金币（每关 1 次）/ 技能重抽（每局 3 次）
 *   · 插屏：冷却 ≥180s，单局 ≤3 次
 * 坑位提醒：onClose 只能注册一次，重复注册会导致重复发奖励
 */
declare const wx: any;

export type AdPlacement = 'revive' | 'doubleGold' | 'reroll';

interface PlacementRule {
  /** 每个作用域内的可用次数 */
  limit: number;
  /** 作用域：battle=每局，level=每关 */
  scope: 'battle' | 'level';
}

const RULES: Record<AdPlacement, PlacementRule> = {
  revive: { limit: 1, scope: 'battle' },
  doubleGold: { limit: 1, scope: 'level' },
  reroll: { limit: 3, scope: 'battle' },
};

/** 广告位 ID：TODO(M9) 开通流量主后填入真实 adUnitId */
export const AD_UNIT_ID: Record<AdPlacement | 'interstitial', string> = {
  revive: '',
  doubleGold: '',
  reroll: '',
  interstitial: '',
};

export class AdService {
  private static used = new Map<AdPlacement, number>();
  private static interstitialCount = 0;
  private static lastInterstitialAt = 0;
  private static rewardedAd: any = null;
  private static interstitialAd: any = null;

  /** 每局开始时调用，重置「每局」作用域计数 */
  static resetBattleScope(): void {
    for (const [k, rule] of Object.entries(RULES)) {
      if ((rule as PlacementRule).scope === 'battle') AdService.used.set(k as AdPlacement, 0);
    }
    AdService.interstitialCount = 0;
  }

  /** 每关开始时调用，重置「每关」作用域计数 */
  static resetLevelScope(): void {
    for (const [k, rule] of Object.entries(RULES)) {
      if ((rule as PlacementRule).scope === 'level') AdService.used.set(k as AdPlacement, 0);
    }
  }

  static remaining(placement: AdPlacement): number {
    const rule = RULES[placement];
    return rule.limit - (AdService.used.get(placement) ?? 0);
  }

  /** 播放激励视频；resolve(true) 表示完整看完并发放奖励 */
  static showRewarded(placement: AdPlacement): Promise<boolean> {
    if (AdService.remaining(placement) <= 0) return Promise.resolve(false);
    if (typeof wx === 'undefined' || !wx.createRewardedVideoAd) {
      // 开发者工具 / 非微信环境：直接判定成功，便于联调流程
      AdService.used.set(placement, (AdService.used.get(placement) ?? 0) + 1);
      return Promise.resolve(true);
    }
    if (!AdService.rewardedAd) {
      AdService.rewardedAd = wx.createRewardedVideoAd({ adUnitId: AD_UNIT_ID[placement] });
    }
    return new Promise<boolean>((resolve) => {
      let settled = false;
      const onClose = (res: { isEnded: boolean }) => {
        if (settled) return;
        settled = true;
        AdService.rewardedAd.offClose(onClose);
        if (res && res.isEnded) {
          AdService.used.set(placement, (AdService.used.get(placement) ?? 0) + 1);
          resolve(true);
        } else {
          resolve(false);
        }
      };
      AdService.rewardedAd.onClose(onClose);
      AdService.rewardedAd.show().catch(() => {
        AdService.rewardedAd.load().then(() => AdService.rewardedAd.show()).catch(() => {
          if (!settled) { settled = true; resolve(false); }
        });
      });
    });
  }

  /** 插屏广告：冷却 180s，单局 ≤3 次 */
  static showInterstitial(): void {
    const now = Date.now();
    if (AdService.interstitialCount >= 3) return;
    if (now - AdService.lastInterstitialAt < 180_000) return;
    AdService.interstitialCount++;
    AdService.lastInterstitialAt = now;
    if (typeof wx === 'undefined' || !wx.createInterstitialAd) return;
    if (!AdService.interstitialAd) {
      AdService.interstitialAd = wx.createInterstitialAd({ adUnitId: AD_UNIT_ID.interstitial });
    }
    AdService.interstitialAd.show().catch(() => {});
  }
}
