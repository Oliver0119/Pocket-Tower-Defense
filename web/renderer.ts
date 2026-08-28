/**
 * 浏览器运行原型渲染器
 * 目的：在没有 Cocos Creator 的情况下，直接在浏览器里跑通 MVP 战斗，
 *      用于验证战斗手感、塔位覆盖与数值表现。
 * 说明：本文件只做「渲染 + 输入」，战斗逻辑全部来自 assets/scripts/battle。
 */
import { ConfigLoader } from '../assets/scripts/core/ConfigLoader';
import { BattleRuntime, BattleState } from '../assets/scripts/battle/BattleRuntime';
import { TowerConfig } from '../assets/scripts/core/types';

const CELL = 64;
const TOWER_COLOR: Record<string, string> = {
  arrow: '#FF8A3D', frost: '#4A90D9', tesla: '#7B5FE0', cannon: '#8B5FBF', poison: '#6FA84E',
};
const ENEMY_COLOR: Record<string, string> = {
  normal: '#E86A5C', fast: '#F5A623', armor: '#8B5FBF', flying: '#5FD3F3', boss: '#6B4FA0',
};

const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const el = (id: string) => document.getElementById(id)!;

let runtime: BattleRuntime | null = null;
let selectedTower = 'arrow';
let paused = false;
let speed = 1;
let levelId = 1;

// ---------------- 配置加载 ----------------
async function loadConfig(): Promise<void> {
  const names = ['towers', 'enemies', 'levels', 'skills', 'waves', 'map'] as const;
  const raw: Record<string, unknown> = {};
  for (const n of names) {
    const res = await fetch(`/assets/resources/config/${n}.json`);
    raw[n] = await res.json();
  }
  ConfigLoader.init(raw as any);
}

// ---------------- 生命周期 ----------------
function startLevel(id: number): void {
  levelId = Math.min(Math.max(1, id), ConfigLoader.allLevels().length);
  runtime = new BattleRuntime({ mode: 'main', levelId, seed: 20260829, autoStart: false });
  // 玩家有 20 秒准备期，原型里直接给足时间
  runtime.prepareTimer = 20;
  paused = false;
  renderTowerBar();
  hideOverlay();
  banner(`第 ${levelId} 关 · ${ConfigLoader.level(levelId).name}（准备中，点「开始」出怪）`, 2600);
}

function renderTowerBar(): void {
  const bar = el('tower-bar');
  const level = ConfigLoader.level(levelId);
  bar.innerHTML = '';
  level.allowedTowers.forEach((id) => {
    const cfg: TowerConfig = ConfigLoader.tower(id);
    const btn = document.createElement('button');
    btn.className = 'tower-btn' + (selectedTower === id ? ' active' : '');
    btn.innerHTML =
      `<span><b>${cfg.name}</b> <span class="role">${cfg.role}</span></span>` +
      `<span class="cost">${cfg.cost} 金</span>`;
    btn.onclick = () => { selectedTower = id; renderTowerBar(); };
    bar.appendChild(btn);
  });
}

// ---------------- 渲染 ----------------
function draw(): void {
  if (!runtime) return;
  const map = ConfigLoader.map();
  const w = map.grid.cols * CELL;
  const h = map.grid.rows * CELL;

  // 背景
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#A8D98A');
  grad.addColorStop(1, '#8FC768');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // 路径
  const pts = map.waypoints.map((p) => ({ x: p.col * CELL + CELL / 2, y: p.row * CELL + CELL / 2 }));
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#E8D5A8';
  ctx.lineWidth = 46;
  ctx.beginPath();
  pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.stroke();
  ctx.strokeStyle = '#C9A57E';
  ctx.lineWidth = 3;
  ctx.setLineDash([10, 12]);
  ctx.stroke();
  ctx.setLineDash([]);

  // 塔位（未建塔）
  const openSlots = runtime.unlockedSlots;
  map.towerSlots.forEach((slot) => {
    if (runtime!.towers.has(slot.id)) return;
    const x = slot.col * CELL + CELL / 2;
    const y = slot.row * CELL + CELL / 2;
    ctx.beginPath();
    ctx.arc(x, y, 24, 0, Math.PI * 2);
    ctx.fillStyle = slot.id <= openSlots ? 'rgba(255,255,255,.55)' : 'rgba(255,255,255,.18)';
    ctx.fill();
    ctx.strokeStyle = slot.id <= openSlots ? '#FFFFFF' : 'rgba(255,255,255,.4)';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.stroke();
    ctx.setLineDash([]);
    if (slot.id <= openSlots) {
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x - 8, y); ctx.lineTo(x + 8, y);
      ctx.moveTo(x, y - 8); ctx.lineTo(x, y + 8);
      ctx.stroke();
    }
  });

  // 塔
  for (const tower of runtime.towers.values()) {
    const x = tower.pos.x * CELL + CELL / 2;
    const y = tower.pos.y * CELL + CELL / 2;
    ctx.fillStyle = 'rgba(0,0,0,.18)';
    ctx.beginPath();
    ctx.ellipse(x, y + 20, 20, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = TOWER_COLOR[tower.cfg.id] ?? '#FF8A3D';
    roundRect(x - 20, y - 18, 40, 38, 8);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.9)';
    roundRect(x - 13, y - 11, 26, 16, 6);
    ctx.fill();
    // 等级点
    for (let i = 0; i < tower.level; i++) {
      ctx.fillStyle = '#FFC93C';
      ctx.beginPath();
      ctx.arc(x - 8 + i * 8, y + 15, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 基地
  const base = map.base;
  const bx = base.col * CELL + CELL / 2;
  const by = base.row * CELL + CELL / 2;
  ctx.fillStyle = '#5FD3F3';
  ctx.beginPath();
  ctx.moveTo(bx, by - 26); ctx.lineTo(bx + 18, by); ctx.lineTo(bx, by + 26); ctx.lineTo(bx - 18, by);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#BDEFFC';
  ctx.beginPath();
  ctx.moveTo(bx, by - 13); ctx.lineTo(bx + 9, by); ctx.lineTo(bx, by + 13); ctx.lineTo(bx - 9, by);
  ctx.closePath();
  ctx.fill();

  // 敌人
  for (const e of runtime.enemies) {
    const x = e.pos.x * CELL + CELL / 2;
    const y = e.pos.y * CELL + CELL / 2 - (e.isFlying ? 12 : 0);
    if (e.isFlying) {
      ctx.fillStyle = 'rgba(0,0,0,.18)';
      ctx.beginPath();
      ctx.ellipse(e.pos.x * CELL + CELL / 2, e.pos.y * CELL + CELL / 2 + 10, 12, 5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    const r = e.cfg.type === 'boss' ? 20 : e.cfg.type === 'armor' ? 14 : 11;
    ctx.fillStyle = ENEMY_COLOR[e.cfg.type] ?? '#E86A5C';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    // 血条
    const ratio = Math.max(0, e.hp / e.maxHp);
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.fillRect(x - r, y - r - 8, r * 2, 4);
    ctx.fillStyle = ratio > 0.5 ? '#58B368' : ratio > 0.25 ? '#FFC93C' : '#FF5A5F';
    ctx.fillRect(x - r, y - r - 8, r * 2 * ratio, 4);
  }
}

function roundRect(x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ---------------- HUD ----------------
function updateHud(): void {
  if (!runtime) return;
  el('s-wave').textContent = `${runtime.wave} / ${runtime.waveCtrl.totalWaves()}`;
  el('s-gold').textContent = String(Math.floor(runtime.economy.gold));
  el('s-hp').textContent = `${runtime.baseHp} / ${runtime.baseHpMax}`;
  el('s-kill').textContent = String(runtime.kills);
  el('btn-pause').textContent = paused ? '继续' : '暂停';
  el('btn-speed').textContent = `速度 ×${speed}`;
  el('help').innerHTML =
    `塔位开放 ${runtime.unlockedSlots} 个 · 已建 ${runtime.towers.size} 座 · 升级 ${runtime.upgrades} 次<br>` +
    `状态：${stateText()} · 本波剩余 ${runtime.enemies.length} 只`;
}

function stateText(): string {
  if (!runtime) return '-';
  if (runtime.state === 'preparing') return `准备中 ${Math.ceil(runtime.prepareTimer)}s`;
  if (runtime.state === 'fighting') return '战斗中';
  if (runtime.state === 'waveCleared') return '波次清空';
  return runtime.result === 'win' ? '通关' : '失败';
}

let bannerTimer = 0;
function banner(text: string, ms = 1800): void {
  const b = el('banner');
  b.textContent = text;
  b.classList.add('show');
  window.clearTimeout(bannerTimer);
  bannerTimer = window.setTimeout(() => b.classList.remove('show'), ms);
}

// ---------------- 三选一浮层 ----------------
function showOverlay(): void {
  if (!runtime || !runtime.pendingOffers || runtime.pendingOffers.length === 0) return;
  const box = el('offers');
  box.innerHTML = '';
  runtime.pendingOffers.forEach((p) => {
    const btn = document.createElement('button');
    btn.className = 'pick';
    btn.innerHTML = `<b>${p.name}</b><span>${p.desc}</span>`;
    btn.onclick = () => {
      runtime!.pickPassive(p.id);
      hideOverlay();
    };
    box.appendChild(btn);
  });
  el('overlay').classList.add('show');
  paused = true;
}

function hideOverlay(): void {
  el('overlay').classList.remove('show');
  paused = false;
}

// ---------------- 输入 ----------------
canvas.addEventListener('click', (ev) => {
  if (!runtime) return;
  const rect = canvas.getBoundingClientRect();
  const x = ((ev.clientX - rect.left) / rect.width) * canvas.width;
  const y = ((ev.clientY - rect.top) / rect.height) * canvas.height;

  let hit: { id: number; d: number } | null = null;
  for (const slot of ConfigLoader.map().towerSlots) {
    const sx = slot.col * CELL + CELL / 2;
    const sy = slot.row * CELL + CELL / 2;
    const d = Math.hypot(x - sx, y - sy);
    if (d < 34 && (!hit || d < hit.d)) hit = { id: slot.id, d };
  }
  if (!hit) return;

  if (ev.shiftKey) {
    runtime.sellTower(hit.id);
    banner('已拆除，返还 60%');
    return;
  }
  if (runtime.towers.has(hit.id)) {
    const r = runtime.upgradeTower(hit.id);
    banner(r.ok ? '升级成功' : `升级失败：${r.reason}`);
  } else {
    const r = runtime.buildTower(hit.id, selectedTower);
    banner(r.ok ? `建造 ${ConfigLoader.tower(selectedTower).name}` : `建造失败：${r.reason}`);
  }
});

el('btn-next').addEventListener('click', () => {
  if (!runtime) return;
  if (runtime.state === 'preparing') { runtime.prepareTimer = 0; runtime.startNextWave(); banner('第 1 波来袭'); }
  else if (runtime.state === 'waveCleared') { runtime.nextWaveTimer = 0; runtime.startNextWave(); }
  else if (runtime.callNextWaveEarly()) banner('提前召唤，奖励金币');
  paused = false;
});
el('btn-pause').addEventListener('click', () => { paused = !paused; });
el('btn-speed').addEventListener('click', () => { speed = speed === 1 ? 2 : speed === 2 ? 3 : 1; });
el('btn-level').addEventListener('click', () => {
  const next = levelId >= ConfigLoader.allLevels().length ? 1 : levelId + 1;
  startLevel(next);
});

window.addEventListener('keydown', (ev) => {
  if (ev.code === 'Space') { ev.preventDefault(); (el('btn-next') as HTMLButtonElement).click(); }
});

// ---------------- 主循环 ----------------
let last = performance.now();
let ended = false;

function loop(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  if (runtime && !paused) {
    const state: BattleState = runtime.state;
    if (state !== 'ended') {
      for (let i = 0; i < speed; i++) runtime.update(dt);
      if (runtime.pendingOffers && runtime.pendingOffers.length > 0) showOverlay();
    }
    const after: BattleState = runtime.state;
    if (after === 'ended' && !ended) {
      ended = true;
      const s = runtime.stats();
      banner(s.result === 'win' ? `守塔成功！用时 ${s.durationSec}s，剩余生命 ${s.baseHpLeft}` : `基地失守（第 ${s.waveReached} 波）`, 6000);
      paused = true;
    }
    if (after !== 'ended') ended = false;
  }

  draw();
  updateHud();
  requestAnimationFrame(loop);
}

// ---------------- 启动 ----------------
(async () => {
  await loadConfig();
  startLevel(1);
  requestAnimationFrame(loop);
})();
