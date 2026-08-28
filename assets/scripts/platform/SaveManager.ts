/**
 * 本地存档：微信小游戏用 wx.setStorageSync；Node/Web 环境降级为内存存储（便于无头测试）
 * TODO(M7)：联网存档与排行榜同步见 CloudService
 */
import { PlayerProgress } from '../core/types';

/** 宿主环境声明：微信小游戏全局对象 */
declare const wx: any;

const KEY = 'ptd_progress_v1';
let memoryFallback: string | null = null;

function hasWx(): boolean {
  return typeof wx !== 'undefined' && typeof wx.setStorageSync === 'function';
}

export class SaveManager {
  static save(progress: PlayerProgress): void {
    const data = JSON.stringify(progress);
    if (hasWx()) {
      wx.setStorageSync(KEY, data);
    } else {
      memoryFallback = data;
    }
  }

  static load(): PlayerProgress | null {
    const raw = hasWx() ? wx.getStorageSync(KEY) : memoryFallback;
    if (!raw) return null;
    try {
      return JSON.parse(raw) as PlayerProgress;
    } catch {
      return null;
    }
  }

  static clear(): void {
    if (hasWx()) wx.removeStorageSync(KEY);
    memoryFallback = null;
  }
}
