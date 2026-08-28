/**
 * 事件总线（对应 Java 侧 Spring ApplicationEvent 的思路）
 * 战斗层只发事件，UI 层只订阅，两层不直接互相持有引用。
 */
export type EventHandler<T = any> = (payload: T) => void;

export class EventCenter {
  private static handlers: Map<string, EventHandler[]> = new Map();

  static on<T = any>(event: string, handler: EventHandler<T>): void {
    const list = EventCenter.handlers.get(event) ?? [];
    list.push(handler as EventHandler);
    EventCenter.handlers.set(event, list);
  }

  static off<T = any>(event: string, handler: EventHandler<T>): void {
    const list = EventCenter.handlers.get(event);
    if (!list) return;
    const idx = list.indexOf(handler as EventHandler);
    if (idx >= 0) list.splice(idx, 1);
  }

  static emit(event: string, payload?: unknown): void {
    const list = EventCenter.handlers.get(event);
    if (!list) return;
    for (const h of list.slice()) h(payload);
  }

  static clear(): void {
    EventCenter.handlers.clear();
  }
}

/** 战斗事件名常量（避免字符串拼写错误） */
export const GameEvent = {
  EnemySpawned: 'enemy:spawned',
  EnemyKilled: 'enemy:killed',
  EnemyLeaked: 'enemy:leaked',
  EnemyDamaged: 'enemy:damaged',
  TowerBuilt: 'tower:built',
  TowerUpgraded: 'tower:upgraded',
  TowerSold: 'tower:sold',
  TowerFired: 'tower:fired',
  WaveStarted: 'wave:started',
  WaveCleared: 'wave:cleared',
  PassiveOffered: 'passive:offered',
  PassivePicked: 'passive:picked',
  SkillCasted: 'skill:casted',
  GoldChanged: 'gold:changed',
  BaseHpChanged: 'baseHp:changed',
  BattleEnded: 'battle:ended',
} as const;
