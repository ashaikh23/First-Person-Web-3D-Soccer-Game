import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { Ball } from '../entities/Ball';
import {
  FIELD, DifficultyParams,
  flatDist, clampToField, directionXZ,
  seekVelocity, avoidanceForce,
  opennessScore, passClearance, scorePassTarget,
  formationToWorld, findClosestIndex,
  TEAMMATE_FORMATION, FormationSlot,
  determinePossession,
} from './SoccerAI';

// ─────────────────────────────────────────────────────────────
// TEAMMATE STATE MACHINE
// ─────────────────────────────────────────────────────────────
enum TeammateState {
  HOLD_POSITION,     // Return to / hold formation slot
  SUPPORT_RUN,       // Make a run into open space to receive a pass
  RECEIVE_BALL,      // Ball is coming toward me — move to intercept
  CARRY_FORWARD,     // I have the ball, dribble toward enemy goal
  LOOK_TO_PASS,      // I have the ball, looking for a pass option
  PASS_TO_PLAYER,    // Pass back to the human player
  PASS_TO_TEAMMATE,  // Pass to another teammate
  RETREAT,           // Ball lost, get back into defensive shape
}

// ─────────────────────────────────────────────────────────────
// TEAMMATE PLAYER DATA
// ─────────────────────────────────────────────────────────────
interface TeammatePlayer {
  body: RAPIER.RigidBody;
  position: THREE.Vector3;
  role: 'defender' | 'midfielder' | 'attacker';
  state: TeammateState;
  stateTimer: number;
  formationTarget: THREE.Vector3;
  hasBall: boolean;
  passTimer: number;
  carryTimer: number;           // how long carrying before looking to pass
  supportTarget: THREE.Vector3; // dynamic target for support runs
  assignedSlot: FormationSlot;
}

// ─────────────────────────────────────────────────────────────
// TEAMMATE TEAM AI
// ─────────────────────────────────────────────────────────────
export class TeammateAI {
  private teammates: TeammatePlayer[] = [];
  private readonly DRIBBLE_SPEED = 6.5;
  private readonly RUN_SPEED = 9.0;
  private readonly PASS_SPEED = 20.0;
  private readonly BALL_CONTROL_RADIUS = 3.0;
  private readonly MAX_CARRY_TIME = 1.8;  // seconds before looking to pass

  // Cooldown to prevent pass spam
  private globalPassCooldown = 0;
  private readonly PASS_COOLDOWN = 0.6;

  constructor(world: RAPIER.World, bodies: RAPIER.RigidBody[]) {
    for (let i = 0; i < bodies.length; i++) {
      const slot = TEAMMATE_FORMATION[i];
      const pos = bodies[i].translation();
      this.teammates.push({
        body: bodies[i],
        position: new THREE.Vector3(pos.x, pos.y, pos.z),
        role: slot.role,
        state: TeammateState.HOLD_POSITION,
        stateTimer: 0,
        formationTarget: new THREE.Vector3(),
        hasBall: false,
        passTimer: 0,
        carryTimer: 0,
        supportTarget: new THREE.Vector3(),
        assignedSlot: slot,
      });
    }
  }

  // ─────────────────────────────────────────────────────────
  // PUBLIC API
  // ─────────────────────────────────────────────────────────

  /** Get current positions for external use (e.g., by enemy AI). */
  public getPositions(): THREE.Vector3[] {
    return this.teammates.map(t => t.position.clone());
  }

  /** Get speeds for animation (how fast each teammate is moving). */
  public getSpeeds(): number[] {
    return this.teammates.map(t => {
      const v = t.body.linvel();
      return Math.hypot(v.x, v.z);
    });
  }

  /** Get facing angles for visual rotation. */
  public getFacingAngles(ballPos?: THREE.Vector3): number[] {
    return this.teammates.map(t => {
      const v = t.body.linvel();
      const speed = Math.hypot(v.x, v.z);
      if (speed > 0.4) return Math.atan2(v.x, v.z);
      if (ballPos) {
        const dx = ballPos.x - t.position.x;
        const dz = ballPos.z - t.position.z;
        if (Math.hypot(dx, dz) > 0.1) return Math.atan2(dx, dz);
      }
      return 0;
    });
  }

  /** Called by the player when they press 'E' or RMB to pass.
   *  Returns the index of the best teammate to pass to, with crosshair aim prioritization. */
  public findBestPassTarget(
    playerPos: THREE.Vector3,
    enemyPositions: THREE.Vector3[],
    playerLookDir?: THREE.Vector3
  ): number {
    let bestIdx = -1;
    let bestScore = -Infinity;

    for (let i = 0; i < this.teammates.length; i++) {
      const t = this.teammates[i];
      let score = scorePassTarget(
        playerPos, t.position, enemyPositions,
        FIELD.GOAL_Z_NORTH, // attacking north
        0.85
      );

      // If player is aiming toward this teammate, give huge directional bonus
      if (playerLookDir) {
        const toTeammate = new THREE.Vector3(t.position.x - playerPos.x, 0, t.position.z - playerPos.z).normalize();
        const dot = toTeammate.dot(playerLookDir);
        if (dot > 0.3) {
          score += dot * 2.0; // Priority to targeted teammate
        }
      }

      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }

    return bestIdx >= 0 ? bestIdx : 0;
  }

  /** Notify that a pass has been sent to a specific teammate. */
  public notifyPassIncoming(index: number) {
    if (index >= 0 && index < this.teammates.length) {
      this.teammates[index].state = TeammateState.RECEIVE_BALL;
      this.teammates[index].stateTimer = 0;
    }
  }

  // ─────────────────────────────────────────────────────────
  // MAIN UPDATE
  // ─────────────────────────────────────────────────────────

  public update(
    deltaTime: number,
    ball: Ball,
    playerPos: THREE.Vector3,
    enemyPositions: THREE.Vector3[],
    playerHasBall: boolean
  ) {
    // Tick cooldown
    if (this.globalPassCooldown > 0) {
      this.globalPassCooldown -= deltaTime;
    }

    const ballPos = new THREE.Vector3(
      ball.body.translation().x,
      ball.body.translation().y,
      ball.body.translation().z
    );

    // 1. Update all positions from physics
    for (const t of this.teammates) {
      const p = t.body.translation();
      t.position.set(p.x, p.y, p.z);
    }

    // 2. Determine who has the ball
    this.updateBallPossession(ballPos);

    // 3. Calculate formation targets
    this.updateFormationTargets(ballPos);

    // 4. Decide states based on game situation
    this.decideTeamStates(ballPos, playerPos, enemyPositions, playerHasBall);

    // 5. Execute per-player state behavior
    for (let i = 0; i < this.teammates.length; i++) {
      this.updatePlayer(i, deltaTime, ball, ballPos, playerPos, enemyPositions);
    }
  }

  // ─────────────────────────────────────────────────────────
  // BALL POSSESSION
  // ─────────────────────────────────────────────────────────

  private updateBallPossession(ballPos: THREE.Vector3) {
    for (const t of this.teammates) {
      t.hasBall = flatDist(ballPos, t.position) < this.BALL_CONTROL_RADIUS;
    }
    // Only the closest one truly "has" it
    let closestIdx = -1;
    let closestDist = Infinity;
    for (let i = 0; i < this.teammates.length; i++) {
      if (this.teammates[i].hasBall) {
        const d = flatDist(ballPos, this.teammates[i].position);
        if (d < closestDist) {
          closestDist = d;
          closestIdx = i;
        }
      }
    }
    for (let i = 0; i < this.teammates.length; i++) {
      this.teammates[i].hasBall = (i === closestIdx);
    }
  }

  // ─────────────────────────────────────────────────────────
  // FORMATION TARGETS
  // ─────────────────────────────────────────────────────────

  private updateFormationTargets(ballPos: THREE.Vector3) {
    for (const t of this.teammates) {
      t.formationTarget = formationToWorld(
        t.assignedSlot, ballPos.z, true, 0.7
      );
    }
  }

  // ─────────────────────────────────────────────────────────
  // TEAM STATE DECISIONS
  // ─────────────────────────────────────────────────────────

  private decideTeamStates(
    ballPos: THREE.Vector3,
    playerPos: THREE.Vector3,
    enemyPositions: THREE.Vector3[],
    playerHasBall: boolean
  ) {
    const anyTeammateHasBall = this.teammates.some(t => t.hasBall);

    for (let i = 0; i < this.teammates.length; i++) {
      const t = this.teammates[i];

      // Don't override RECEIVE_BALL or active passing states
      if (t.state === TeammateState.RECEIVE_BALL && t.stateTimer < 3.0) continue;
      if (t.state === TeammateState.PASS_TO_PLAYER && t.stateTimer < 0.5) continue;
      if (t.state === TeammateState.PASS_TO_TEAMMATE && t.stateTimer < 0.5) continue;

      if (t.hasBall) {
        // I have the ball!
        if (t.carryTimer > this.MAX_CARRY_TIME) {
          // Been carrying too long — look to pass
          t.state = TeammateState.LOOK_TO_PASS;
          t.carryTimer = 0;
        } else if (t.state !== TeammateState.CARRY_FORWARD && t.state !== TeammateState.LOOK_TO_PASS) {
          t.state = TeammateState.CARRY_FORWARD;
          t.carryTimer = 0;
        }
      } else if (playerHasBall || anyTeammateHasBall) {
        // Our team has the ball — make support runs
        if (t.state !== TeammateState.SUPPORT_RUN) {
          t.state = TeammateState.SUPPORT_RUN;
          t.stateTimer = 0;
          this.calculateSupportTarget(i, ballPos, playerPos, enemyPositions);
        } else if (t.stateTimer > 2.5) {
          // Recalculate support position periodically
          t.stateTimer = 0;
          this.calculateSupportTarget(i, ballPos, playerPos, enemyPositions);
        }
      } else {
        // Ball is loose or enemy has it — retreat to formation
        if (t.state !== TeammateState.RETREAT) {
          t.state = TeammateState.RETREAT;
          t.stateTimer = 0;
        }
      }
    }
  }

  // ─────────────────────────────────────────────────────────
  // SUPPORT RUN TARGET CALCULATION
  // ─────────────────────────────────────────────────────────

  /** Find an optimal position for a teammate to run to for receiving a pass. */
  private calculateSupportTarget(
    index: number,
    ballPos: THREE.Vector3,
    playerPos: THREE.Vector3,
    enemyPositions: THREE.Vector3[]
  ) {
    const t = this.teammates[index];
    
    // Generate candidate positions in a fan ahead of the ball
    let bestPos = t.formationTarget.clone();
    let bestScore = -Infinity;

    const numCandidates = 12;
    for (let c = 0; c < numCandidates; c++) {
      // Random offset from formation target, biased forward (negative Z = toward enemy goal)
      const angle = (c / numCandidates) * Math.PI * 2;
      const radius = 8 + Math.random() * 12;
      const candidateX = ballPos.x + Math.cos(angle) * radius;
      const candidateZ = ballPos.z + Math.sin(angle) * radius - 5; // bias forward

      const clamped = clampToField(candidateX, candidateZ, 4);
      const candidatePos = new THREE.Vector3(clamped.x, 0, clamped.z);

      // Score this position
      const openness = opennessScore(candidatePos, enemyPositions, 6.0);
      
      // Forward progress (more negative Z = closer to enemy goal = better)
      const forwardScore = THREE.MathUtils.clamp(
        (ballPos.z - candidatePos.z) / 25.0, -0.2, 1.0
      );

      // Pass clearance from ball carrier
      const passer = playerPos; // or ballPos
      const clearance = passClearance(passer, candidatePos, enemyPositions, 2.0);

      // Distance from ball — not too close, not too far
      const dist = flatDist(ballPos, candidatePos);
      const distScore = dist > 8 && dist < 25 ? 1.0 : dist > 5 ? 0.6 : 0.3;

      // Width score — prefer spreading wide
      const widthScore = Math.abs(candidateX) / FIELD.HW;

      // Don't overlap with other teammates
      let overlapPenalty = 0;
      for (let j = 0; j < this.teammates.length; j++) {
        if (j === index) continue;
        const otherTarget = this.teammates[j].state === TeammateState.SUPPORT_RUN
          ? this.teammates[j].supportTarget
          : this.teammates[j].position;
        if (flatDist(candidatePos, otherTarget) < 6) {
          overlapPenalty += 0.3;
        }
      }

      const score = openness * 0.3 + forwardScore * 0.25 + clearance * 0.2
                   + distScore * 0.15 + widthScore * 0.1 - overlapPenalty;

      if (score > bestScore) {
        bestScore = score;
        bestPos = candidatePos;
      }
    }

    t.supportTarget = bestPos;
  }

  // ─────────────────────────────────────────────────────────
  // PER-PLAYER STATE EXECUTION
  // ─────────────────────────────────────────────────────────

  private updatePlayer(
    index: number,
    deltaTime: number,
    ball: Ball,
    ballPos: THREE.Vector3,
    playerPos: THREE.Vector3,
    enemyPositions: THREE.Vector3[]
  ) {
    const t = this.teammates[index];
    t.stateTimer += deltaTime;

    switch (t.state) {
      case TeammateState.HOLD_POSITION:
        this.executeHoldPosition(t, deltaTime);
        break;
      case TeammateState.SUPPORT_RUN:
        this.executeSupportRun(t, deltaTime, enemyPositions);
        break;
      case TeammateState.RECEIVE_BALL:
        this.executeReceiveBall(t, deltaTime, ball, ballPos);
        break;
      case TeammateState.CARRY_FORWARD:
        this.executeCarryForward(t, index, deltaTime, ball, ballPos, enemyPositions);
        break;
      case TeammateState.LOOK_TO_PASS:
        this.executeLookToPass(t, index, deltaTime, ball, ballPos, playerPos, enemyPositions);
        break;
      case TeammateState.PASS_TO_PLAYER:
        this.executePassToPlayer(t, deltaTime, ball, playerPos);
        break;
      case TeammateState.PASS_TO_TEAMMATE:
        this.executePassToTeammate(t, deltaTime, ball);
        break;
      case TeammateState.RETREAT:
        this.executeRetreat(t, deltaTime);
        break;
    }
  }

  // ─────────────────────────────────────────────────────────
  // STATE: HOLD POSITION
  // ─────────────────────────────────────────────────────────

  private executeHoldPosition(t: TeammatePlayer, deltaTime: number) {
    const vel = seekVelocity(t.position, t.formationTarget, this.RUN_SPEED, 1.5);
    const currentVel = t.body.linvel();
    t.body.setLinvel({ x: vel.x, y: currentVel.y, z: vel.z }, true);
  }

  // ─────────────────────────────────────────────────────────
  // STATE: SUPPORT RUN
  // ─────────────────────────────────────────────────────────

  private executeSupportRun(
    t: TeammatePlayer,
    deltaTime: number,
    enemyPositions: THREE.Vector3[]
  ) {
    // Move toward support target while avoiding enemies
    const vel = seekVelocity(t.position, t.supportTarget, this.RUN_SPEED, 2.0);
    const avoid = avoidanceForce(t.position, enemyPositions, 4.0, 2.0);

    const currentVel = t.body.linvel();
    t.body.setLinvel({
      x: vel.x + avoid.x,
      y: currentVel.y,
      z: vel.z + avoid.z,
    }, true);
  }

  // ─────────────────────────────────────────────────────────
  // STATE: RECEIVE BALL
  // ─────────────────────────────────────────────────────────

  // ─────────────────────────────────────────────────────────
  // STATE: RECEIVE BALL
  // ─────────────────────────────────────────────────────────

  private executeReceiveBall(
    t: TeammatePlayer,
    deltaTime: number,
    ball: Ball,
    ballPos: THREE.Vector3
  ) {
    // Sprint aggressively to intercept and trap incoming pass
    const ballVel = ball.body.linvel();
    const predictedPos = new THREE.Vector3(
      ballPos.x + ballVel.x * 0.35,
      0,
      ballPos.z + ballVel.z * 0.35
    );

    const vel = seekVelocity(t.position, predictedPos, this.RUN_SPEED * 1.25, 0.5);
    const currentVel = t.body.linvel();
    t.body.setLinvel({ x: vel.x, y: currentVel.y, z: vel.z }, true);

    // If ball arrived, trap cleanly and immediately evaluate return pass
    if (flatDist(ballPos, t.position) < this.BALL_CONTROL_RADIUS) {
      ball.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      t.hasBall = true;
      t.state = TeammateState.LOOK_TO_PASS;
      t.stateTimer = 0;
      t.carryTimer = 0;
    }

    // Timeout — ball missed
    if (t.stateTimer > 3.5) {
      t.state = TeammateState.HOLD_POSITION;
      t.stateTimer = 0;
    }
  }

  // ─────────────────────────────────────────────────────────
  // STATE: CARRY FORWARD
  // ─────────────────────────────────────────────────────────

  private executeCarryForward(
    t: TeammatePlayer,
    index: number,
    deltaTime: number,
    ball: Ball,
    ballPos: THREE.Vector3,
    enemyPositions: THREE.Vector3[]
  ) {
    if (!t.hasBall) {
      t.state = TeammateState.SUPPORT_RUN;
      t.stateTimer = 0;
      return;
    }

    t.carryTimer += deltaTime;

    // Target: move toward enemy goal (negative Z) while avoiding enemies
    const goalDir = new THREE.Vector3(0, 0, -1); // toward enemy goal (north)

    // Add avoidance to dodge nearby enemies
    const avoid = avoidanceForce(t.position, enemyPositions, 5.0, 3.0);

    // Combine forward + avoidance
    const moveX = goalDir.x * this.DRIBBLE_SPEED + avoid.x;
    const moveZ = goalDir.z * this.DRIBBLE_SPEED + avoid.z;

    const currentVel = t.body.linvel();
    t.body.setLinvel({ x: moveX, y: currentVel.y, z: moveZ }, true);

    // Dribble the ball: set ball velocity to match carrier + slight forward bias
    const bv = ball.body.linvel();
    ball.body.setLinvel({
      x: THREE.MathUtils.lerp(bv.x, moveX * 1.05, 0.3),
      y: bv.y,
      z: THREE.MathUtils.lerp(bv.z, moveZ * 1.05, 0.3),
    }, true);

    // Check if under pressure — enemy close by
    const nearestEnemyDist = this.nearestDist(t.position, enemyPositions);
    if (nearestEnemyDist < 4.0 || t.carryTimer > this.MAX_CARRY_TIME) {
      t.state = TeammateState.LOOK_TO_PASS;
      t.stateTimer = 0;
    }
  }

  // ─────────────────────────────────────────────────────────
  // STATE: LOOK TO PASS
  // ─────────────────────────────────────────────────────────

  private executeLookToPass(
    t: TeammatePlayer,
    index: number,
    deltaTime: number,
    ball: Ball,
    ballPos: THREE.Vector3,
    playerPos: THREE.Vector3,
    enemyPositions: THREE.Vector3[]
  ) {
    if (!t.hasBall) {
      t.state = TeammateState.SUPPORT_RUN;
      return;
    }

    if (this.globalPassCooldown > 0) {
      this.holdBall(t, ball);
      return;
    }

    // Slow down while deciding
    const cv = t.body.linvel();
    t.body.setLinvel({ x: cv.x * 0.85, y: cv.y, z: cv.z * 0.85 }, true);
    this.holdBall(t, ball);

    // Evaluate pass to player
    const playerScore = scorePassTarget(
      t.position, playerPos, enemyPositions,
      FIELD.GOAL_Z_NORTH, 0.85
    );

    // Evaluate pass to each teammate
    let bestTeammateIdx = -1;
    let bestTeammateScore = -Infinity;
    for (let j = 0; j < this.teammates.length; j++) {
      if (j === index) continue;
      const score = scorePassTarget(
        t.position, this.teammates[j].position, enemyPositions,
        FIELD.GOAL_Z_NORTH, 0.75
      );
      if (score > bestTeammateScore) {
        bestTeammateScore = score;
        bestTeammateIdx = j;
      }
    }

    // Prefer 1-2 return pass to player
    if (playerScore > -0.2) {
      t.state = TeammateState.PASS_TO_PLAYER;
      t.stateTimer = 0;
    } else if (bestTeammateIdx >= 0 && bestTeammateScore > 0.1) {
      this.teammates[bestTeammateIdx].state = TeammateState.RECEIVE_BALL;
      this.teammates[bestTeammateIdx].stateTimer = 0;
      t.state = TeammateState.PASS_TO_TEAMMATE;
      t.stateTimer = 0;
      t.passTimer = bestTeammateIdx;
    } else {
      t.state = TeammateState.CARRY_FORWARD;
      t.carryTimer = 0;
    }
  }

  // ─────────────────────────────────────────────────────────
  // STATE: PASS TO PLAYER
  // ─────────────────────────────────────────────────────────

  private executePassToPlayer(
    t: TeammatePlayer,
    deltaTime: number,
    ball: Ball,
    playerPos: THREE.Vector3
  ) {
    if (t.stateTimer < 0.1) return; // instant crisp release

    // Execute crisp ground pass directly to player
    const dir = directionXZ(t.position, playerPos);
    const dist = flatDist(t.position, playerPos);
    const passSpeed = Math.min(this.PASS_SPEED, dist * 1.1 + 8.0);

    ball.body.setLinvel({
      x: dir.x * passSpeed,
      y: 0.1,
      z: dir.z * passSpeed,
    }, true);

    this.globalPassCooldown = this.PASS_COOLDOWN;
    t.hasBall = false;
    t.state = TeammateState.SUPPORT_RUN;
    t.stateTimer = 0;
    t.carryTimer = 0;
  }

  // ─────────────────────────────────────────────────────────
  // STATE: PASS TO TEAMMATE
  // ─────────────────────────────────────────────────────────

  private executePassToTeammate(
    t: TeammatePlayer,
    deltaTime: number,
    ball: Ball
  ) {
    if (t.stateTimer < 0.15) return; // brief wind-up

    const targetIdx = Math.round(t.passTimer);
    if (targetIdx < 0 || targetIdx >= this.teammates.length) {
      t.state = TeammateState.HOLD_POSITION;
      return;
    }

    const target = this.teammates[targetIdx];
    const dir = directionXZ(t.position, target.position);
    const dist = flatDist(t.position, target.position);
    const passSpeed = Math.min(this.PASS_SPEED, dist * 0.7 + 3.0);

    // Add slight inaccuracy
    const noise = (Math.random() - 0.5) * 0.15;
    ball.body.setLinvel({
      x: (dir.x + noise) * passSpeed,
      y: 0.2,
      z: (dir.z + noise) * passSpeed,
    }, true);

    this.globalPassCooldown = this.PASS_COOLDOWN;
    t.hasBall = false;
    t.state = TeammateState.SUPPORT_RUN;
    t.stateTimer = 0;
    t.carryTimer = 0;
  }

  // ─────────────────────────────────────────────────────────
  // STATE: RETREAT
  // ─────────────────────────────────────────────────────────

  private executeRetreat(t: TeammatePlayer, deltaTime: number) {
    // Move back to formation position at sprint speed
    const vel = seekVelocity(t.position, t.formationTarget, this.RUN_SPEED * 1.1, 2.0);
    const currentVel = t.body.linvel();
    t.body.setLinvel({ x: vel.x, y: currentVel.y, z: vel.z }, true);
  }

  // ─────────────────────────────────────────────────────────
  // HELPERS
  // ─────────────────────────────────────────────────────────

  /** Keep the ball close to the carrier without letting it drift. */
  private holdBall(t: TeammatePlayer, ball: Ball) {
    const bv = ball.body.linvel();
    const tv = t.body.linvel();
    ball.body.setLinvel({
      x: THREE.MathUtils.lerp(bv.x, tv.x, 0.4),
      y: bv.y,
      z: THREE.MathUtils.lerp(bv.z, tv.z, 0.4),
    }, true);
  }

  /** Find distance to nearest position in a list. */
  private nearestDist(pos: THREE.Vector3, others: THREE.Vector3[]): number {
    let min = Infinity;
    for (const o of others) {
      min = Math.min(min, flatDist(pos, o));
    }
    return min;
  }
}
