/**
 * 行进路径：由折线航点组成，敌人按「已行进格数」在折线上插值取坐标。
 * 固定路线机制：不做寻路、不做迷宫（GDD 第 2 章）
 */
import { GridPos, Vec2 } from '../core/types';

export class Path {
  readonly points: Vec2[];
  readonly segLens: number[];
  readonly total: number;

  constructor(waypoints: GridPos[]) {
    this.points = waypoints.map((p) => ({ x: p.col, y: p.row }));
    this.segLens = [];
    for (let i = 1; i < this.points.length; i++) {
      const dx = this.points[i].x - this.points[i - 1].x;
      const dy = this.points[i].y - this.points[i - 1].y;
      this.segLens.push(Math.hypot(dx, dy));
    }
    this.total = this.segLens.reduce((a, b) => a + b, 0);
  }

  /** 飞行怪专用：出生点直连基地的直线路径（无视地面路径） */
  static straight(spawn: GridPos, base: GridPos): Path {
    return new Path([spawn, base]);
  }

  /** 按已行进距离取当前坐标 */
  positionAt(dist: number): Vec2 {
    if (dist <= 0) return { ...this.points[0] };
    let remain = dist;
    for (let i = 0; i < this.segLens.length; i++) {
      const len = this.segLens[i];
      if (remain <= len) {
        const t = len === 0 ? 0 : remain / len;
        const a = this.points[i];
        const b = this.points[i + 1];
        return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      }
      remain -= len;
    }
    const last = this.points[this.points.length - 1];
    return { ...last };
  }
}
