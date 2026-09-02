import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { TextureGenerator } from '../engine/TextureGenerator';

export type TeamColor = 'red' | 'blue' | 'yellow';

export class CyberCharacter {
  public group: THREE.Group;
  public body: RAPIER.RigidBody;
  public teamColor: TeamColor;
  
  // Limbs for animation
  private leftLeg: THREE.Group;
  private rightLeg: THREE.Group;
  private leftArm: THREE.Group;
  private rightArm: THREE.Group;
  private head: THREE.Group;
  private ponytail: THREE.Group;
  
  private walkTime = Math.random() * 10;

  constructor(
    scene: THREE.Scene,
    world: RAPIER.World,
    position: THREE.Vector3,
    teamColor: TeamColor = 'red',
    isGoalie: boolean = teamColor === 'yellow'
  ) {
    this.teamColor = teamColor;
    this.group = new THREE.Group();
    
    // Build real female soccer player model from Three.js primitives
    const { leftLeg, rightLeg, leftArm, rightArm, head, ponytail } = this.buildModel(teamColor, isGoalie);
    this.leftLeg = leftLeg;
    this.rightLeg = rightLeg;
    this.leftArm = leftArm;
    this.rightArm = rightArm;
    this.head = head;
    this.ponytail = ponytail;

    this.group.position.copy(position);
    scene.add(this.group);

    // Physics dynamic body
    const bodyDesc = isGoalie 
      ? RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(position.x, position.y, position.z)
      : RAPIER.RigidBodyDesc.dynamic().setTranslation(position.x, position.y, position.z).lockRotations().setLinearDamping(1.0);
      
    this.body = world.createRigidBody(bodyDesc);
    
    const colliderDesc = RAPIER.ColliderDesc.capsule(0.8, 0.45).setFriction(0.6).setRestitution(0.2);
    world.createCollider(colliderDesc, this.body);
  }

  private buildModel(teamColor: TeamColor, isGoalie: boolean) {
    // ── TEAM KITS (Real Athletic Girls Soccer Uniforms) ──
    const kitConfigs = {
      blue: {
        // Home Team (Pink & White Kit)
        jerseyPrimary: '#ff1493',
        jerseySecondary: '#ffffff',
        jerseyTrim: '#ffd700',
        shortsColor: 0xffffff,
        sockPrimary: '#ff1493',
        sockStripe: '#ffffff',
        headbandColor: '#ff1493',
        cleatColor: 0x1e293b,
        cleatTrim: 0xff1493,
      },
      red: {
        // Away Team (Violet & Lavender Kit)
        jerseyPrimary: '#7c3aed',
        jerseySecondary: '#c084fc',
        jerseyTrim: '#fbcfe8',
        shortsColor: 0x2e1065,
        sockPrimary: '#7c3aed',
        sockStripe: '#ffffff',
        headbandColor: '#c084fc',
        cleatColor: 0x18181b,
        cleatTrim: 0xa855f7,
      },
      yellow: {
        // Goalkeeper (Neon Lime/Yellow Kit)
        jerseyPrimary: '#eab308',
        jerseySecondary: '#22c55e',
        jerseyTrim: '#ffffff',
        shortsColor: 0x111827,
        sockPrimary: '#eab308',
        sockStripe: '#ffffff',
        headbandColor: '#22c55e',
        cleatColor: 0x111827,
        cleatTrim: 0xeab308,
      }
    };

    const kit = kitConfigs[teamColor] || kitConfigs.blue;

    // Materials
    const skinMat = new THREE.MeshStandardMaterial({
      color: 0xfbd0b0, // Natural warm athletic skin
      roughness: 0.6,
      metalness: 0.05
    });

    const hairColors = [0x3e2723, 0x1c1917, 0x854d0e, 0xca8a04];
    const hairColor = hairColors[Math.floor(Math.random() * hairColors.length)];
    const hairMat = new THREE.MeshStandardMaterial({
      color: hairColor,
      roughness: 0.7,
      metalness: 0.1
    });

    const jerseyTex = TextureGenerator.createJerseyTexture(kit.jerseyPrimary, kit.jerseySecondary, kit.jerseyTrim);
    const jerseyMat = new THREE.MeshStandardMaterial({
      map: jerseyTex,
      roughness: 0.5,
      metalness: 0.1
    });

    const shortsMat = new THREE.MeshStandardMaterial({
      color: kit.shortsColor,
      roughness: 0.6,
      metalness: 0.1
    });

    const sockTex = TextureGenerator.createSockTexture(kit.sockPrimary, kit.sockStripe);
    const sockMat = new THREE.MeshStandardMaterial({
      map: sockTex,
      roughness: 0.6,
      metalness: 0.05
    });

    const cleatMat = new THREE.MeshStandardMaterial({
      color: kit.cleatColor,
      roughness: 0.4,
      metalness: 0.2
    });

    const headbandMat = new THREE.MeshStandardMaterial({
      color: kit.headbandColor,
      roughness: 0.4,
      metalness: 0.1
    });

    // ── 1. TORSO & ATHLETIC JERSEY ──
    const torso = new THREE.Group();
    torso.position.set(0, 1.15, 0);

    const chestGeo = new THREE.BoxGeometry(0.56, 0.68, 0.32);
    const chestMesh = new THREE.Mesh(chestGeo, jerseyMat);
    chestMesh.castShadow = true;
    torso.add(chestMesh);

    // Soccer Shorts
    const shortsGeo = new THREE.BoxGeometry(0.58, 0.22, 0.34);
    const shortsMesh = new THREE.Mesh(shortsGeo, shortsMat);
    shortsMesh.position.set(0, -0.38, 0);
    shortsMesh.castShadow = true;
    torso.add(shortsMesh);

    this.group.add(torso);

    // ── 2. HEAD, HAIR & SOCCER PONYTAIL ──
    const head = new THREE.Group();
    head.position.set(0, 0.58, 0);

    // Face / Head
    const headGeo = new THREE.BoxGeometry(0.34, 0.38, 0.34);
    const headMesh = new THREE.Mesh(headGeo, skinMat);
    headMesh.castShadow = true;
    head.add(headMesh);

    // Hair base (cap)
    const hairCapGeo = new THREE.BoxGeometry(0.36, 0.18, 0.36);
    const hairCapMesh = new THREE.Mesh(hairCapGeo, hairMat);
    hairCapMesh.position.set(0, 0.12, -0.02);
    head.add(hairCapMesh);

    // Athletic Headband
    const headbandGeo = new THREE.BoxGeometry(0.37, 0.06, 0.37);
    const headbandMesh = new THREE.Mesh(headbandGeo, headbandMat);
    headbandMesh.position.set(0, 0.06, 0);
    head.add(headbandMesh);

    // Signature High Soccer Ponytail
    const ponytail = new THREE.Group();
    ponytail.position.set(0, 0.14, -0.20);

    // Hair tie band
    const tieGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.05, 12);
    const tieMesh = new THREE.Mesh(tieGeo, headbandMat);
    tieMesh.rotation.x = Math.PI / 3;
    ponytail.add(tieMesh);

    // Flowing Ponytail Tail
    const tailGeo = new THREE.CylinderGeometry(0.05, 0.12, 0.36, 12);
    tailGeo.rotateX(Math.PI / 4);
    const tailMesh = new THREE.Mesh(tailGeo, hairMat);
    tailMesh.position.set(0, -0.12, -0.10);
    tailMesh.castShadow = true;
    ponytail.add(tailMesh);

    head.add(ponytail);
    torso.add(head);

    // ── 3. ARMS & HANDS ──
    const createArm = (isRight: boolean) => {
      const armGroup = new THREE.Group();
      armGroup.position.set(isRight ? 0.38 : -0.38, 0.22, 0);

      // Jersey Sleeve
      const sleeveGeo = new THREE.BoxGeometry(0.18, 0.18, 0.20);
      const sleeveMesh = new THREE.Mesh(sleeveGeo, jerseyMat);
      sleeveMesh.position.set(0, -0.06, 0);
      armGroup.add(sleeveMesh);

      // Athletic Bare Arm
      const armGeo = new THREE.BoxGeometry(0.14, 0.44, 0.14);
      const armMesh = new THREE.Mesh(armGeo, isGoalie ? jerseyMat : skinMat);
      armMesh.position.set(0, -0.34, 0);
      armMesh.castShadow = true;
      armGroup.add(armMesh);

      // Hand (or Goalkeeper Glove)
      const handGeo = new THREE.BoxGeometry(0.15, 0.14, 0.16);
      const handMesh = new THREE.Mesh(handGeo, isGoalie ? headbandMat : skinMat);
      handMesh.position.set(0, -0.58, 0.02);
      armGroup.add(handMesh);

      torso.add(armGroup);
      return armGroup;
    };

    const leftArm = createArm(false);
    const rightArm = createArm(true);

    // ── 4. LEGS, SOCKS & CLEATS ──
    const createLeg = (isRight: boolean) => {
      const legGroup = new THREE.Group();
      legGroup.position.set(isRight ? 0.18 : -0.18, 0.8, 0);

      // Thigh (Bare Skin)
      const thighGeo = new THREE.BoxGeometry(0.20, 0.38, 0.22);
      const thighMesh = new THREE.Mesh(thighGeo, skinMat);
      thighMesh.position.set(0, -0.19, 0);
      legGroup.add(thighMesh);

      // Soccer Sock (Knee High with foldover cuff)
      const sockGeo = new THREE.BoxGeometry(0.22, 0.50, 0.24);
      const sockMesh = new THREE.Mesh(sockGeo, sockMat);
      sockMesh.position.set(0, -0.56, 0);
      legGroup.add(sockMesh);

      // Modern Soccer Cleat / Boot
      const footGeo = new THREE.BoxGeometry(0.22, 0.12, 0.38);
      const footMesh = new THREE.Mesh(footGeo, cleatMat);
      footMesh.position.set(0, -0.84, 0.08);
      legGroup.add(footMesh);

      // Cleat Sole / Studs Plate
      const soleGeo = new THREE.BoxGeometry(0.23, 0.04, 0.40);
      const soleMesh = new THREE.Mesh(soleGeo, headbandMat);
      soleMesh.position.set(0, -0.90, 0.08);
      legGroup.add(soleMesh);

      this.group.add(legGroup);
      return legGroup;
    };

    const leftLeg = createLeg(false);
    const rightLeg = createLeg(true);

    // Enable shadows on all character parts
    this.group.traverse(child => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    return { leftLeg, rightLeg, leftArm, rightArm, head, ponytail };
  }

  public updateAnimation(speed: number, deltaTime: number) {
    if (speed > 0.5) {
      this.walkTime += deltaTime * speed * 2.8;
      const swing = Math.sin(this.walkTime) * 0.75;

      this.leftLeg.rotation.x = swing;
      this.rightLeg.rotation.x = -swing;

      this.leftArm.rotation.x = -swing * 0.85;
      this.rightArm.rotation.x = swing * 0.85;

      // Realistic ponytail bounce while running
      if (this.ponytail) {
        this.ponytail.rotation.x = Math.abs(Math.sin(this.walkTime * 2)) * 0.35 + 0.1;
        this.ponytail.rotation.y = Math.sin(this.walkTime) * 0.15;
      }
    } else {
      this.leftLeg.rotation.x = THREE.MathUtils.lerp(this.leftLeg.rotation.x, 0, 0.1);
      this.rightLeg.rotation.x = THREE.MathUtils.lerp(this.rightLeg.rotation.x, 0, 0.1);
      this.leftArm.rotation.x = THREE.MathUtils.lerp(this.leftArm.rotation.x, 0, 0.1);
      this.rightArm.rotation.x = THREE.MathUtils.lerp(this.rightArm.rotation.x, 0, 0.1);
      if (this.ponytail) {
        this.ponytail.rotation.x = THREE.MathUtils.lerp(this.ponytail.rotation.x, 0, 0.1);
      }
    }
  }
}
