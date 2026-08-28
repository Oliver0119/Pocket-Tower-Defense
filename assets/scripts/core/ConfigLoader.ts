/**
 * 数值配置中心：所有数值外置，代码内禁止硬编码（SDD 设计约定）
 * 在 Cocos 侧由 resources.load 读取 JSON 后调用 init；在 Node 无头模拟侧由 fs 读取后调用 init。
 */
import {
  TowerConfig, EnemyConfig, LevelConfig, PassiveConfig,
  ActiveSkillConfig, WaveParams, EndlessParams, LimitParams, MapConfig,
} from './types';

interface RawConfig {
  towers: { towers: TowerConfig[] };
  enemies: { enemies: EnemyConfig[] };
  levels: { main: LevelConfig[]; challenges: unknown[] };
  skills: { active: ActiveSkillConfig[]; passive: PassiveConfig[] };
  waves: { main: WaveParams; endless: EndlessParams; limits: LimitParams };
  map: MapConfig;
}

export class ConfigLoader {
  private static towers = new Map<string, TowerConfig>();
  private static enemies = new Map<string, EnemyConfig>();
  private static levels = new Map<number, LevelConfig>();
  private static passives: PassiveConfig[] = [];
  private static actives: ActiveSkillConfig[] = [];
  private static wave: WaveParams = null as unknown as WaveParams;
  private static endless: EndlessParams = null as unknown as EndlessParams;
  private static limits: LimitParams = null as unknown as LimitParams;
  private static mapCfg: MapConfig = null as unknown as MapConfig;
  private static ready = false;

  static init(raw: RawConfig): void {
    raw.towers.towers.forEach((t) => ConfigLoader.towers.set(t.id, t));
    raw.enemies.enemies.forEach((e) => ConfigLoader.enemies.set(e.id, e));
    raw.levels.main.forEach((l) => ConfigLoader.levels.set(l.id, l));
    ConfigLoader.passives = raw.skills.passive;
    ConfigLoader.actives = raw.skills.active;
    ConfigLoader.wave = raw.waves.main;
    ConfigLoader.endless = raw.waves.endless;
    ConfigLoader.limits = raw.waves.limits;
    ConfigLoader.mapCfg = raw.map;
    ConfigLoader.ready = true;
  }

  private static ensure(): void {
    if (!ConfigLoader.ready) throw new Error('ConfigLoader 未初始化，请先调用 init()');
  }

  static tower(id: string): TowerConfig {
    ConfigLoader.ensure();
    const t = ConfigLoader.towers.get(id);
    if (!t) throw new Error(`未定义的塔：${id}`);
    return t;
  }

  static allTowers(): TowerConfig[] {
    ConfigLoader.ensure();
    return [...ConfigLoader.towers.values()];
  }

  static enemy(id: string): EnemyConfig {
    ConfigLoader.ensure();
    const e = ConfigLoader.enemies.get(id);
    if (!e) throw new Error(`未定义的敌人：${id}`);
    return e;
  }

  static allEnemies(): EnemyConfig[] {
    ConfigLoader.ensure();
    return [...ConfigLoader.enemies.values()];
  }

  static level(id: number): LevelConfig {
    ConfigLoader.ensure();
    const l = ConfigLoader.levels.get(id);
    if (!l) throw new Error(`未定义的关卡：${id}`);
    return l;
  }

  static allLevels(): LevelConfig[] {
    ConfigLoader.ensure();
    return [...ConfigLoader.levels.values()].sort((a, b) => a.id - b.id);
  }

  static passiveList(): PassiveConfig[] {
    ConfigLoader.ensure();
    return ConfigLoader.passives;
  }

  static activeList(): ActiveSkillConfig[] {
    ConfigLoader.ensure();
    return ConfigLoader.actives;
  }

  static waveParams(): WaveParams {
    ConfigLoader.ensure();
    return ConfigLoader.wave;
  }

  static endlessParams(): EndlessParams {
    ConfigLoader.ensure();
    return ConfigLoader.endless;
  }

  static limitParams(): LimitParams {
    ConfigLoader.ensure();
    return ConfigLoader.limits;
  }

  static map(): MapConfig {
    ConfigLoader.ensure();
    return ConfigLoader.mapCfg;
  }
}
