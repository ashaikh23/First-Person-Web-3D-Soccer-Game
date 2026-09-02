import * as THREE from 'three';

interface ConfettiParticle {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  rotation: THREE.Vector3;
  rotSpeed: THREE.Vector3;
  color: THREE.Color;
  size: number;
  life: number;
  maxLife: number;
}

interface DustParticle {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  color: THREE.Color;
  size: number;
  opacity: number;
  life: number;
  maxLife: number;
}

export class ParticleSystem {
  private scene: THREE.Scene;

  // Confetti
  private confettiParticles: ConfettiParticle[] = [];
  private confettiInstancedMesh: THREE.InstancedMesh;
  private readonly MAX_CONFETTI = 300;
  private dummy = new THREE.Object3D();

  // Turf dust
  private dustParticles: DustParticle[] = [];
  private dustPoints: THREE.Points;
  private dustGeo: THREE.BufferGeometry;
  private dustPosArray: Float32Array;
  private dustColorArray: Float32Array;
  private readonly MAX_DUST = 200;

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    // 1. Confetti instanced mesh (flat colorful paper quads)
    const confettiGeo = new THREE.PlaneGeometry(0.25, 0.25);
    const confettiMat = new THREE.MeshBasicMaterial({
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.95
    });
    this.confettiInstancedMesh = new THREE.InstancedMesh(confettiGeo, confettiMat, this.MAX_CONFETTI);
    this.confettiInstancedMesh.count = 0;
    this.confettiInstancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.confettiInstancedMesh);

    // 2. Turf dust points
    this.dustGeo = new THREE.BufferGeometry();
    this.dustPosArray = new Float32Array(this.MAX_DUST * 3);
    this.dustColorArray = new Float32Array(this.MAX_DUST * 3);

    this.dustGeo.setAttribute('position', new THREE.BufferAttribute(this.dustPosArray, 3));
    this.dustGeo.setAttribute('color', new THREE.BufferAttribute(this.dustColorArray, 3));

    const dustMat = new THREE.PointsMaterial({
      size: 0.28,
      vertexColors: true,
      transparent: true,
      opacity: 0.7,
      depthWrite: false
    });
    this.dustPoints = new THREE.Points(this.dustGeo, dustMat);
    scene.add(this.dustPoints);
  }

  /**
   * Spawn a celebration confetti cannon burst at the goal.
   */
  public spawnGoalCelebration(goalCenter: THREE.Vector3) {
    const colors = [
      new THREE.Color(0xff1493), // Pink
      new THREE.Color(0xffd700), // Gold
      new THREE.Color(0xffffff), // White
      new THREE.Color(0xa855f7), // Violet
      new THREE.Color(0x38bdf8), // Sky Blue
    ];

    for (let i = 0; i < 150; i++) {
      if (this.confettiParticles.length >= this.MAX_CONFETTI) break;

      const spread = (Math.random() - 0.5) * 12;
      const pos = new THREE.Vector3(
        goalCenter.x + spread,
        goalCenter.y + 2.0 + Math.random() * 4.0,
        goalCenter.z + (Math.random() - 0.5) * 6.0
      );

      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 8.0,
        6.0 + Math.random() * 8.0,
        (Math.random() - 0.5) * 8.0
      );

      const color = colors[Math.floor(Math.random() * colors.length)];
      const maxLife = 2.5 + Math.random() * 1.5;

      this.confettiParticles.push({
        position: pos,
        velocity: vel,
        rotation: new THREE.Vector3(Math.random() * Math.PI, Math.random() * Math.PI, 0),
        rotSpeed: new THREE.Vector3((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8, 0),
        color: color,
        size: 0.2 + Math.random() * 0.15,
        life: 0,
        maxLife: maxLife
      });
    }
  }

  /**
   * Spawn turf grass dust when striking or sprinting into the ball.
   */
  public spawnTurfDust(pos: THREE.Vector3, dir: THREE.Vector3, count = 12) {
    for (let i = 0; i < count; i++) {
      if (this.dustParticles.length >= this.MAX_DUST) {
        this.dustParticles.shift();
      }

      const p = new THREE.Vector3(
        pos.x + (Math.random() - 0.5) * 0.4,
        0.05 + Math.random() * 0.15,
        pos.z + (Math.random() - 0.5) * 0.4
      );

      const v = new THREE.Vector3(
        dir.x * 2.0 + (Math.random() - 0.5) * 2.0,
        1.5 + Math.random() * 2.0,
        dir.z * 2.0 + (Math.random() - 0.5) * 2.0
      );

      const isGreen = Math.random() > 0.4;
      const color = isGreen ? new THREE.Color(0x22c55e) : new THREE.Color(0xd97706);

      this.dustParticles.push({
        position: p,
        velocity: v,
        color: color,
        size: 0.25,
        opacity: 0.8,
        life: 0,
        maxLife: 0.4 + Math.random() * 0.3
      });
    }
  }

  public update(deltaTime: number) {
    // 1. Update Confetti
    let confettiCount = 0;
    for (let i = this.confettiParticles.length - 1; i >= 0; i--) {
      const c = this.confettiParticles[i];
      c.life += deltaTime;
      if (c.life >= c.maxLife) {
        this.confettiParticles.splice(i, 1);
        continue;
      }

      // Physics: Gravity + drag + fluttering air resistance
      c.velocity.y -= 7.0 * deltaTime;
      c.velocity.x *= 0.98;
      c.velocity.z *= 0.98;

      c.position.addScaledVector(c.velocity, deltaTime);
      c.rotation.x += c.rotSpeed.x * deltaTime;
      c.rotation.y += c.rotSpeed.y * deltaTime;

      if (c.position.y < 0.05) {
        c.position.y = 0.05;
        c.velocity.set(0, 0, 0);
      }

      this.dummy.position.copy(c.position);
      this.dummy.rotation.set(c.rotation.x, c.rotation.y, c.rotation.z);
      this.dummy.scale.set(c.size, c.size, c.size);
      this.dummy.updateMatrix();

      this.confettiInstancedMesh.setMatrixAt(confettiCount, this.dummy.matrix);
      this.confettiInstancedMesh.setColorAt(confettiCount, c.color);
      confettiCount++;
    }

    this.confettiInstancedMesh.count = confettiCount;
    this.confettiInstancedMesh.instanceMatrix.needsUpdate = true;
    if (this.confettiInstancedMesh.instanceColor) {
      this.confettiInstancedMesh.instanceColor.needsUpdate = true;
    }

    // 2. Update Dust
    for (let i = this.dustParticles.length - 1; i >= 0; i--) {
      const d = this.dustParticles[i];
      d.life += deltaTime;
      if (d.life >= d.maxLife) {
        this.dustParticles.splice(i, 1);
        continue;
      }

      d.velocity.y -= 5.0 * deltaTime;
      d.position.addScaledVector(d.velocity, deltaTime);
    }

    // Update Dust Buffer Attributes
    let dIdx = 0;
    for (const d of this.dustParticles) {
      this.dustPosArray[dIdx * 3] = d.position.x;
      this.dustPosArray[dIdx * 3 + 1] = d.position.y;
      this.dustPosArray[dIdx * 3 + 2] = d.position.z;

      this.dustColorArray[dIdx * 3] = d.color.r;
      this.dustColorArray[dIdx * 3 + 1] = d.color.g;
      this.dustColorArray[dIdx * 3 + 2] = d.color.b;
      dIdx++;
    }

    this.dustGeo.setDrawRange(0, this.dustParticles.length);
    (this.dustGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.dustGeo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
  }
}
