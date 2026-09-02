import * as THREE from 'three';
import { Difficulty } from '../state/GameManager';

// ─────────────────────────────────────────────────────────────
// FIELD CONSTANTS
// ─────────────────────────────────────────────────────────────
export const FIELD = {
  W: 70,          // total width
  L: 110,         // total length
  HW: 35,         // half width
  HL: 55,         // half length
  GOAL_W: 16,     // goal opening width
  GOAL_HW: 8,     // half goal width
  GOAL_Z_NORTH: -51,  // opponent goal line z
  GOAL_Z_SOUTH: 51,   // player goal line z
  PENALTY_DEPTH: 14,
  CENTER: new THREE.Vector3(0, 0, 0),
} as const;

// ─────────────────────────────────────────────────────────────
// DIFFICULTY PARAMETERS
// ─────────────────────────────────────────────────────────────
export interface DifficultyParams {
  speed: number;
  sprintSpeed: number;
  reactionDelay: number;    // seconds before reacting to ball change
  tackleRange: number;
  passAccuracy: number;     // 0-1, higher = more accurate
  positioningIQ: number;    // 0-1, how well they find good positions
  pressCount: number;       // how many press ball at once
  passFrequency: number;    // seconds between pass attempts
  shootPower: number;
  formationTightness: number; // 0-1
}

export function getDifficultyParams(d: Difficulty): DifficultyParams {
  switch (d) {
    case 'Easy':
      return {
        speed: 4.0,
        sprintSpeed: 5.5,
        reactionDelay: 0.8,
        tackleRange: 1.4,
        passAccuracy: 0.55,
        positioningIQ: 0.35,
        pressCount: 1,
        passFrequency: 3.5,
        shootPower: 8,
        formationTightness: 0.5,
      };
    case 'Medium':
      return {
        speed: 5.5,
        sprintSpeed: 7.5,
        reactionDelay: 0.4,
        tackleRange: 1.7,
        passAccuracy: 0.72,
        positioningIQ: 0.6,
        pressCount: 2,
        passFrequency: 2.2,
        shootPower: 12,
        formationTightness: 0.7,
      };
    case 'Hard':
      return {
        speed: 7.0,
        sprintSpeed: 9.5,
        reactionDelay: 0.15,
        tackleRange: 2.0,
        passAccuracy: 0.88,
        positioningIQ: 0.85,
        pressCount: 3,
        passFrequency: 1.2,
        shootPower: 16,
        formationTightness: 0.9,
      };
  }
}

// ─────────────────────────────────────────────────────────────
// FIELD ZONES
// ─────────────────────────────────────────────────────────────
export enum FieldZone {
  DEF_THIRD,
  MID_THIRD,
  ATT_THIRD,
}

export enum FieldLane {
  LEFT_WING,
  CENTER,
  RIGHT_WING,
}

/** Get what third of the pitch a Z coordinate is in, from the perspective of 
 *  a team attacking toward negative Z (north). */
export function getFieldZone(z: number, attackingNorth: boolean): FieldZone {
  const thirdSize = FIELD.L / 3;
  if (attackingNorth) {
    // Attacking north: defense = positive z, attack = negative z
    if (z > thirdSize / 2) return FieldZone.DEF_THIRD;
    if (z < -thirdSize / 2) return FieldZone.ATT_THIRD;
    return FieldZone.MID_THIRD;
  } else {
    if (z < -thirdSize / 2) return FieldZone.DEF_THIRD;
    if (z > thirdSize / 2) return FieldZone.ATT_THIRD;
    return FieldZone.MID_THIRD;
  }
}

export function getFieldLane(x: number): FieldLane {
  if (x < -FIELD.HW / 3) return FieldLane.LEFT_WING;
  if (x > FIELD.HW / 3) return FieldLane.RIGHT_WING;
  return FieldLane.CENTER;
}

// ─────────────────────────────────────────────────────────────
// SPATIAL UTILITIES
// ─────────────────────────────────────────────────────────────

/** Flat XZ distance between two 3D points. */
export function flatDist(a: THREE.Vector3, b: THREE.Vector3): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/** Flat XZ distance using raw coords. */
export function flatDistXZ(ax: number, az: number, bx: number, bz: number): number {
  return Math.hypot(ax - bx, az - bz);
}

/** Clamp a position to stay inside the field boundaries with margin. */
export function clampToField(x: number, z: number, margin = 2): { x: number; z: number } {
  return {
    x: THREE.MathUtils.clamp(x, -FIELD.HW + margin, FIELD.HW - margin),
    z: THREE.MathUtils.clamp(z, -FIELD.HL + margin, FIELD.HL - margin),
  };
}

/** Direction vector from A to B, normalized, on XZ plane. */
export function directionXZ(from: THREE.Vector3, to: THREE.Vector3): THREE.Vector3 {
  const d = new THREE.Vector3(to.x - from.x, 0, to.z - from.z);
  const len = d.length();
  if (len < 0.001) return new THREE.Vector3(0, 0, -1);
  return d.divideScalar(len);
}

// ─────────────────────────────────────────────────────────────
// THREAT & OPENNESS ASSESSMENT
// ─────────────────────────────────────────────────────────────

/** Score how "open" a position is relative to a list of opponents.
 *  Higher = more open. Considers distance from each opponent. */
export function opennessScore(
  pos: THREE.Vector3,
  opponents: THREE.Vector3[],
  minSafeDist = 5.0
): number {
  let score = 1.0;
  for (const opp of opponents) {
    const d = flatDist(pos, opp);
    if (d < minSafeDist) {
      score *= d / minSafeDist; // 0 when on top, 1 when at safe dist
    }
  }
  return score;
}

/** Check if a straight-line pass from A to B is "clear" of opponents.
 *  Returns a clearance score 0-1 (1 = perfectly clear). */
export function passClearance(
  from: THREE.Vector3,
  to: THREE.Vector3,
  opponents: THREE.Vector3[],
  corridorWidth = 2.5
): number {
  const passDir = new THREE.Vector3(to.x - from.x, 0, to.z - from.z);
  const passLen = passDir.length();
  if (passLen < 0.01) return 0;
  passDir.divideScalar(passLen);

  // Perpendicular direction for corridor check
  const perpX = -passDir.z;
  const perpZ = passDir.x;

  let minClearance = 1.0;

  for (const opp of opponents) {
    // Project opponent onto pass line
    const toOpp = new THREE.Vector3(opp.x - from.x, 0, opp.z - from.z);
    const proj = toOpp.dot(passDir); // distance along pass line

    // Only care about opponents between sender and receiver
    if (proj < -1.0 || proj > passLen + 1.0) continue;

    // Perpendicular distance from pass line
    const perpDist = Math.abs(toOpp.x * perpX + toOpp.z * perpZ);

    if (perpDist < corridorWidth) {
      const blockFactor = 1.0 - (perpDist / corridorWidth);
      minClearance = Math.min(minClearance, 1.0 - blockFactor * 0.9);
    }
  }

  return minClearance;
}

/** Score a potential pass target considering multiple factors.
 *  Higher = better pass option. */
export function scorePassTarget(
  from: THREE.Vector3,
  target: THREE.Vector3,
  opponents: THREE.Vector3[],
  goalZ: number,
  positioningIQ: number
): number {
  const dist = flatDist(from, target);
  if (dist < 2.0 || dist > 45.0) return -1; // too close or too far

  // 1. Pass clearance (is the lane open?)
  const clearance = passClearance(from, target, opponents);
  if (clearance < 0.2) return -1; // blocked

  // 2. Forward progress (how much closer to goal does this pass get us?)
  const forwardGain = Math.abs(goalZ - from.z) - Math.abs(goalZ - target.z);
  const normalizedForward = THREE.MathUtils.clamp(forwardGain / 25.0, -0.4, 1.0);

  // 3. Target openness (is the receiver in space?)
  const openness = opennessScore(target, opponents, 6.0);

  // 4. Distance penalty (prefer medium-range passes)
  const distScore = dist < 8 ? 0.7 : dist < 20 ? 1.0 : dist < 35 ? 0.8 : 0.5;

  // Weighted combination — positioningIQ affects how well they evaluate
  const baseScore = clearance * 0.35 + normalizedForward * 0.25 + openness * 0.25 + distScore * 0.15;
  
  // Add randomness inversely proportional to IQ (low IQ = more random choices)
  const noise = (1.0 - positioningIQ) * (Math.random() - 0.5) * 0.4;

  return baseScore + noise;
}

// ─────────────────────────────────────────────────────────────
// STEERING BEHAVIORS
// ─────────────────────────────────────────────────────────────

/** Compute a steering velocity to seek a target position. */
export function seekVelocity(
  currentPos: THREE.Vector3,
  targetPos: THREE.Vector3,
  speed: number,
  arrivalRadius = 1.0
): { x: number; z: number } {
  const dx = targetPos.x - currentPos.x;
  const dz = targetPos.z - currentPos.z;
  const dist = Math.hypot(dx, dz);

  if (dist < 0.1) return { x: 0, z: 0 };

  // Arrival behavior: slow down near target
  const desiredSpeed = dist < arrivalRadius ? speed * (dist / arrivalRadius) : speed;
  
  return {
    x: (dx / dist) * desiredSpeed,
    z: (dz / dist) * desiredSpeed,
  };
}

/** Compute avoidance offset from a set of obstacles. */
export function avoidanceForce(
  pos: THREE.Vector3,
  obstacles: THREE.Vector3[],
  avoidRadius = 4.0,
  strength = 3.0
): { x: number; z: number } {
  let fx = 0, fz = 0;

  for (const obs of obstacles) {
    const dx = pos.x - obs.x;
    const dz = pos.z - obs.z;
    const dist = Math.hypot(dx, dz);

    if (dist < avoidRadius && dist > 0.01) {
      const factor = (1.0 - dist / avoidRadius) * strength;
      fx += (dx / dist) * factor;
      fz += (dz / dist) * factor;
    }
  }

  return { x: fx, z: fz };
}

// ─────────────────────────────────────────────────────────────
// FORMATION DEFINITIONS
// ─────────────────────────────────────────────────────────────

export interface FormationSlot {
  baseX: number;  // relative X (-1 to 1, scaled to field width)
  baseZ: number;  // relative Z (-1 to 1, scaled to field depth from team perspective)
  role: 'defender' | 'midfielder' | 'attacker';
}

/** 4-1 formation for 5 outfield players (attacking toward negative Z). */
export const FORMATION_4_1: FormationSlot[] = [
  { baseX: -0.6, baseZ: 0.6,  role: 'defender' },   // Left Back
  { baseX: -0.2, baseZ: 0.55, role: 'defender' },    // Center Back Left
  { baseX: 0.2,  baseZ: 0.55, role: 'defender' },    // Center Back Right
  { baseX: 0.6,  baseZ: 0.6,  role: 'defender' },    // Right Back
  { baseX: 0.0,  baseZ: 0.05, role: 'attacker' },    // Striker
];

/** 3-2 formation for more attacking play. */
export const FORMATION_3_2: FormationSlot[] = [
  { baseX: -0.5, baseZ: 0.55, role: 'defender' },
  { baseX: 0.0,  baseZ: 0.5,  role: 'defender' },
  { baseX: 0.5,  baseZ: 0.55, role: 'defender' },
  { baseX: -0.3, baseZ: 0.15, role: 'midfielder' },
  { baseX: 0.3,  baseZ: 0.15, role: 'midfielder' },
];

/** 2-1-2 formation for the player's team (attacking toward negative Z). */
export const TEAMMATE_FORMATION: FormationSlot[] = [
  { baseX: -0.55, baseZ: 0.1,   role: 'midfielder' },  // Left Midfielder
  { baseX: 0.55,  baseZ: 0.1,   role: 'midfielder' },   // Right Midfielder
  { baseX: 0.0,   baseZ: -0.15, role: 'attacker' },      // Center Forward
  { baseX: 0.0,   baseZ: 0.4,   role: 'defender' },      // Holding Midfielder
];

/** Convert a formation slot's relative coords to absolute field coords,
 *  shifted based on ball position for dynamic formation. */
export function formationToWorld(
  slot: FormationSlot,
  ballZ: number,
  attackingNorth: boolean,
  tightness: number
): THREE.Vector3 {
  const xScale = FIELD.HW * 0.85;
  const zScale = FIELD.HL * 0.45;

  let baseX = slot.baseX * xScale;
  let baseZ = slot.baseZ * zScale;

  if (!attackingNorth) {
    baseZ = -baseZ; // flip for team attacking south
  }

  // Shift formation based on ball position (formation follows ball)
  const ballInfluence = tightness * 0.4;
  const shiftZ = ballZ * ballInfluence;
  baseZ += shiftZ;

  // Clamp to field
  const clamped = clampToField(baseX, baseZ, 3);
  return new THREE.Vector3(clamped.x, 0, clamped.z);
}

// ─────────────────────────────────────────────────────────────
// BALL POSSESSION HELPERS
// ─────────────────────────────────────────────────────────────

/** Determine which team "has" the ball based on proximity.
 *  Returns 'player' | 'enemy' | 'loose'. */
export function determinePossession(
  ballPos: THREE.Vector3,
  playerPos: THREE.Vector3,
  teammatePositions: THREE.Vector3[],
  enemyPositions: THREE.Vector3[],
  possessionRadius = 2.5
): 'player' | 'teammate' | 'enemy' | 'loose' {
  const playerDist = flatDist(ballPos, playerPos);
  if (playerDist < possessionRadius) return 'player';

  let closestTeammate = Infinity;
  for (const t of teammatePositions) {
    closestTeammate = Math.min(closestTeammate, flatDist(ballPos, t));
  }

  let closestEnemy = Infinity;
  for (const e of enemyPositions) {
    closestEnemy = Math.min(closestEnemy, flatDist(ballPos, e));
  }

  if (closestTeammate < possessionRadius && closestTeammate < closestEnemy) return 'teammate';
  if (closestEnemy < possessionRadius && closestEnemy < closestTeammate) return 'enemy';
  return 'loose';
}

/** Find the index of the closest entity to a position. */
export function findClosestIndex(target: THREE.Vector3, positions: THREE.Vector3[]): number {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < positions.length; i++) {
    const d = flatDist(target, positions[i]);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}
