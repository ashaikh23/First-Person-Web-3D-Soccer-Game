import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { Ball } from '../entities/Ball';
import { CyberCharacter } from '../entities/CyberCharacter';
import { EnemyTeamAI } from '../ai/EnemyTeamAI';
import { TeammateAI } from '../ai/TeammateAI';
import { GameManager } from '../state/GameManager';
import { getDifficultyParams, flatDist, FIELD, determinePossession } from '../ai/SoccerAI';
import { SoundManager } from '../engine/SoundManager';
import { ParticleSystem } from '../engine/ParticleSystem';

// ─────────────────────────────────────────────────────────────
// MATCH MODE — integrates all AI systems with visual characters
// ─────────────────────────────────────────────────────────────
export class MatchMode {
  // Visual characters
  private enemyCharacters: CyberCharacter[] = [];
  private teammateCharacters: CyberCharacter[] = [];
  private goalkeeperCharacter: CyberCharacter;
  private enemyGoalkeeperCharacter: CyberCharacter;

  // AI systems
  public enemyAI: EnemyTeamAI;
  public teammateAI: TeammateAI;

  // Goalkeeper physics bodies
  private playerGoalkeeper: RAPIER.RigidBody;
  private enemyGoalkeeper: RAPIER.RigidBody;

  // Goalkeeper motion
  private goalkeeperTime = 0;
  private particleSystem?: ParticleSystem;

  constructor(scene: THREE.Scene, world: RAPIER.World, particleSystem?: ParticleSystem) {
    this.particleSystem = particleSystem;
    const gm = GameManager.getInstance();
    const params = getDifficultyParams(gm.difficulty);

    // ── CREATE ENEMY OUTFIELD PLAYERS (5) ──
    const enemyBodies: RAPIER.RigidBody[] = [];
    const enemyStartPositions = [
      new THREE.Vector3(-12, 1.25, -18),
      new THREE.Vector3(12, 1.25, -18),
      new THREE.Vector3(0, 1.25, -28),
      new THREE.Vector3(-15, 1.25, -38),
      new THREE.Vector3(15, 1.25, -38),
    ];

    for (const pos of enemyStartPositions) {
      const char = new CyberCharacter(scene, world, pos, 'red');
      this.enemyCharacters.push(char);
      enemyBodies.push(char.body);
    }

    // ── CREATE TEAMMATE OUTFIELD PLAYERS (4) ──
    const teammateBodies: RAPIER.RigidBody[] = [];
    const teammateStartPositions = [
      new THREE.Vector3(-14, 1.25, 5),
      new THREE.Vector3(14, 1.25, 5),
      new THREE.Vector3(0, 1.25, -5),
      new THREE.Vector3(0, 1.25, 20),
    ];

    for (const pos of teammateStartPositions) {
      const char = new CyberCharacter(scene, world, pos, 'blue');
      this.teammateCharacters.push(char);
      teammateBodies.push(char.body);
    }

    // ── CREATE GOALKEEPERS ──
    // Player's goalkeeper (defends south goal at Z=+51)
    this.goalkeeperCharacter = new CyberCharacter(
      scene, world, new THREE.Vector3(0, 1.25, 48), 'yellow', true
    );
    this.playerGoalkeeper = this.goalkeeperCharacter.body;

    // Enemy goalkeeper (defends north goal at Z=-51)
    this.enemyGoalkeeperCharacter = new CyberCharacter(
      scene, world, new THREE.Vector3(0, 1.25, -48), 'yellow', true
    );
    this.enemyGoalkeeper = this.enemyGoalkeeperCharacter.body;

    // ── INITIALIZE AI SYSTEMS ──
    this.enemyAI = new EnemyTeamAI(world, enemyBodies, params);
    this.teammateAI = new TeammateAI(world, teammateBodies);
  }

  // ─────────────────────────────────────────────────────────
  // MAIN UPDATE
  // ─────────────────────────────────────────────────────────

  public update(deltaTime: number, ball: Ball, player: import('../entities/PlayerController').PlayerController) {
    const playerPos = player.camera.position.clone();
    const ballPos = new THREE.Vector3(
      ball.body.translation().x,
      ball.body.translation().y,
      ball.body.translation().z
    );

    // Get positions for cross-referencing
    const teammatePositions = this.teammateAI.getPositions();
    const enemyPositions = this.enemyAI.getPositions();

    // Track possession stats
    const possession = determinePossession(ballPos, playerPos, teammatePositions, enemyPositions);
    const gm = GameManager.getInstance();
    if (possession === 'player' || possession === 'teammate') {
      gm.playerPossessionTime += deltaTime;
    } else if (possession === 'enemy') {
      gm.enemyPossessionTime += deltaTime;
    }

    // Determine if player has ball
    const playerHasBall = flatDist(ballPos, playerPos) < 2.5;

    // ── UPDATE AI SYSTEMS ──
    this.enemyAI.update(deltaTime, ball, playerPos, teammatePositions);
    this.teammateAI.update(deltaTime, ball, playerPos, enemyPositions, playerHasBall);

    // ── UPDATE GOALKEEPERS ──
    this.updateGoalkeepers(deltaTime, ballPos);

    // ── SYNC VISUALS ──
    this.syncVisuals(deltaTime, ballPos);

    // ── CHECK FOR ENEMY GOAL ──
    this.checkEnemyGoal(ball, ballPos, player);
  }

  // ─────────────────────────────────────────────────────────
  // GOALKEEPER AI
  // ─────────────────────────────────────────────────────────

  private updateGoalkeepers(deltaTime: number, ballPos: THREE.Vector3) {
    this.goalkeeperTime += deltaTime;
    const goalieSpeed = 5.0;

    // Player's goalkeeper — defends south goal (Z=+48)
    {
      const pos = this.playerGoalkeeper.translation();
      const targetX = THREE.MathUtils.clamp(ballPos.x, -FIELD.GOAL_HW, FIELD.GOAL_HW);
      const dx = targetX - pos.x;
      const step = Math.sign(dx) * Math.min(Math.abs(dx), goalieSpeed * deltaTime);

      this.playerGoalkeeper.setNextKinematicTranslation({
        x: pos.x + step, y: 1.25, z: 48,
      });
    }

    // Enemy goalkeeper — defends north goal (Z=-48)
    {
      const pos = this.enemyGoalkeeper.translation();
      const targetX = THREE.MathUtils.clamp(ballPos.x, -FIELD.GOAL_HW, FIELD.GOAL_HW);
      const dx = targetX - pos.x;
      const step = Math.sign(dx) * Math.min(Math.abs(dx), goalieSpeed * deltaTime);

      this.enemyGoalkeeper.setNextKinematicTranslation({
        x: pos.x + step, y: 1.25, z: -48,
      });
    }
  }

  // ─────────────────────────────────────────────────────────
  // VISUAL SYNC
  // ─────────────────────────────────────────────────────────

  private syncVisuals(deltaTime: number, ballPos: THREE.Vector3) {
    // Enemy characters
    const enemySpeeds = this.enemyAI.getSpeeds();
    const enemyAngles = this.enemyAI.getFacingAngles(ballPos);
    for (let i = 0; i < this.enemyCharacters.length; i++) {
      const char = this.enemyCharacters[i];
      const pos = char.body.translation();
      char.group.position.set(pos.x, pos.y - 1.15, pos.z);
      char.group.rotation.y = enemyAngles[i];
      char.updateAnimation(enemySpeeds[i], deltaTime);
    }

    // Teammate characters
    const teamSpeeds = this.teammateAI.getSpeeds();
    const teamAngles = this.teammateAI.getFacingAngles(ballPos);
    for (let i = 0; i < this.teammateCharacters.length; i++) {
      const char = this.teammateCharacters[i];
      const pos = char.body.translation();
      char.group.position.set(pos.x, pos.y - 1.15, pos.z);
      char.group.rotation.y = teamAngles[i];
      char.updateAnimation(teamSpeeds[i], deltaTime);
    }

    // Goalkeepers
    {
      const pos = this.playerGoalkeeper.translation();
      this.goalkeeperCharacter.group.position.set(pos.x, pos.y - 1.15, pos.z);
      this.goalkeeperCharacter.group.rotation.y = 0;
      this.goalkeeperCharacter.updateAnimation(2.0, deltaTime);
    }
    {
      const pos = this.enemyGoalkeeper.translation();
      this.enemyGoalkeeperCharacter.group.position.set(pos.x, pos.y - 1.15, pos.z);
      this.enemyGoalkeeperCharacter.group.rotation.y = Math.PI;
      this.enemyGoalkeeperCharacter.updateAnimation(2.0, deltaTime);
    }
  }

  // ─────────────────────────────────────────────────────────
  // KICKOFF RESET (EITHER TEAM SCORES)
  // ─────────────────────────────────────────────────────────

  public resetKickoff(
    scoringTeam: 'player' | 'enemy',
    player: import('../entities/PlayerController').PlayerController,
    ball: Ball
  ) {
    // Play stadium crowd roar and goal celebration
    SoundManager.getInstance().playGoalRoar();
    if (this.particleSystem) {
      const goalZ = scoringTeam === 'player' ? -51 : 51;
      this.particleSystem.spawnGoalCelebration(new THREE.Vector3(0, 2.5, goalZ));
    }

    const banner = document.getElementById('goal-banner');
    if (banner) {
      banner.innerText = scoringTeam === 'player' ? 'GOAL! PINK FC SCORES!' : 'GOAL! VIOLET FC SCORES!';
      banner.style.display = 'block';
      banner.style.color = scoringTeam === 'player' ? '#ff1493' : '#7c3aed';
      setTimeout(() => {
        if (banner) banner.style.display = 'none';
      }, 2200);
    }

    const enemyScoreElem = document.getElementById('enemy-score');
    if (enemyScoreElem) enemyScoreElem.textContent = String(GameManager.getInstance().enemyScore);
    const scoreElem = document.getElementById('score');
    if (scoreElem) scoreElem.textContent = String(GameManager.getInstance().score);

    // Ball placed at center pitch
    ball.resetPosition(new THREE.Vector3(0, 0.6, 0));

    if (scoringTeam === 'player') {
      // Red Team (Enemy) conceded -> Red Team starts with ball at kickoff!
      const enemyKickoffPositions = [
        new THREE.Vector3(-12, 1.25, -16),
        new THREE.Vector3(12, 1.25, -16),
        new THREE.Vector3(0, 1.25, -1.2), // Striker ready at the center ball!
        new THREE.Vector3(-15, 1.25, -36),
        new THREE.Vector3(15, 1.25, -36),
      ];

      for (let i = 0; i < this.enemyCharacters.length; i++) {
        const char = this.enemyCharacters[i];
        const p = enemyKickoffPositions[i];
        char.body.setTranslation({ x: p.x, y: p.y, z: p.z }, true);
        char.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      }

      // Player starts back in blue territory
      player.resetPosition(new THREE.Vector3(0, 1.8, 14.0));

      // Teammates in their own half
      const teammateKickoffPositions = [
        new THREE.Vector3(-14, 1.25, 10),
        new THREE.Vector3(14, 1.25, 10),
        new THREE.Vector3(0, 1.25, 6),
        new THREE.Vector3(0, 1.25, 24),
      ];

      for (let i = 0; i < this.teammateCharacters.length; i++) {
        const char = this.teammateCharacters[i];
        const p = teammateKickoffPositions[i];
        char.body.setTranslation({ x: p.x, y: p.y, z: p.z }, true);
        char.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      }
    } else {
      // Blue Team (Player) conceded -> Blue Team starts with ball at kickoff!
      // Human Player positioned right at kickoff circle ready to play!
      player.resetPosition(new THREE.Vector3(0, 1.8, 1.5));

      // Teammates in their own half
      const teammateKickoffPositions = [
        new THREE.Vector3(-14, 1.25, 6),
        new THREE.Vector3(14, 1.25, 6),
        new THREE.Vector3(0, 1.25, 14),
        new THREE.Vector3(0, 1.25, 25),
      ];

      for (let i = 0; i < this.teammateCharacters.length; i++) {
        const char = this.teammateCharacters[i];
        const p = teammateKickoffPositions[i];
        char.body.setTranslation({ x: p.x, y: p.y, z: p.z }, true);
        char.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      }

      // Enemies placed back in their own half
      const enemyKickoffPositions = [
        new THREE.Vector3(-12, 1.25, -18),
        new THREE.Vector3(12, 1.25, -18),
        new THREE.Vector3(0, 1.25, -10),
        new THREE.Vector3(-15, 1.25, -38),
        new THREE.Vector3(15, 1.25, -38),
      ];

      for (let i = 0; i < this.enemyCharacters.length; i++) {
        const char = this.enemyCharacters[i];
        const p = enemyKickoffPositions[i];
        char.body.setTranslation({ x: p.x, y: p.y, z: p.z }, true);
        char.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      }
    }

    // Reset Goalkeepers
    this.playerGoalkeeper.setTranslation({ x: 0, y: 1.25, z: 48 }, true);
    this.enemyGoalkeeper.setTranslation({ x: 0, y: 1.25, z: -48 }, true);
  }

  // ─────────────────────────────────────────────────────────
  // ENEMY SCORING DETECTION
  // ─────────────────────────────────────────────────────────

  private checkEnemyGoal(ball: Ball, ballPos: THREE.Vector3, player: import('../entities/PlayerController').PlayerController) {
    // Enemy scores if ball enters player's goal (south, Z > 50.5)
    if (ballPos.z > 50.5 && Math.abs(ballPos.x) < FIELD.GOAL_HW && ballPos.y < 5.5) {
      const gm = GameManager.getInstance();
      gm.enemyScore += 1;
      this.resetKickoff('enemy', player, ball);
    }
  }

  public setVisible(visible: boolean) {
    for (const c of this.enemyCharacters) {
      c.group.visible = visible;
    }
    for (const c of this.teammateCharacters) {
      c.group.visible = visible;
    }
    this.goalkeeperCharacter.group.visible = visible;
    this.enemyGoalkeeperCharacter.group.visible = visible;

    const scoreboard = document.getElementById('scoreboard');
    if (scoreboard) {
      scoreboard.style.display = visible ? 'flex' : 'none';
    }
  }

  public getGoaliePositions(): THREE.Vector3[] {
    const p = this.playerGoalkeeper.translation();
    const e = this.enemyGoalkeeper.translation();
    return [
      new THREE.Vector3(p.x, p.y, p.z),
      new THREE.Vector3(e.x, e.y, e.z)
    ];
  }
}
