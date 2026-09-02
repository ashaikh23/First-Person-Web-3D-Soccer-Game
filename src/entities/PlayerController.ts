import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import { GameManager } from '../state/GameManager';
import { TextureGenerator } from '../engine/TextureGenerator';

export class PlayerController {
  public camera: THREE.PerspectiveCamera;
  public controls: PointerLockControls;
  public body: RAPIER.RigidBody;
  public characterController: RAPIER.KinematicCharacterController;
  
  // Input tracking
  public moveForward = false;
  public moveBackward = false;
  public moveLeft = false;
  public moveRight = false;
  public isSprinting = false;
  
  private velocity = new THREE.Vector3();
  private direction = new THREE.Vector3();

  // Cyber Legs 3D Assembly & Animation
  public legsGroup: THREE.Group;
  private leftLeg: THREE.Group;
  private rightLeg: THREE.Group;
  private rightShin: THREE.Group;
  private leftShin: THREE.Group;

  // Animation states
  private walkTime = 0;
  public isKicking = false;
  private kickTime = 0;
  private readonly KICK_DURATION = 0.35; // seconds

  // Slide Tackle
  public isSliding = false;
  private slideTime = 0;
  private readonly SLIDE_DURATION = 0.55; // seconds
  private slideCooldown = 0;

  constructor(scene: THREE.Scene, camera: THREE.PerspectiveCamera, world: RAPIER.World, position: THREE.Vector3) {
    this.camera = camera;
    this.controls = new PointerLockControls(camera, document.body);

    // Initial position
    this.camera.position.copy(position);

    // Physics Character Controller
    const bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(position.x, position.y, position.z);
    this.body = world.createRigidBody(bodyDesc);
    
    // Capsule collider for player (radius 0.5, half-height 0.85)
    const colliderDesc = RAPIER.ColliderDesc.capsule(0.85, 0.5);
    world.createCollider(colliderDesc, this.body);

    this.characterController = world.createCharacterController(0.1);
    this.characterController.setSlideEnabled(true);
    
    // Build Cyber Legs & attach to scene
    this.legsGroup = new THREE.Group();
    const { leftLeg, rightLeg, leftShin, rightShin } = this.buildCyberLegs();
    this.leftLeg = leftLeg;
    this.rightLeg = rightLeg;
    this.leftShin = leftShin;
    this.rightShin = rightShin;
    scene.add(this.legsGroup);

    this.setupInputs();
  }

  private buildCyberLegs() {
    // Skin material for athletic legs
    const skinMat = new THREE.MeshStandardMaterial({
      color: 0xfbd0b0,
      roughness: 0.6,
      metalness: 0.05
    });

    // White soccer shorts trim
    const shortsMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.6,
      metalness: 0.05
    });

    // High pink ribbed soccer socks
    const sockTex = TextureGenerator.createSockTexture('#ff1493', '#ffffff');
    const sockMat = new THREE.MeshStandardMaterial({
      map: sockTex,
      roughness: 0.6,
      metalness: 0.05
    });

    // Modern athletic soccer cleat
    const cleatMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.4,
      metalness: 0.2
    });

    const pinkTrimMat = new THREE.MeshStandardMaterial({
      color: 0xff1493,
      roughness: 0.3,
      metalness: 0.3
    });

    const createLeg = (isRight: boolean) => {
      const legRoot = new THREE.Group();
      const xOffset = isRight ? 0.26 : -0.26;
      legRoot.position.set(xOffset, -0.6, 0);

      // Shorts Cuff (Top)
      const shortsCuffGeo = new THREE.BoxGeometry(0.26, 0.12, 0.28);
      const shortsCuffMesh = new THREE.Mesh(shortsCuffGeo, shortsMat);
      shortsCuffMesh.position.set(0, -0.06, 0);
      legRoot.add(shortsCuffMesh);

      // Thigh (Bare Athletic Skin)
      const thighGeo = new THREE.BoxGeometry(0.22, 0.46, 0.24);
      const thighMesh = new THREE.Mesh(thighGeo, skinMat);
      thighMesh.position.set(0, -0.28, 0);
      thighMesh.castShadow = true;
      legRoot.add(thighMesh);

      // Knee & Lower Leg Group
      const kneeGroup = new THREE.Group();
      kneeGroup.position.set(0, -0.52, 0);

      // Soccer Sock (Knee-High)
      const sockGeo = new THREE.BoxGeometry(0.23, 0.58, 0.23);
      const sockMesh = new THREE.Mesh(sockGeo, sockMat);
      sockMesh.position.set(0, -0.28, 0);
      sockMesh.castShadow = true;
      kneeGroup.add(sockMesh);

      // Cleat / Soccer Boot
      const footGroup = new THREE.Group();
      footGroup.position.set(0, -0.55, 0.08);

      const shoeGeo = new THREE.BoxGeometry(0.24, 0.14, 0.46);
      const shoeMesh = new THREE.Mesh(shoeGeo, cleatMat);
      shoeMesh.position.set(0, 0, 0.08);
      shoeMesh.castShadow = true;
      footGroup.add(shoeMesh);

      // Pink Cleat Swoosh / Stripe
      const trimGeo = new THREE.BoxGeometry(0.25, 0.04, 0.32);
      const trimMesh = new THREE.Mesh(trimGeo, pinkTrimMat);
      trimMesh.position.set(0, 0.02, 0.06);
      footGroup.add(trimMesh);

      // Cleat Sole Studs Plate
      const soleGeo = new THREE.BoxGeometry(0.25, 0.03, 0.48);
      const soleMesh = new THREE.Mesh(soleGeo, pinkTrimMat);
      soleMesh.position.set(0, -0.08, 0.08);
      footGroup.add(soleMesh);

      kneeGroup.add(footGroup);
      legRoot.add(kneeGroup);

      return { legRoot, shinGroup: kneeGroup };
    };

    const left = createLeg(false);
    const right = createLeg(true);

    this.legsGroup.add(left.legRoot);
    this.legsGroup.add(right.legRoot);

    // Enable shadows on all parts of the player legs
    this.legsGroup.traverse(c => {
      if (c instanceof THREE.Mesh) {
        c.castShadow = true;
        c.receiveShadow = true;
      }
    });

    return {
      leftLeg: left.legRoot,
      rightLeg: right.legRoot,
      leftShin: left.shinGroup,
      rightShin: right.shinGroup
    };
  }

  private setupInputs() {
    document.addEventListener('keydown', (event) => {
      switch (event.code) {
        case 'KeyW': this.moveForward = true; break;
        case 'KeyA': this.moveLeft = true; break;
        case 'KeyS': this.moveBackward = true; break;
        case 'KeyD': this.moveRight = true; break;
        case 'ShiftLeft': this.isSprinting = true; break;
        case 'KeyC': this.triggerSlide(); break;
      }
    });

    document.addEventListener('keyup', (event) => {
      switch (event.code) {
        case 'KeyW': this.moveForward = false; break;
        case 'KeyA': this.moveLeft = false; break;
        case 'KeyS': this.moveBackward = false; break;
        case 'KeyD': this.moveRight = false; break;
        case 'ShiftLeft': this.isSprinting = false; break;
      }
    });

    // Reset movement flags on unlock or window blur to prevent sticky auto-walking
    this.controls.addEventListener('unlock', () => {
      this.moveForward = false;
      this.moveBackward = false;
      this.moveLeft = false;
      this.moveRight = false;
      this.isSprinting = false;
    });

    window.addEventListener('blur', () => {
      this.moveForward = false;
      this.moveBackward = false;
      this.moveLeft = false;
      this.moveRight = false;
      this.isSprinting = false;
    });
  }

  public triggerKick() {
    if (!this.isKicking && !this.isSliding) {
      this.isKicking = true;
      this.kickTime = 0;
    }
  }

  public triggerSlide() {
    const gm = GameManager.getInstance();
    if (!this.isSliding && this.slideCooldown <= 0 && gm.stamina >= 15 && this.controls.isLocked) {
      this.isSliding = true;
      this.slideTime = 0;
      this.slideCooldown = 1.0;
      gm.updateStamina(-18);
    }
  }

  public resetPosition(pos: THREE.Vector3 = new THREE.Vector3(0, 1.8, 10.0)) {
    this.body.setNextKinematicTranslation({ x: pos.x, y: pos.y - 0.9, z: pos.z });
    this.body.setTranslation({ x: pos.x, y: pos.y - 0.9, z: pos.z }, true);
    this.camera.position.set(pos.x, pos.y, pos.z);
    this.moveForward = false;
    this.moveBackward = false;
    this.moveLeft = false;
    this.moveRight = false;
    this.isSprinting = false;
    this.isSliding = false;
    this.velocity.set(0, 0, 0);
    this.updateLegs(0, 0);
  }

  public update(deltaTime: number) {
    const gameManager = GameManager.getInstance();
    if (!gameManager.isGameStarted || !this.controls.isLocked) {
      this.updateLegs(0, deltaTime);
      return;
    }

    let speed = 11.0;
    const isMoving = this.moveForward || this.moveBackward || this.moveLeft || this.moveRight;
    
    // Cooldown management
    if (this.slideCooldown > 0) {
      this.slideCooldown -= deltaTime;
    }

    if (this.isSliding) {
      this.slideTime += deltaTime;
      if (this.slideTime >= this.SLIDE_DURATION) {
        this.isSliding = false;
      }
      // Slide speed surges forward then decelerates
      const slideProgress = this.slideTime / this.SLIDE_DURATION;
      speed = (1.0 - slideProgress) * 22.0 + 4.0;
    } else if (this.isSprinting && gameManager.stamina > 0 && isMoving) {
      speed = 19.0;
      gameManager.updateStamina(-24 * deltaTime);
    } else {
      gameManager.updateStamina(14 * deltaTime);
    }

    // Get camera horizontal forward vector (XZ plane)
    const forward = new THREE.Vector3();
    this.camera.getWorldDirection(forward);
    forward.y = 0;
    if (forward.lengthSq() < 0.0001) {
      forward.set(0, 0, -1);
    } else {
      forward.normalize();
    }

    // Right vector is perpendicular to forward on XZ plane (forward x UP)
    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

    // Compute input movement vector in world space
    const moveVec = new THREE.Vector3();
    if (this.isSliding) {
      // Slide always lunges forward in look direction
      moveVec.copy(forward).multiplyScalar(speed * deltaTime);
    } else {
      if (this.moveForward) moveVec.add(forward);
      if (this.moveBackward) moveVec.sub(forward);
      if (this.moveRight) moveVec.add(right);
      if (this.moveLeft) moveVec.sub(right);

      if (moveVec.lengthSq() > 0.0001) {
        moveVec.normalize().multiplyScalar(speed * deltaTime);
      }
    }

    // Apply gravity
    moveVec.y = -9.81 * deltaTime;

    // Compute Kinematic movement via Rapier Character Controller
    this.characterController.computeColliderMovement(this.body.collider(0), moveVec);
    const correctedMovement = this.characterController.computedMovement();
    
    const currentTranslation = this.body.translation();
    this.body.setNextKinematicTranslation({
      x: currentTranslation.x + correctedMovement.x,
      y: currentTranslation.y + correctedMovement.y,
      z: currentTranslation.z + correctedMovement.z
    });

    // Update Camera position (Eye height dips during slide)
    const newTranslation = this.body.translation();
    const eyeHeightOffset = this.isSliding ? 0.45 : 0.9;
    this.camera.position.set(newTranslation.x, newTranslation.y + eyeHeightOffset, newTranslation.z);

    // Calculate true horizontal yaw angle for leg alignment
    const yaw = Math.atan2(forward.x, forward.z) + Math.PI;

    // Animate and sync legs
    const currentSpeed = isMoving || this.isSliding ? (this.isSprinting || this.isSliding ? 1.8 : 1.0) : 0;
    this.updateLegs(currentSpeed, deltaTime, yaw);

    // Update Stamina UI
    const staminaBar = document.getElementById('stamina-bar');
    if (staminaBar) {
      staminaBar.style.width = `${gameManager.stamina}%`;
    }
  }

  private updateLegs(speedFactor: number, deltaTime: number, yaw?: number) {
    const pos = this.camera.position;
    
    if (yaw === undefined) {
      const forward = new THREE.Vector3();
      this.camera.getWorldDirection(forward);
      yaw = Math.atan2(forward.x, forward.z) + Math.PI;
    }

    // Sync legs root with player position and true horizontal yaw
    const legYOffset = this.isSliding ? -0.25 : -0.45;
    this.legsGroup.position.set(pos.x, pos.y + legYOffset, pos.z);
    this.legsGroup.rotation.y = yaw;

    // Handle Sliding Animation
    if (this.isSliding) {
      // Right leg extended forward for tackle, left leg tucked underneath
      this.rightLeg.rotation.x = 1.35;
      this.rightShin.rotation.x = 0.1;
      this.leftLeg.rotation.x = -1.1;
      this.leftShin.rotation.x = 1.6;
      return;
    }

    // Handle Kicking Animation
    if (this.isKicking) {
      this.kickTime += deltaTime;
      const progress = this.kickTime / this.KICK_DURATION;

      if (progress < 0.35) {
        // Wind-up: Right leg cocks backward
        const t = progress / 0.35;
        this.rightLeg.rotation.x = THREE.MathUtils.lerp(0, -0.85, t);
        this.rightShin.rotation.x = THREE.MathUtils.lerp(0, 1.2, t);
      } else if (progress < 0.7) {
        // Strike: Fast powerful forward swing
        const t = (progress - 0.35) / 0.35;
        this.rightLeg.rotation.x = THREE.MathUtils.lerp(-0.85, 1.1, t);
        this.rightShin.rotation.x = THREE.MathUtils.lerp(1.2, 0.1, t);
      } else if (progress < 1.0) {
        // Follow-through and return to rest
        const t = (progress - 0.7) / 0.3;
        this.rightLeg.rotation.x = THREE.MathUtils.lerp(1.1, 0, t);
        this.rightShin.rotation.x = THREE.MathUtils.lerp(0.1, 0, t);
      } else {
        this.isKicking = false;
        this.rightLeg.rotation.x = 0;
        this.rightShin.rotation.x = 0;
      }

      // Left leg stays planted during kick
      this.leftLeg.rotation.x = -0.15;
      this.leftShin.rotation.x = 0.2;
      return;
    }

    // Walking / Running Animation Cycle
    if (speedFactor > 0) {
      this.walkTime += deltaTime * speedFactor * 10.0;
      const swing = Math.sin(this.walkTime) * 0.65;

      this.leftLeg.rotation.x = swing;
      this.rightLeg.rotation.x = -swing;

      this.leftShin.rotation.x = Math.max(0, -swing * 0.8);
      this.rightShin.rotation.x = Math.max(0, swing * 0.8);
    } else {
      // Idle breathing / resting stance
      this.leftLeg.rotation.x = THREE.MathUtils.lerp(this.leftLeg.rotation.x, 0, 0.1);
      this.rightLeg.rotation.x = THREE.MathUtils.lerp(this.rightLeg.rotation.x, 0, 0.1);
      this.leftShin.rotation.x = THREE.MathUtils.lerp(this.leftShin.rotation.x, 0, 0.1);
      this.rightShin.rotation.x = THREE.MathUtils.lerp(this.rightShin.rotation.x, 0, 0.1);
    }
  }
}
