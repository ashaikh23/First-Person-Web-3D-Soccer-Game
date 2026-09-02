import * as THREE from 'three';
import { FIELD } from '../ai/SoccerAI';

export class MiniMap {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private width: number;
  private height: number;

  constructor(canvasId = 'minimap') {
    this.canvas = document.getElementById(canvasId) as HTMLCanvasElement;
    this.ctx = this.canvas.getContext('2d')!;
    this.width = this.canvas.width;
    this.height = this.canvas.height;
  }

  /**
   * Converts 3D world coordinates (X, Z) into 2D minimap canvas coordinates.
   */
  private worldToMap(x: number, z: number): { mx: number; my: number } {
    // Pitch is W = 70 (-35 to +35), L = 110 (-55 to +55)
    // North (opponent goal) is negative Z (top of minimap)
    // South (player goal) is positive Z (bottom of minimap)
    const padding = 8;
    const usableW = this.width - padding * 2;
    const usableH = this.height - padding * 2;

    const normX = (x + FIELD.HW) / FIELD.W; // 0 to 1
    const normZ = (z + FIELD.HL) / FIELD.L; // 0 to 1 (0 is north, 1 is south)

    const mx = padding + normX * usableW;
    const my = padding + normZ * usableH;

    return { mx, my };
  }

  public render(
    playerPos: THREE.Vector3,
    playerYaw: number,
    ballPos: THREE.Vector3,
    teammates: THREE.Vector3[] = [],
    enemies: THREE.Vector3[] = [],
    goalies: THREE.Vector3[] = [],
    cones: { x: number; z: number; passed: boolean }[] = []
  ) {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;

    // 1. Natural Stadium Grass Pitch Background
    ctx.fillStyle = '#064e3b';
    ctx.fillRect(0, 0, w, h);

    // White pitch border
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(6, 6, w - 12, h - 12);

    // 2. Pitch markings
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.lineWidth = 1;

    // Halfway line
    const mid = this.worldToMap(0, 0);
    ctx.beginPath();
    ctx.moveTo(6, mid.my);
    ctx.lineTo(w - 6, mid.my);
    ctx.stroke();

    // Center circle
    ctx.beginPath();
    ctx.arc(mid.mx, mid.my, 14, 0, Math.PI * 2);
    ctx.stroke();

    // North Goal Box (Top)
    const nBoxTop = this.worldToMap(-12, -FIELD.HL + 14);
    const nBoxBottom = this.worldToMap(12, -FIELD.HL);
    ctx.strokeRect(nBoxTop.mx, nBoxBottom.my, nBoxBottom.mx - nBoxTop.mx, nBoxTop.my - nBoxBottom.my);

    // South Goal Box (Bottom)
    const sBoxTop = this.worldToMap(-12, FIELD.HL);
    const sBoxBottom = this.worldToMap(12, FIELD.HL - 14);
    ctx.strokeRect(sBoxTop.mx, sBoxBottom.my, sBoxBottom.mx - sBoxTop.mx, sBoxTop.my - sBoxBottom.my);

    // 3. Draw Practice Cones (if any)
    for (const c of cones) {
      const p = this.worldToMap(c.x, c.z);
      ctx.fillStyle = c.passed ? '#22c55e' : '#f59e0b';
      ctx.beginPath();
      ctx.arc(p.mx, p.my, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // 4. Draw Goalkeepers (Yellow/Gold)
    ctx.fillStyle = '#eab308';
    for (const g of goalies) {
      const p = this.worldToMap(g.x, g.z);
      ctx.beginPath();
      ctx.arc(p.mx, p.my, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // 5. Draw Teammates (Pink)
    ctx.fillStyle = '#ff69b4';
    for (const t of teammates) {
      const p = this.worldToMap(t.x, t.z);
      ctx.beginPath();
      ctx.arc(p.mx, p.my, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // 6. Draw Enemies (Violet / Purple)
    ctx.fillStyle = '#a855f7';
    for (const e of enemies) {
      const p = this.worldToMap(e.x, e.z);
      ctx.beginPath();
      ctx.arc(p.mx, p.my, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // 7. Draw Match Ball (White Soccer Ball with black outline)
    const bp = this.worldToMap(ballPos.x, ballPos.z);
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(bp.mx, bp.my, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#ff1493';
    ctx.beginPath();
    ctx.arc(bp.mx, bp.my, 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 8. Draw Player (You - Hot Pink with Gold Accent & FOV cone)
    const pp = this.worldToMap(playerPos.x, playerPos.z);
    
    // View direction cone
    ctx.save();
    ctx.fillStyle = 'rgba(255, 20, 147, 0.35)';
    ctx.beginPath();
    ctx.moveTo(pp.mx, pp.my);
    const viewAngle = playerYaw - Math.PI / 2;
    ctx.arc(pp.mx, pp.my, 16, viewAngle - 0.45, viewAngle + 0.45);
    ctx.closePath();
    ctx.fill();

    // Player dot
    ctx.fillStyle = '#ff1493';
    ctx.strokeStyle = '#ffd700';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(pp.mx, pp.my, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}
