/**
 * 微信云开发：排行榜上报/拉取 + 存档同步
 * 字段定义来源：docs/游戏设计方案.md 第 5.3 节
 * TODO(M7)：需在微信开发者工具中开通云开发环境，并部署云函数 submitScore / fetchRanking
 */
declare const wx: any;

export interface LeaderboardRecord {
  userId: string;
  nickname: string;
  avatarUrl: string;
  bestWave: number;
  bestScore: number;
  totalKills: number;
  towerComp: string;
  durationSec: number;
  reviveUsed: number;
  updatedAt: number;
}

export interface EndlessSubmit {
  bestWave: number;
  bestScore: number;
  totalKills: number;
  towerComp: string;
  durationSec: number;
  reviveUsed: number;
}

export class CloudService {
  private static ready = false;

  static init(): void {
    if (typeof wx === 'undefined' || !wx.cloud) return;
    try {
      wx.cloud.init();
      CloudService.ready = true;
    } catch {
      CloudService.ready = false;
    }
  }

  static isReady(): boolean {
    return CloudService.ready;
  }

  /** 上报无尽成绩；防作弊校验在云函数侧完成（时长与波次的数学合理性） */
  static async submitEndlessScore(record: EndlessSubmit): Promise<boolean> {
    if (!CloudService.ready) return false;
    try {
      const res = await wx.cloud.callFunction({
        name: 'submitScore',
        data: record,
      });
      return res?.result?.ok === true;
    } catch {
      return false;
    }
  }

  /** 拉取榜单：world=世界榜 Top100，friend=好友榜 */
  static async fetchRanking(scope: 'world' | 'friend'): Promise<LeaderboardRecord[]> {
    if (!CloudService.ready) return [];
    try {
      const res = await wx.cloud.callFunction({
        name: 'fetchRanking',
        data: { scope },
      });
      return (res?.result?.list ?? []) as LeaderboardRecord[];
    } catch {
      return [];
    }
  }

  /** 存档同步：本地与云端按 updatedAt 取新 */
  static async syncProgress<T extends { updatedAt: number }>(local: T): Promise<T> {
    if (!CloudService.ready) return local;
    try {
      const res = await wx.cloud.callFunction({ name: 'syncProgress', data: { progress: local } });
      const remote = res?.result?.progress as T | undefined;
      if (remote && remote.updatedAt > local.updatedAt) return remote;
    } catch {
      /* 离线时保留本地存档 */
    }
    return local;
  }
}
