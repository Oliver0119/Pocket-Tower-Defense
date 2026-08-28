/**
 * 无头模拟器（不依赖 Cocos）：按配置公式跑完整关卡，验证数值自洽性
 * 用法：npm run sim
 * 校验点：docs/数值校准报告.md —— 经济产出、BOSS 强度、30 关通关率与单局时长
 */
import * as fs from 'fs';
import * as path from 'path';
import { ConfigLoader } from '../assets/scripts/core/ConfigLoader';
import { BattleStats } from '../assets/scripts/core/types';
import { autoPlay, resetSamples } from './AutoPlayer';

const CONFIG_DIR = path.resolve(process.cwd(), 'assets/resources/config');
function loadJson(name: string): unknown {
  return JSON.parse(fs.readFileSync(path.join(CONFIG_DIR, name), 'utf-8'));
}

function initConfig(): void {
  ConfigLoader.init({
    towers: loadJson('towers.json') as any,
    enemies: loadJson('enemies.json') as any,
    levels: loadJson('levels.json') as any,
    skills: loadJson('skills.json') as any,
    waves: loadJson('waves.json') as any,
    map: loadJson('map.json') as any,
  });
  resetSamples();
}

function fmt(n: number, w = 8): string {
  return String(n).padStart(w);
}

function main(): void {
  initConfig();

  console.log('════════ 《口袋守塔》MVP 无头模拟 ════════\n');
  console.log('（数值以 assets/resources/config/*.json 为准，校准说明见 docs/数值校准报告.md）\n');

  // ── 校验 1：单关经济产出
  const wp = ConfigLoader.waveParams();
  let spawnTotal = 0;
  let waveRewardSum = 0;
  for (let w = 1; w <= wp.waveCount; w++) {
    spawnTotal += 6 + Math.floor(w * 1.2);
    waveRewardSum += 15 + 5 * w;
  }
  console.log('【校验 1】单关经济产出');
  console.log(`  出怪总数        = ${spawnTotal}（N(w)=6+floor(1.2w) 逐波累加）`);
  console.log(`  波次结算奖励    = ${waveRewardSum}`);
  console.log(`  通关奖励(第1关) = ${60 + 20 * 1}`);
  console.log(`  → 关内总产出随关卡线性增长，与塔造价曲线同阶\n`);

  // ── 校验 2：终局 BOSS 强度
  const l30 = ConfigLoader.level(30);
  const bossHp = wp.baseHp * Math.pow(wp.hpWaveBase, 9) * Math.pow(wp.hpLevelBase, 29) * 5.0 * l30.hpScale;
  console.log('【校验 2】第 30 关第 10 波 BOSS 强度');
  console.log(`  BOSS HP = ${wp.baseHp} × ${wp.hpWaveBase}^9 × ${wp.hpLevelBase}^29 × 5.0 × ${l30.hpScale} ≈ ${bossHp.toFixed(0)}\n`);

  // ── 实跑 30 关
  console.log('【实跑】30 关自动战斗（策略：沿路径布防 → 铺够 10 座转升级 → 按优先级选被动 → 技能即放）\n');
  console.log('  关卡  章节  结果   到达波次  击杀  漏怪  剩余血  金币结余  时长(s)');
  console.log('  ' + '─'.repeat(74));

  const levels = ConfigLoader.allLevels();
  const rows: BattleStats[] = levels.map((lv) => autoPlay(lv, 1000 + lv.id));

  rows.forEach((st, i) => {
    const lv = levels[i];
    console.log(
      `  ${fmt(lv.id, 4)} ${fmt(lv.chapter, 5)}  ${st.result === 'win' ? '通关' : '失败'}   ` +
      `${fmt(st.waveReached, 7)} ${fmt(st.kills, 6)} ${fmt(st.leaked, 5)} ${fmt(st.baseHpLeft, 6)} ` +
      `${fmt(st.goldLeft, 9)} ${fmt(st.durationSec, 8)}`,
    );
  });

  const wins = rows.filter((r) => r.result === 'win').length;
  const durs = rows.map((r) => r.durationSec);
  const avgDur = durs.reduce((a, b) => a + b, 0) / durs.length;
  const inRange = durs.filter((d) => d >= 180 && d <= 300).length;
  const leaks = rows.reduce((a, b) => a + b.leaked, 0) / rows.length;

  console.log('\n【汇总】');
  console.log(`  通关率        = ${wins}/${rows.length} (${((wins / rows.length) * 100).toFixed(0)}%)`);
  console.log(`  单局时长      = 平均 ${avgDur.toFixed(0)}s / 最短 ${Math.min(...durs)}s / 最长 ${Math.max(...durs)}s`);
  console.log(`  时长达标      = ${inRange}/${rows.length} 关落在 180~300s（3~5 分钟）`);
  console.log(`  平均漏怪      = ${leaks.toFixed(1)} 只/关（基地 20 点生命，产生压力但不至于劝退）`);

  const failed = rows.filter((r) => r.result === 'lose');
  if (failed.length > 0) {
    console.log(`  失败关卡      = ${failed.map((r) => `第${r.levelId}关(${r.waveReached}波)`).join('、')}`);
  }
  console.log('\n════════ 模拟结束 ════════');
}

main();
