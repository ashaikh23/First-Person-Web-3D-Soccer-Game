export type GameMode = 'Practice' | 'Match';
export type Difficulty = 'Easy' | 'Medium' | 'Hard';

export class GameManager {
  private static instance: GameManager;

  public score: number = 0;
  public enemyScore: number = 0;
  public timer: number = 0;
  public stamina: number = 100;
  public powerMeter: number = 0;
  public gameMode: GameMode = 'Practice';
  public difficulty: Difficulty = 'Medium';
  public isGameStarted: boolean = false;

  // Match Statistics
  public shotsTotal: number = 0;
  public shotsOnTarget: number = 0;
  public passesCompleted: number = 0;
  public playerPossessionTime: number = 0;
  public enemyPossessionTime: number = 0;

  private constructor() {}

  public static getInstance(): GameManager {
    if (!GameManager.instance) {
      GameManager.instance = new GameManager();
    }
    return GameManager.instance;
  }

  public reset() {
    this.score = 0;
    this.enemyScore = 0;
    this.timer = 0;
    this.stamina = 100;
    this.powerMeter = 0;
    this.shotsTotal = 0;
    this.shotsOnTarget = 0;
    this.passesCompleted = 0;
    this.playerPossessionTime = 0;
    this.enemyPossessionTime = 0;
  }

  public updateStamina(amount: number) {
    this.stamina = Math.max(0, Math.min(100, this.stamina + amount));
  }

  public getPossessionPercentage(): { player: number; enemy: number } {
    const total = this.playerPossessionTime + this.enemyPossessionTime;
    if (total < 0.1) return { player: 50, enemy: 50 };
    const playerPct = Math.round((this.playerPossessionTime / total) * 100);
    return { player: playerPct, enemy: 100 - playerPct };
  }
}
