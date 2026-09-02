import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { Ball } from '../entities/Ball';
import { GameManager } from '../state/GameManager';

export class PracticeMode {
  private cones: { mesh: THREE.Group; body: RAPIER.RigidBody; passed: boolean; x: number; z: number }[] = [];
  private currentTargetIndex = 0;
  private targetRing: THREE.Mesh;
  private isVisible = true;

  constructor(scene: THREE.Scene, world: RAPIER.World) {
    // Target indicator ring
    const ringGeo = new THREE.RingGeometry(1.2, 1.5, 32);
    ringGeo.rotateX(-Math.PI / 2);
    this.targetRing = new THREE.Mesh(
      ringGeo,
      new THREE.MeshBasicMaterial({ color: 0x22c55e, side: THREE.DoubleSide })
    );
    this.targetRing.position.set(0, 0.08, 0);
    scene.add(this.targetRing);

    this.setupSlalom(scene, world);
  }

  private setupSlalom(scene: THREE.Scene, world: RAPIER.World) {
    const numCones = 6;
    const startZ = -10;
    const spacing = 12;

    for (let i = 0; i < numCones; i++) {
      const coneGroup = new THREE.Group();
      const x = (i % 2 === 0) ? 6 : -6;
      const z = startZ - (i * spacing);

      // Realistic Athletic Soccer Training Cone
      const coneGeo = new THREE.ConeGeometry(0.45, 1.2, 16);
      const coneMat = new THREE.MeshStandardMaterial({
        color: 0xff1493,
        roughness: 0.4,
        metalness: 0.1
      });
      const coneMesh = new THREE.Mesh(coneGeo, coneMat);
      coneMesh.position.y = 0.6;
      coneMesh.castShadow = true;
      coneMesh.receiveShadow = true;
      coneGroup.add(coneMesh);

      // White reflective stripe on cone
      const stripeGeo = new THREE.CylinderGeometry(0.24, 0.32, 0.25, 16);
      const stripeMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.3,
        metalness: 0.2
      });
      const stripeMesh = new THREE.Mesh(stripeGeo, stripeMat);
      stripeMesh.position.y = 0.55;
      coneGroup.add(stripeMesh);

      // Base plate
      const baseGeo = new THREE.BoxGeometry(0.9, 0.06, 0.9);
      const baseMesh = new THREE.Mesh(baseGeo, coneMat);
      baseMesh.position.y = 0.03;
      coneGroup.add(baseMesh);

      coneGroup.position.set(x, 0, z);
      scene.add(coneGroup);

      // Physics fixed collider
      const bodyDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(x, 0.6, z);
      const body = world.createRigidBody(bodyDesc);
      const colDesc = RAPIER.ColliderDesc.cylinder(0.6, 0.45).setRestitution(0.4);
      world.createCollider(colDesc, body);

      this.cones.push({ mesh: coneGroup, body, passed: false, x, z });
    }

    this.updateTargetRing();
  }

  private updateTargetRing() {
    if (this.currentTargetIndex < this.cones.length) {
      const target = this.cones[this.currentTargetIndex];
      this.targetRing.visible = this.isVisible;
      this.targetRing.position.set(target.x, 0.08, target.z);
    } else {
      this.targetRing.visible = false;
    }
  }

  public update(deltaTime: number, ball: Ball) {
    if (!this.isVisible) return;

    const ballPos = ball.mesh.position;
    const gm = GameManager.getInstance();

    // Check if ball passed current cone target
    if (this.currentTargetIndex < this.cones.length) {
      const target = this.cones[this.currentTargetIndex];
      const dist = Math.hypot(ballPos.x - target.x, ballPos.z - target.z);

      if (dist < 2.2) {
        target.passed = true;
        this.currentTargetIndex++;
        gm.score += 100;

        // Turn cone green to indicate completed checkpoint
        const coneMesh = target.mesh.children[0] as THREE.Mesh;
        (coneMesh.material as THREE.MeshStandardMaterial).color.setHex(0x22c55e);

        this.updateTargetRing();
      }
    }

    // Animate target ring pulse
    if (this.targetRing.visible) {
      const scale = 1.0 + Math.sin(Date.now() * 0.006) * 0.15;
      this.targetRing.scale.set(scale, scale, scale);
    }
  }

  public setVisible(visible: boolean) {
    this.isVisible = visible;
    for (const c of this.cones) {
      c.mesh.visible = visible;
    }
    this.updateTargetRing();
  }

  public getCones(): { x: number; z: number; passed: boolean }[] {
    if (!this.isVisible) return [];
    return this.cones.map(c => ({ x: c.x, z: c.z, passed: c.passed }));
  }
}
