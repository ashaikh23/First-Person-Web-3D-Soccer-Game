import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { Ball } from '../entities/Ball';
import {
  FIELD, DifficultyParams,
  flatDist, clampToField, directionXZ,
  seekVelocity, avoidanceForce,
  opennessScore, passClearance, scorePassTarget,
  formationToWorld, findClosestIndex,
  FORMATION_4_1, FORMATION_3_2, FormationSlot,
  getFieldZone, FieldZone,
  determinePossession,
} from './SoccerAI';

/**
 * EnemyState Defines the current high-level behavior for an enemy AI player.
 */
export enum EnemyState {
  HOLD_POSITION,   // Return to formation slot
  PRESS_BALL,      // Sprint to the ball and tackle
  SUPPORT_ATTACK,  // Move into space ahead of ball carrier
  CARRY_BALL,      // Dribble the ball toward the player's goal (south, positive Z)
  PASS_BALL,       // Pass to a teammate in a better position
  MARK_OPPONENT,   // Shadow a player's teammate
  SHOOT,           // Close to goal, take a shot
}

/**
 * Interface representing a single enemy player managed by this AI.
 */
export interface EnemyPlayer {
  body: RAPIER.RigidBody;
  position: THREE.Vector3; // updated each frame from body.translation()
  role: 'defender' | 'midfielder' | 'attacker';
  state: EnemyState;
  stateTimer: number;
  formationTarget: THREE.Vector3;
  hasBall: boolean;
  passTimer: number;
  reactionTimer: number;
  stealCooldown: number;
  markIndex: number;
  supportTarget?: THREE.Vector3; // For holding the calculated support position
}

/**
 * EnemyTeamAI manages the entire opposing team's artificial intelligence.
 * It coordinates players based on possession, assigns states, and executes behaviors.
 * The enemy team attacks SOUTH (toward positive Z).
 */
export class EnemyTeamAI {
  public players: EnemyPlayer[] = [];
  private params: DifficultyParams;
  
  // The goal the enemy team is attacking (Player's goal at South end)
  private goalZ: number = FIELD.GOAL_Z_SOUTH;
  private attackingNorth: boolean = false; // Attacking south means attackingNorth is false

  /**
   * Initializes the enemy team AI.
   * @param world Rapier physical world instance.
   * @param bodies Array of exactly 5 outfield Rapier rigid bodies for the enemy team.
   * @param params DifficultyParams used to scale the AI behavior and capabilities.
   */
  constructor(world: RAPIER.World, bodies: RAPIER.RigidBody[], params: DifficultyParams) {
    this.params = params;

    // Initialize the enemy players
    bodies.forEach((body) => {
      const pos = body.translation();
      this.players.push({
        body: body,
        position: new THREE.Vector3(pos.x, pos.y, pos.z),
        role: 'defender', // Default, will be updated based on formation
        state: EnemyState.HOLD_POSITION,
        stateTimer: 0,
        formationTarget: new THREE.Vector3(pos.x, 0, pos.z),
        hasBall: false,
        passTimer: 0,
        reactionTimer: 0,
        stealCooldown: 0,
        markIndex: -1,
      });
    });
  }

  /**
   * Retrieves the current positions of all enemy players.
   */
  public getPositions(): THREE.Vector3[] {
    return this.players.map(p => p.position.clone());
  }

  /**
   * Retrieves movement speeds for all enemy players for animations.
   */
  public getSpeeds(): number[] {
    return this.players.map(p => {
      const v = p.body.linvel();
      return Math.hypot(v.x, v.z);
    });
  }

  /**
   * Retrieves facing angles (yaw) for all enemy players.
   */
  public getFacingAngles(ballPos?: THREE.Vector3): number[] {
    return this.players.map(p => {
      const v = p.body.linvel();
      const speed = Math.hypot(v.x, v.z);
      if (speed > 0.4) return Math.atan2(v.x, v.z);
      if (ballPos) {
        const dx = ballPos.x - p.position.x;
        const dz = ballPos.z - p.position.z;
        if (Math.hypot(dx, dz) > 0.1) return Math.atan2(dx, dz);
      }
      return 0;
    });
  }

  /**
   * Main update loop for the enemy team AI, called each frame.
   */
  public update(deltaTime: number, ball: Ball, playerPos: THREE.Vector3, teammatePositions: THREE.Vector3[]) {
    // 1. Update positions from physics bodies
    this.players.forEach(p => {
      const pos = p.body.translation();
      p.position.set(pos.x, pos.y, pos.z);
    });

    const ballPos = new THREE.Vector3().copy(ball.body.translation() as THREE.Vector3);
    const enemyPositions = this.getPositions();

    // 2. Determine possession
    const possession = determinePossession(ballPos, playerPos, teammatePositions, enemyPositions);

    // Update internal timers for each player
    this.players.forEach(p => {
      if (p.reactionTimer > 0) p.reactionTimer -= deltaTime;
      if (p.passTimer > 0) p.passTimer -= deltaTime;
      if (p.stealCooldown > 0) p.stealCooldown -= deltaTime;
      p.stateTimer += deltaTime;
    });

    // 3. Determine active formation based on possession
    let activeFormation = FORMATION_4_1; // Defending formation
    if (possession === 'enemy') {
      activeFormation = FORMATION_3_2; // Attacking formation
    }

    // Update player roles based on formation slots
    this.players.forEach((p, i) => {
      if (i < activeFormation.length) {
        p.role = activeFormation[i].role;
      }
    });

    // 4. Team Coordination (assign states based on situation)
    this.coordinateTeam(possession, ballPos, teammatePositions, activeFormation);

    // 5. Execute state behaviors for each player
    this.players.forEach((p, i) => {
      this.updatePlayer(p, i, deltaTime, ball, ballPos, playerPos, teammatePositions, enemyPositions, activeFormation);
    });
  }

  /**
   * Coordinates the team by making high-level strategic decisions and assigning states.
   */
  private coordinateTeam(
    possession: 'player' | 'teammate' | 'enemy' | 'loose',
    ballPos: THREE.Vector3,
    teammatePositions: THREE.Vector3[],
    formation: FormationSlot[]
  ) {
    // Sort players by distance to ball to determine who should press, carry, or support
    const distances = this.players.map((p, index) => {
      return { index, dist: flatDist(p.position, ballPos) };
    });
    distances.sort((a, b) => a.dist - b.dist);

    if (possession === 'enemy') {
      // An enemy has the ball. Determine exactly who.
      const carrierIndex = distances[0].dist <= 2.5 ? distances[0].index : -1;

      this.players.forEach((p, idx) => {
        // Skip state changes if still reacting
        if (p.reactionTimer > 0) return;

        if (idx === carrierIndex) {
          p.hasBall = true;
          // Carrier can be carrying, passing, or shooting
          if (p.state !== EnemyState.CARRY_BALL && p.state !== EnemyState.PASS_BALL && p.state !== EnemyState.SHOOT) {
            this.changeState(p, EnemyState.CARRY_BALL);
            p.passTimer = this.params.passFrequency;
          }
        } else {
          p.hasBall = false;
          // Support attack or hold position
          // Assign 1-2 others to SUPPORT_ATTACK
          const isSupport = (distances[1]?.index === idx || distances[2]?.index === idx);
          if (isSupport) {
            if (p.state !== EnemyState.SUPPORT_ATTACK) {
              this.changeState(p, EnemyState.SUPPORT_ATTACK);
            }
          } else {
            if (p.state !== EnemyState.HOLD_POSITION) {
              this.changeState(p, EnemyState.HOLD_POSITION);
            }
          }
        }
      });
    } else if (possession === 'loose') {
      // Loose ball: Nearest player goes to press/get it, others hold
      this.players.forEach((p, idx) => {
        if (p.reactionTimer > 0) return;
        p.hasBall = false;

        if (distances[0].index === idx) {
          if (p.state !== EnemyState.PRESS_BALL) {
            this.changeState(p, EnemyState.PRESS_BALL);
          }
        } else {
          if (p.state !== EnemyState.HOLD_POSITION) {
            this.changeState(p, EnemyState.HOLD_POSITION);
          }
        }
      });
    } else {
      // Player or teammate has the ball: Defend
      const pressersCount = Math.min(this.params.pressCount, this.players.length);
      
      this.players.forEach((p, idx) => {
        if (p.reactionTimer > 0) return;
        p.hasBall = false;

        let isPresser = false;
        for (let i = 0; i < pressersCount; i++) {
          if (distances[i].index === idx) isPresser = true;
        }

        if (isPresser) {
          if (p.state !== EnemyState.PRESS_BALL) {
            this.changeState(p, EnemyState.PRESS_BALL);
          }
        } else {
          if (p.state !== EnemyState.MARK_OPPONENT && p.state !== EnemyState.HOLD_POSITION) {
            // Assign some defenders to mark, others to hold formation
            if (Math.random() > 0.4 && teammatePositions.length > 0) {
              this.changeState(p, EnemyState.MARK_OPPONENT);
              // Pick a random teammate to mark for simplicity, or find closest
              p.markIndex = Math.floor(Math.random() * teammatePositions.length);
            } else {
              this.changeState(p, EnemyState.HOLD_POSITION);
            }
          }
        }
      });
    }
  }

  /**
   * Helper to change a player's state safely and reset timers.
   */
  private changeState(p: EnemyPlayer, newState: EnemyState) {
    if (p.state === newState) return;
    p.state = newState;
    p.stateTimer = 0;
    // When changing state, we add a slight reaction delay based on difficulty
    p.reactionTimer = this.params.reactionDelay * (0.5 + Math.random() * 0.5);
  }

  /**
   * Updates an individual player based on their current state.
   */
  private updatePlayer(
    p: EnemyPlayer,
    index: number,
    deltaTime: number,
    ball: Ball,
    ballPos: THREE.Vector3,
    playerPos: THREE.Vector3,
    teammatePositions: THREE.Vector3[],
    enemyPositions: THREE.Vector3[],
    formation: FormationSlot[]
  ) {
    // Collect opponents for avoidance and threat checks
    const opponents = [playerPos, ...teammatePositions];

    switch (p.state) {
      case EnemyState.HOLD_POSITION:
        this.handleHoldPosition(p, index, ballPos, opponents, formation);
        break;

      case EnemyState.PRESS_BALL:
        this.handlePressBall(p, ball, ballPos);
        break;

      case EnemyState.CARRY_BALL:
        this.handleCarryBall(p, deltaTime, ball, ballPos, opponents, enemyPositions);
        break;

      case EnemyState.PASS_BALL:
        this.handlePassBall(p, ball, ballPos, opponents, enemyPositions);
        break;

      case EnemyState.SUPPORT_ATTACK:
        this.handleSupportAttack(p, ballPos, opponents);
        break;

      case EnemyState.MARK_OPPONENT:
        this.handleMarkOpponent(p, ballPos, teammatePositions, playerPos);
        break;

      case EnemyState.SHOOT:
        this.handleShoot(p, ball, ballPos);
        break;
    }
  }

  // ─────────────────────────────────────────────────────────────
  // STATE HANDLERS
  // ─────────────────────────────────────────────────────────────

  private handleHoldPosition(
    p: EnemyPlayer,
    index: number,
    ballPos: THREE.Vector3,
    opponents: THREE.Vector3[],
    formation: FormationSlot[]
  ) {
    // 1. Calculate formation target
    const slot = formation[index];
    if (slot) {
      p.formationTarget = formationToWorld(slot, ballPos.z, this.attackingNorth, this.params.formationTightness);
    }

    // 2. Compute steering velocity to target
    const seek = seekVelocity(p.position, p.formationTarget, this.params.speed, 2.0);
    
    // 3. Avoid opponents slightly
    const avoid = avoidanceForce(p.position, opponents, 3.0, 1.5);

    // 4. Set final velocity
    const targetVel = {
      x: seek.x + avoid.x,
      z: seek.z + avoid.z
    };
    
    this.applyMovement(p, targetVel, this.params.speed);

    // 5. Opportunistic transition: If ball comes very close, just press it
    if (flatDist(p.position, ballPos) < 8.0 && p.reactionTimer <= 0) {
      this.changeState(p, EnemyState.PRESS_BALL);
    }
  }

  private handlePressBall(p: EnemyPlayer, ball: Ball, ballPos: THREE.Vector3) {
    const distToBall = flatDist(p.position, ballPos);
    
    // 1. Move towards ball at sprint speed
    const seek = seekVelocity(p.position, ballPos, this.params.sprintSpeed, 0.5);
    this.applyMovement(p, seek, this.params.sprintSpeed);

    // 2. Steal / Tackle logic
    if (distToBall < this.params.tackleRange && p.stealCooldown <= 0) {
      // Apply a small impulse to the ball to dislodge it
      const dir = directionXZ(p.position, ballPos);
      
      // We push the ball forward a bit
      const impulse = {
        x: dir.x * 3,
        y: 1, // slight pop up
        z: dir.z * 3
      };
      
      ball.body.applyImpulse(impulse, true);
      p.stealCooldown = 0.8; // Prevent spamming
      
      // Transition to carry since we just touched it
      this.changeState(p, EnemyState.CARRY_BALL);
    }
  }

  private handleCarryBall(
    p: EnemyPlayer,
    deltaTime: number,
    ball: Ball,
    ballPos: THREE.Vector3,
    opponents: THREE.Vector3[],
    enemyPositions: THREE.Vector3[]
  ) {
    const distToGoal = Math.abs(p.position.z - this.goalZ);

    // 1. Decide if we should pass or shoot
    if (p.passTimer <= 0) {
      p.passTimer = this.params.passFrequency; // reset timer

      // Check if we are close enough to shoot
      if (distToGoal < 20 && p.position.z > 20) {
        // High chance to shoot if in attacking zone
        if (Math.random() < 0.7) {
          this.changeState(p, EnemyState.SHOOT);
          return;
        }
      }

      // Check for a pass target
      const bestTargetIndex = this.findBestPassTarget(p.position, enemyPositions, opponents);
      if (bestTargetIndex !== -1) {
        this.changeState(p, EnemyState.PASS_BALL);
        return; // wait for next frame to execute pass
      }
    }

    // 2. Carry (Dribble) logic
    // Move towards goal
    const goalPos = new THREE.Vector3(0, 0, this.goalZ);
    const seek = seekVelocity(p.position, goalPos, this.params.speed, 2.0);
    
    // Avoid nearby opponents
    const avoid = avoidanceForce(p.position, opponents, 5.0, 4.0);

    const moveVel = {
      x: seek.x + avoid.x,
      z: seek.z + avoid.z
    };
    
    this.applyMovement(p, moveVel, this.params.speed);

    // 3. AI Dribbling: manipulate the ball physics
    // Keep ball near the carrier's feet
    const carrierVel = p.body.linvel();
    // A small push forward relative to carrier
    const dribblePush = 2.0;
    const forwardDir = directionXZ(new THREE.Vector3(0,0,0), new THREE.Vector3(carrierVel.x, 0, carrierVel.z));
    
    ball.body.setLinvel({
      x: carrierVel.x + forwardDir.x * dribblePush,
      y: ball.body.linvel().y, // preserve gravity/bouncing
      z: carrierVel.z + forwardDir.z * dribblePush
    }, true);
    
    // Small stabilizing impulse to pull ball slightly to center if it drifts
    const dx = p.position.x - ballPos.x;
    const dz = p.position.z - ballPos.z;
    if (Math.hypot(dx, dz) > 1.0) {
        ball.body.applyImpulse({ x: dx * 0.5, y: 0, z: dz * 0.5 }, true);
    }
  }

  private handlePassBall(
    p: EnemyPlayer,
    ball: Ball,
    ballPos: THREE.Vector3,
    opponents: THREE.Vector3[],
    enemyPositions: THREE.Vector3[]
  ) {
    const bestTargetIndex = this.findBestPassTarget(p.position, enemyPositions, opponents);
    
    if (bestTargetIndex !== -1) {
      const targetPos = enemyPositions[bestTargetIndex];
      let passDir = directionXZ(p.position, targetPos);
      
      // Apply accuracy (add random angle if accuracy is low)
      const accuracy = this.params.passAccuracy;
      const spread = (1.0 - accuracy) * 0.5; // Max 0.5 radians spread
      const randomAngle = (Math.random() - 0.5) * spread;
      
      // Rotate passDir by randomAngle
      const cosA = Math.cos(randomAngle);
      const sinA = Math.sin(randomAngle);
      const finalDirX = passDir.x * cosA - passDir.z * sinA;
      const finalDirZ = passDir.x * sinA + passDir.z * cosA;

      const passSpeed = 12.0 + Math.random() * 4.0;
      
      ball.body.setLinvel({
        x: finalDirX * passSpeed,
        y: 1.5, // Slight chip
        z: finalDirZ * passSpeed
      }, true);
    }
    
    // Stop moving this frame
    this.applyMovement(p, { x: 0, z: 0 }, 0);
    
    // Transition to support attack
    this.changeState(p, EnemyState.SUPPORT_ATTACK);
  }

  private handleSupportAttack(p: EnemyPlayer, ballPos: THREE.Vector3, opponents: THREE.Vector3[]) {
    // Recalculate support position every 1.5 seconds
    if (p.stateTimer > 1.5 || !p.supportTarget) {
      p.supportTarget = this.calculateSupportPosition(p.position, ballPos, opponents);
      p.stateTimer = 0;
    }

    const seek = seekVelocity(p.position, p.supportTarget, this.params.speed, 1.0);
    const avoid = avoidanceForce(p.position, opponents, 4.0, 2.0);

    const moveVel = {
      x: seek.x + avoid.x,
      z: seek.z + avoid.z
    };

    this.applyMovement(p, moveVel, this.params.speed);
  }

  private handleMarkOpponent(
    p: EnemyPlayer,
    ballPos: THREE.Vector3,
    teammatePositions: THREE.Vector3[],
    playerPos: THREE.Vector3
  ) {
    let targetToMark = playerPos;
    if (p.markIndex >= 0 && p.markIndex < teammatePositions.length) {
      targetToMark = teammatePositions[p.markIndex];
    }

    // Position oneself between the marked target and our goal
    const myGoal = new THREE.Vector3(0, 0, -this.goalZ); // Defending goal is opposite of attacking goal
    const dirToGoal = directionXZ(targetToMark, myGoal);
    
    // Stay ~3 units goal-side of the marked player
    const markPos = new THREE.Vector3(
      targetToMark.x + dirToGoal.x * 3.0,
      0,
      targetToMark.z + dirToGoal.z * 3.0
    );

    const seek = seekVelocity(p.position, markPos, this.params.speed, 0.5);
    this.applyMovement(p, seek, this.params.speed);

    // If ball comes close, break off mark and press
    if (flatDist(p.position, ballPos) < 6.0 && p.reactionTimer <= 0) {
      this.changeState(p, EnemyState.PRESS_BALL);
    }
  }

  private handleShoot(p: EnemyPlayer, ball: Ball, ballPos: THREE.Vector3) {
    // Target the center of the player's goal
    const goalCenter = new THREE.Vector3(0, 0, this.goalZ);
    let shootDir = directionXZ(p.position, goalCenter);

    // Apply some slight randomness to the shot based on difficulty
    const spread = (1.0 - this.params.positioningIQ) * 0.3;
    const randomAngle = (Math.random() - 0.5) * spread;
    const cosA = Math.cos(randomAngle);
    const sinA = Math.sin(randomAngle);
    const finalDirX = shootDir.x * cosA - shootDir.z * sinA;
    const finalDirZ = shootDir.x * sinA + shootDir.z * cosA;

    const power = this.params.shootPower + (Math.random() * 4.0);

    // Set linear velocity directly for a strong shot
    ball.body.setLinvel({
      x: finalDirX * power,
      y: 2.0, // lift the shot slightly
      z: finalDirZ * power
    }, true);

    this.applyMovement(p, { x: 0, z: 0 }, 0);
    this.changeState(p, EnemyState.HOLD_POSITION);
  }

  // ─────────────────────────────────────────────────────────────
  // HELPER METHODS
  // ─────────────────────────────────────────────────────────────

  /**
   * Applies clamped velocity to the physics body.
   */
  private applyMovement(p: EnemyPlayer, desiredVel: { x: number, z: number }, maxSpeed: number) {
    const len = Math.hypot(desiredVel.x, desiredVel.z);
    let vx = desiredVel.x;
    let vz = desiredVel.z;
    
    // Cap at maxSpeed
    if (len > maxSpeed) {
      vx = (vx / len) * maxSpeed;
      vz = (vz / len) * maxSpeed;
    }

    // Preserve Y velocity for gravity
    const currentY = p.body.linvel().y;
    p.body.setLinvel({ x: vx, y: currentY, z: vz }, true);
  }

  /**
   * Finds the best teammate to pass to based on multiple tactical factors.
   * Returns the index of the best teammate, or -1 if no good pass found.
   */
  private findBestPassTarget(
    carrierPos: THREE.Vector3,
    enemyPositions: THREE.Vector3[],
    opponents: THREE.Vector3[]
  ): number {
    let bestIndex = -1;
    let bestScore = -999;

    for (let i = 0; i < enemyPositions.length; i++) {
      const target = enemyPositions[i];
      if (flatDist(carrierPos, target) < 1.0) continue; // skip self

      const score = scorePassTarget(carrierPos, target, opponents, this.goalZ, this.params.positioningIQ);
      
      // We only consider it a valid pass if score is high enough (e.g., > 0.3)
      if (score > 0.3 && score > bestScore) {
        bestScore = score;
        bestIndex = i;
      }
    }

    return bestIndex;
  }

  /**
   * Calculates a good supporting position for an attacking player.
   */
  private calculateSupportPosition(
    pPos: THREE.Vector3,
    ballPos: THREE.Vector3,
    opponents: THREE.Vector3[]
  ): THREE.Vector3 {
    // Support target: roughly 10-15 units ahead of ball carrier, somewhat wide
    // Attacking south = positive Z
    
    // Choose a random lane or offset
    const sideOffset = (Math.random() - 0.5) * 20.0;
    const forwardOffset = 8.0 + Math.random() * 10.0;
    
    const targetX = ballPos.x + sideOffset;
    const targetZ = ballPos.z + forwardOffset; // + because attacking South

    const clamped = clampToField(targetX, targetZ, 4.0);
    const target = new THREE.Vector3(clamped.x, 0, clamped.z);

    // Verify it's open, if not, adjust back slightly
    const open = opennessScore(target, opponents, 5.0);
    if (open < 0.5) {
      target.z -= 5.0; // fall back a bit if well defended
      const clampedFallback = clampToField(target.x, target.z, 4.0);
      target.set(clampedFallback.x, 0, clampedFallback.z);
    }

    return target;
  }
}
