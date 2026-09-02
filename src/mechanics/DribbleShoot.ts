import * as THREE from 'three';
import { PlayerController } from '../entities/PlayerController';
import { Ball } from '../entities/Ball';
import { GameManager } from '../state/GameManager';
import { TextureGenerator } from '../engine/TextureGenerator';
import { SoundManager } from '../engine/SoundManager';
import { ParticleSystem } from '../engine/ParticleSystem';
import { CameraEffects } from '../engine/CameraEffects';

export class DribbleShoot {
  private player: PlayerController;
  private ball: Ball;
  private particleSystem?: ParticleSystem;
  private cameraEffects?: CameraEffects;
  private isCharging = false;
  
  // 3D Ground Trajectory Arrow
  private arrowMesh: THREE.Mesh;
  private arrowMaterial: THREE.MeshStandardMaterial;

  // DOM HUD Power Ring elements
  private powerRingSvg: HTMLElement | null = null;
  private powerRingFill: HTMLElement | null = null;
  private readonly CIRCUMFERENCE = 138.2; // 2 * PI * 22

  constructor(
    scene: THREE.Scene,
    player: PlayerController,
    ball: Ball,
    particleSystem?: ParticleSystem,
    cameraEffects?: CameraEffects
  ) {
    this.player = player;
    this.ball = ball;
    this.particleSystem = particleSystem;
    this.cameraEffects = cameraEffects;

    this.powerRingSvg = document.getElementById('power-ring');
    this.powerRingFill = document.getElementById('power-ring-fill');

    // Create 3D Ground-Projected Trajectory Chevron Arrow
    const arrowTex = TextureGenerator.createChevronArrowTexture();
    const arrowGeo = new THREE.PlaneGeometry(2.4, 8.0);
    arrowGeo.rotateX(-Math.PI / 2); // Flat on ground

    this.arrowMaterial = new THREE.MeshStandardMaterial({
      map: arrowTex,
      transparent: true,
      opacity: 0.0,
      emissive: new THREE.Color(0xffaa00),
      emissiveMap: arrowTex,
      emissiveIntensity: 2.0,
      depthWrite: false,
      side: THREE.DoubleSide
    });

    this.arrowMesh = new THREE.Mesh(arrowGeo, this.arrowMaterial);
    this.arrowMesh.position.set(0, 0.05, 0);
    this.arrowMesh.visible = false;
    scene.add(this.arrowMesh);

    this.setupInputs();
  }

  private setupInputs() {
    const startCharge = () => {
      const gm = GameManager.getInstance();
      if (this.player.controls.isLocked && gm.isGameStarted && !this.isCharging) {
        this.isCharging = true;
        gm.powerMeter = 15;
        this.arrowMesh.visible = true;
        if (this.powerRingSvg) this.powerRingSvg.style.opacity = '1';
        SoundManager.getInstance().startChargeRiser();
      }
    };

    const releaseCharge = () => {
      if (this.isCharging) {
        this.isCharging = false;
        this.arrowMesh.visible = false;
        this.arrowMaterial.opacity = 0;
        if (this.powerRingSvg) this.powerRingSvg.style.opacity = '0';
        if (this.powerRingFill) {
          this.powerRingFill.style.strokeDashoffset = `${this.CIRCUMFERENCE}`;
        }
        SoundManager.getInstance().stopChargeRiser();
        
        // Trigger Player Foot Kicking Animation & Shoot
        this.player.triggerKick();
        this.shoot();
      }
    };

    // Spacebar Shoot
    document.addEventListener('keydown', (e) => {
      if (e.code === 'Space') startCharge();
    });
    document.addEventListener('keyup', (e) => {
      if (e.code === 'Space') releaseCharge();
    });

    // Left Mouse Button Shoot
    document.addEventListener('mousedown', (e) => {
      if (e.button === 0 && this.player.controls.isLocked) {
        startCharge();
      }
    });
    document.addEventListener('mouseup', (e) => {
      if (e.button === 0 && this.player.controls.isLocked) {
        releaseCharge();
      }
    });

    // Reset charging on unlock or blur
    this.player.controls.addEventListener('unlock', () => {
      if (this.isCharging) {
        this.isCharging = false;
        this.arrowMesh.visible = false;
        this.arrowMaterial.opacity = 0;
        if (this.powerRingSvg) this.powerRingSvg.style.opacity = '0';
        GameManager.getInstance().powerMeter = 0;
        SoundManager.getInstance().stopChargeRiser();
      }
    });

    window.addEventListener('blur', () => {
      if (this.isCharging) {
        this.isCharging = false;
        this.arrowMesh.visible = false;
        this.arrowMaterial.opacity = 0;
        if (this.powerRingSvg) this.powerRingSvg.style.opacity = '0';
        GameManager.getInstance().powerMeter = 0;
        SoundManager.getInstance().stopChargeRiser();
      }
    });
  }

  public update(deltaTime: number) {
    const gm = GameManager.getInstance();

    if (this.isCharging) {
      // Rapid, responsive power meter fill (15 to 100 in ~0.85s)
      gm.powerMeter = Math.min(100, gm.powerMeter + 100 * deltaTime);
      
      this.updateTrajectoryArrow(gm.powerMeter);
      this.updatePowerRing(gm.powerMeter);
    }

    this.handleDribble(deltaTime);
  }

  private updatePowerRing(power: number) {
    if (!this.powerRingFill) return;
    const norm = (power - 15) / 85;
    const offset = this.CIRCUMFERENCE * (1 - norm);
    this.powerRingFill.style.strokeDashoffset = `${offset}`;

    if (norm < 0.5) {
      this.powerRingFill.style.stroke = '#22c55e'; // Green
    } else if (norm < 0.8) {
      this.powerRingFill.style.stroke = '#facc15'; // Gold
    } else {
      this.powerRingFill.style.stroke = '#ff1493'; // Hot Pink
    }
  }

  private updateTrajectoryArrow(power: number) {
    const ballPos = this.ball.mesh.position;
    
    // Get camera shooting direction (projected on XZ plane)
    const lookDir = new THREE.Vector3();
    this.player.camera.getWorldDirection(lookDir);
    lookDir.y = 0;
    if (lookDir.lengthSq() < 0.0001) {
      lookDir.set(0, 0, -1);
    } else {
      lookDir.normalize();
    }

    // Scale arrow size and opacity with power
    const normalizedPower = (power - 10) / 90; // 0 to 1
    const arrowLength = 4.0 + normalizedPower * 8.0; // 4m to 12m
    
    this.arrowMesh.scale.set(1.0 + normalizedPower * 0.4, 1.0, arrowLength / 8.0);

    // Place arrow starting just ahead of the ball pointing forward
    const arrowCenterDist = (arrowLength / 2) + 0.3;
    this.arrowMesh.position.set(
      ballPos.x + lookDir.x * arrowCenterDist,
      0.06,
      ballPos.z + lookDir.z * arrowCenterDist
    );

    // Align arrow orientation to point forward in shooting direction
    const angle = Math.atan2(lookDir.x, lookDir.z) + Math.PI;
    this.arrowMesh.rotation.y = angle;

    // Shift color from Golden-Yellow to Hot Red
    const emissiveColor = new THREE.Color().lerpColors(
      new THREE.Color(0xffbb00),
      new THREE.Color(0xff1100),
      normalizedPower
    );
    this.arrowMaterial.emissive = emissiveColor;
    this.arrowMaterial.opacity = 0.6 + normalizedPower * 0.4;
  }

  private handleDribble(deltaTime: number) {
    const playerPos = this.player.camera.position;
    const ballPos = this.ball.mesh.position;

    // Horizontal distance between player and ball
    const dx = ballPos.x - playerPos.x;
    const dz = ballPos.z - playerPos.z;
    const dist = Math.hypot(dx, dz);

    // Dribble zone radius
    if (dist < 3.0 && !this.player.isKicking && !this.player.isSliding) {
      const lookDir = new THREE.Vector3();
      this.player.camera.getWorldDirection(lookDir);
      lookDir.y = 0;
      lookDir.normalize();

      // Desired ball position: 1.4 units directly ahead of player
      const targetX = playerPos.x + lookDir.x * 1.4;
      const targetZ = playerPos.z + lookDir.z * 1.4;

      // Smooth magnetic pull force towards target position
      const steerX = targetX - ballPos.x;
      const steerZ = targetZ - ballPos.z;

      const currentVel = this.ball.body.linvel();
      const pushForce = 7.0;

      // Clamp the lerp factor to avoid overshooting on high FPS
      const lerpFactor = Math.min(deltaTime * 6.0, 0.4);

      // Apply controlled velocity steering on XZ only, preserve Y (gravity)
      this.ball.body.setLinvel({
        x: THREE.MathUtils.lerp(currentVel.x, steerX * pushForce, lerpFactor),
        y: currentVel.y,
        z: THREE.MathUtils.lerp(currentVel.z, steerZ * pushForce, lerpFactor)
      }, true);
    }
  }

  private shoot() {
    const gm = GameManager.getInstance();
    const power = gm.powerMeter;
    gm.powerMeter = 0;

    const playerPos = this.player.camera.position;
    const ballPos = this.ball.mesh.position;
    const flatDist = Math.hypot(ballPos.x - playerPos.x, ballPos.z - playerPos.z);

    // Effortless, generous striking distance (up to 6.5m flat range)
    if (flatDist < 6.5) {
      const lookDir = new THREE.Vector3();
      this.player.camera.getWorldDirection(lookDir);

      // Camera vertical pitch influences shot loft:
      const loftAngle = THREE.MathUtils.clamp(0.14 + (lookDir.y * 0.45), 0.04, 0.55);

      const shootDir = new THREE.Vector3(lookDir.x, 0, lookDir.z).normalize();
      
      // Curved Shot (Magnus Spin) when strafing A (Left) or D (Right)
      let spinY = 0;
      if (this.player.moveLeft) {
        spinY = 16.0; // Left curve
      } else if (this.player.moveRight) {
        spinY = -16.0; // Right curve
      }

      shootDir.y = loftAngle;
      shootDir.normalize();

      // Punchy arcade velocity: 22 m/s (quick tap) to 42 m/s (full blast)
      const shootSpeed = (power / 100) * 20.0 + 22.0;

      // Play audio & particles
      SoundManager.getInstance().playKick(power / 100);
      if (this.particleSystem) {
        this.particleSystem.spawnTurfDust(ballPos, shootDir, 16);
      }

      // Camera impact screen shake on powerful kicks
      if (this.cameraEffects && power > 60) {
        this.cameraEffects.addShake(0.25 + (power / 100) * 0.25);
      }

      // Track match statistics
      gm.shotsTotal++;
      if (lookDir.z < -0.4) {
        gm.shotsOnTarget++;
      }

      // Apply clean, crisp shot velocity
      this.ball.body.setLinvel({
        x: shootDir.x * shootSpeed,
        y: shootDir.y * shootSpeed,
        z: shootDir.z * shootSpeed
      }, true);

      // Apply topspin and lateral curve spin
      this.ball.body.setAngvel({
        x: -shootDir.z * 10.0,
        y: spinY,
        z: shootDir.x * 10.0
      }, true);
    }
  }
}
