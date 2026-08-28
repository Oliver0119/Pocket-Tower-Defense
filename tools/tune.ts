/**
 * 数值校准扫描：GDD 原参数下 30 关通关率为 0，本脚本扫描关键参数组合，
 * 找到「普通玩家可通关、且不至于过易」的参数区间。
 * 用法：npm run tune
 */
import * as fs from 'fs';
import * as path from 'path';
import { ConfigLoader } from '../assets/scripts/core/ConfigLoader';
import { BattleStats, LevelConfig } from '../assets/scripts/core/types';
import { autoPlay, resetSamples } from './AutoPlayer';

const CONFIG_DIR = path.resolve(process.cwd(), 'assets/resources/config');
function load(name: string): any {
  return JSON.parse(fs.readFileSync(path.join(CONFIG_DIR, name), 'utf-8'));
}

interface Candidate { baseHp: number; hpWaveBase: number; hpLevelBase: number; initGold: number; speedScale: number; }

function applyConfig(c: Candidate): void {
  const rawWaves = load('waves.json');
  rawWaves.main.baseHp = c.baseHp;
  rawWaves.main.hpWaveBase = c.hpWaveBase;
  rawWaves.main.hpLevelBase = c.hpLevelBase;
  const rawLevels = load('levels.json');
  rawLevels.main.forEach((l: LevelConfig) => { l.initGold = c.initGold; });
  const rawEnemies = load('enemies.json');
  rawEnemies.enemies.forEach((e: { speed: number }) => { e.speed *= c.speedScale; });
  ConfigLoader.init({
    towers: load('towers.json'), enemies: rawEnemies, levels: rawLevels,
    skills: load('skills.json'), waves: rawWaves, map: load('map.json'),
  });
  resetSamples();
}

function evaluate(c: Candidate): { winRate: number; avgDur: number; earlyWin: number; lateWin: number; detail: BattleStats[] } {
  applyConfig(c);
  const levels = ConfigLoader.allLevels();
  const detail: BattleStats[] = levels.map((lv) => autoPlay(lv, 1000 + lv.id));
  const wins = detail.filter((d) => d.result === 'win').length;
  return {
    winRate: wins / detail.length,
    avgDur: detail.reduce((a, b) => a + b.durationSec, 0) / detail.length,
    earlyWin: detail.filter((d, i) => d.result === 'win' && i < 15).length,
    lateWin: detail.filter((d, i) => d.result === 'win' && i >= 15).length,
    detail,
  };
}

function main(): void {
  const cands: Candidate[] = [];
  for (const speedScale of [1.4, 1.5]) {
    for (const baseHp of [20, 24, 28, 32]) {
      for (const hpLevelBase of [1.01, 1.015, 1.02]) {
        cands.push({ baseHp, hpWaveBase: 1.15, hpLevelBase, initGold: 250, speedScale });
      }
    }
  }
  console.log('speedScale  baseHp  levelBase  通关率  前15关  后15关  平均时长(s)');
  console.log('─'.repeat(66));
  let best: { c: Candidate; r: ReturnType<typeof evaluate> } | null = null;
  for (const c of cands) {
    const r = evaluate(c);
    if (!best || r.winRate > best.r.winRate) best = { c, r };
    console.log(
      `${String(c.speedScale).padStart(10)} ${String(c.baseHp).padStart(7)} ${String(c.hpLevelBase).padStart(9)} ` +
      `${(r.winRate * 100).toFixed(0).padStart(6)}% ${String(r.earlyWin).padStart(6)} ${String(r.lateWin).padStart(7)} ${r.avgDur.toFixed(0).padStart(11)}`,
    );
  }

  if (best) {
    console.log(`\n【最优组合】baseHp=${best.c.baseHp} waveBase=${best.c.hpWaveBase} levelBase=${best.c.hpLevelBase} initGold=${best.c.initGold}`);
    console.log('  关卡  结果   到达波次  击杀  漏怪  剩余血  时长(s)');
    best.r.detail.forEach((d, i) => {
      console.log(
        `  ${String(i + 1).padStart(4)}  ${d.result === 'win' ? '通关' : '失败'}   ${String(d.waveReached).padStart(7)} ` +
        `${String(d.kills).padStart(5)} ${String(d.leaked).padStart(5)} ${String(d.baseHpLeft).padStart(6)} ${String(d.durationSec).padStart(8)}`,
      );
    });
  }
  console.log('\n（GDD 原值：baseHp=60, waveBase=1.15, levelBase=1.12, initGold=250）');
}

main();
