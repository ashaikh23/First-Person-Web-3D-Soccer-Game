import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { TextureGenerator } from '../engine/TextureGenerator';

export class Pitch {
  public fieldWidth = 70;
  public fieldLength = 110;

  constructor(scene: THREE.Scene, world: RAPIER.World) {
    this.createField(scene, world);
    this.createFieldLines(scene);
    this.createStadiumStands(scene);
    this.createDigitalBillboards(scene);
    this.createFloodlights(scene);
    this.createGoals(scene, world);
    this.createCornerFlags(scene);
    this.createBoundaryColliders(world);
  }

  private createField(scene: THREE.Scene, world: RAPIER.World) {
    const depth = 2;
    const grassTex = TextureGenerator.createGrassTexture();

    const geometry = new THREE.BoxGeometry(this.fieldWidth, depth, this.fieldLength);
    const material = new THREE.MeshStandardMaterial({ 
      map: grassTex,
      roughness: 0.85, 
      metalness: 0.05 
    });
    
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = -depth / 2;
    mesh.receiveShadow = true;
    scene.add(mesh);

    // Physics ground collider
    const groundBodyDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(0, -depth / 2, 0);
    const groundBody = world.createRigidBody(groundBodyDesc);
    const groundColliderDesc = RAPIER.ColliderDesc.cuboid(this.fieldWidth / 2, depth / 2, this.fieldLength / 2)
      .setFriction(0.8)
      .setRestitution(0.3);
    world.createCollider(groundColliderDesc, groundBody);
  }

  private createFieldLines(scene: THREE.Scene) {
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff, depthWrite: false });
    const lineThickness = 0.35;
    const yPos = 0.01; // Slightly above ground to prevent z-fighting

    const addRectLine = (x: number, z: number, w: number, d: number) => {
      const geo = new THREE.PlaneGeometry(w, d);
      geo.rotateX(-Math.PI / 2);
      const mesh = new THREE.Mesh(geo, lineMat);
      mesh.position.set(x, yPos, z);
      scene.add(mesh);
    };

    // Touchlines (sides) & Goal lines
    const hw = (this.fieldWidth - 6) / 2;
    const hl = (this.fieldLength - 8) / 2;
    
    // Perimeter lines
    addRectLine(0, -hl, hw * 2, lineThickness); // North goal line
    addRectLine(0, hl, hw * 2, lineThickness);  // South goal line
    addRectLine(-hw, 0, lineThickness, hl * 2); // West sideline
    addRectLine(hw, 0, lineThickness, hl * 2);  // East sideline

    // Midfield halfway line
    addRectLine(0, 0, hw * 2, lineThickness);

    // Center Circle (ring geometry)
    const circleGeo = new THREE.RingGeometry(8.5, 8.5 + lineThickness, 48);
    circleGeo.rotateX(-Math.PI / 2);
    const circleMesh = new THREE.Mesh(circleGeo, lineMat);
    circleMesh.position.set(0, yPos, 0);
    scene.add(circleMesh);

    // Center spot
    const spotGeo = new THREE.CircleGeometry(0.6, 24);
    spotGeo.rotateX(-Math.PI / 2);
    const spotMesh = new THREE.Mesh(spotGeo, lineMat);
    spotMesh.position.set(0, yPos, 0);
    scene.add(spotMesh);

    // Penalty Boxes (Top and Bottom)
    const boxW = 28;
    const boxD = 14;
    // North penalty box
    addRectLine(0, -hl + boxD, boxW, lineThickness);
    addRectLine(-boxW / 2, -hl + boxD / 2, lineThickness, boxD);
    addRectLine(boxW / 2, -hl + boxD / 2, lineThickness, boxD);

    // South penalty box
    addRectLine(0, hl - boxD, boxW, lineThickness);
    addRectLine(-boxW / 2, hl - boxD / 2, lineThickness, boxD);
    addRectLine(boxW / 2, hl - boxD / 2, lineThickness, boxD);
  }

  private createStadiumStands(scene: THREE.Scene) {
    const crowdTex = TextureGenerator.createCrowdTexture();
    const standMat = new THREE.MeshStandardMaterial({ 
      map: crowdTex,
      roughness: 0.9,
      metalness: 0.1
    });

    const structureMat = new THREE.MeshStandardMaterial({
      color: 0x0a0f1a, // Dark steel
      roughness: 0.4,
      metalness: 0.8
    });

    // Create 4 multi-tiered bleachers surrounding the pitch
    const createTieredStand = (x: number, z: number, w: number, rotY: number) => {
      const standGroup = new THREE.Group();

      const tiers = 5;
      for (let t = 0; t < tiers; t++) {
        const tierWidth = w;
        const tierHeight = 2.5;
        const tierDepth = 4;

        // Front seating face with crowd
        const seatGeo = new THREE.BoxGeometry(tierWidth, tierHeight, tierDepth);
        const seatMesh = new THREE.Mesh(seatGeo, standMat);
        seatMesh.position.set(0, (t + 1) * tierHeight * 0.9, -t * tierDepth);
        seatMesh.castShadow = true;
        seatMesh.receiveShadow = true;
        standGroup.add(seatMesh);
      }

      // Roof Canopy
      const roofGeo = new THREE.BoxGeometry(w, 1.5, tiers * 4.5);
      const roofMesh = new THREE.Mesh(roofGeo, structureMat);
      roofMesh.position.set(0, tiers * 3.2, -tiers * 1.8);
      roofMesh.rotation.x = 0.15;
      standGroup.add(roofMesh);

      standGroup.position.set(x, 0, z);
      standGroup.rotation.y = rotY;
      scene.add(standGroup);
    };

    const sideDist = this.fieldWidth / 2 + 10;
    const endDist = this.fieldLength / 2 + 12;

    // West & East Main Stands
    createTieredStand(-sideDist, 0, this.fieldLength + 10, Math.PI / 2);
    createTieredStand(sideDist, 0, this.fieldLength + 10, -Math.PI / 2);

    // North & South Goal Stands
    createTieredStand(0, -endDist, this.fieldWidth + 10, 0);
    createTieredStand(0, endDist, this.fieldWidth + 10, Math.PI);
  }

  private createDigitalBillboards(scene: THREE.Scene) {
    const clubs: import('../engine/TextureGenerator').ClubBannerData[] = [
      { name: 'FC BARCELONA', slogan: 'MÉS QUE UN CLUB', primaryColor: '#004d98', secondaryColor: '#a50044', textColor: '#ffffff', accentColor: '#ffd700' },
      { name: 'REAL MADRID C.F.', slogan: '¡HALA MADRID Y NADA MÁS!', primaryColor: '#ffffff', secondaryColor: '#1e1b4b', textColor: '#ffffff', accentColor: '#f59e0b' },
      { name: 'ATLÉTICO DE MADRID', slogan: 'CORAJE Y CORAZÓN', primaryColor: '#cb3524', secondaryColor: '#ffffff', textColor: '#ffffff', accentColor: '#1d4ed8' },
      { name: 'DEPORTIVO ALAVÉS', slogan: 'BABAZORROAK • 1921', primaryColor: '#005bac', secondaryColor: '#ffffff', textColor: '#ffffff', accentColor: '#60a5fa' },
      { name: 'CA OSASUNA', slogan: 'EL SADAR • NAFARROA', primaryColor: '#d71920', secondaryColor: '#001a49', textColor: '#ffffff', accentColor: '#facc15' },
      { name: 'SEVILLA FC', slogan: 'NUNCA SE RINDE', primaryColor: '#d4001f', secondaryColor: '#ffffff', textColor: '#ffffff', accentColor: '#ffd700' },
      { name: 'REAL BETIS', slogan: 'MUCHO BETIS • BALOMPIÉ', primaryColor: '#00954c', secondaryColor: '#ffffff', textColor: '#ffffff', accentColor: '#4ade80' },
      { name: 'RC DEPORTIVO', slogan: 'FORZA DÉPOR • A CORUÑA', primaryColor: '#005bac', secondaryColor: '#ffffff', textColor: '#ffffff', accentColor: '#facc15' },
      { name: 'LEVANTE UD', slogan: 'ORGULL GRANOTA • 1909', primaryColor: '#a61c3c', secondaryColor: '#004785', textColor: '#ffffff', accentColor: '#38bdf8' },
      { name: 'LALIGA EA SPORTS', slogan: 'THE POWER OF OUR FÚTBOL', primaryColor: '#ff1493', secondaryColor: '#000000', textColor: '#ffffff', accentColor: '#ffd700' },
    ];

    const billboardW = 18;
    const billboardH = 3.2;
    const zOffset = this.fieldLength / 2 + 1.5;
    const xOffset = this.fieldWidth / 2 + 1.5;

    const placeBoard = (x: number, y: number, z: number, rotY: number, idx: number) => {
      const club = clubs[idx % clubs.length];
      const tex = TextureGenerator.createClubBillboardTexture(club);

      const geo = new THREE.BoxGeometry(billboardW, billboardH, 0.4);
      const mat = new THREE.MeshStandardMaterial({
        map: tex,
        emissive: new THREE.Color(club.accentColor),
        emissiveMap: tex,
        emissiveIntensity: 0.6,
        roughness: 0.2
      });

      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      mesh.rotation.y = rotY;
      scene.add(mesh);
    };

    // North & South sideline LED boards
    placeBoard(-20, 1.8, -zOffset, 0, 0); // Barcelona
    placeBoard(20, 1.8, -zOffset, 0, 1);  // Real Madrid
    placeBoard(-20, 1.8, zOffset, Math.PI, 2); // Atlético Madrid
    placeBoard(20, 1.8, zOffset, Math.PI, 3);  // Alavés

    // East & West boards
    placeBoard(-xOffset, 1.8, -30, Math.PI / 2, 4); // Osasuna
    placeBoard(-xOffset, 1.8, 0, Math.PI / 2, 5);   // Sevilla
    placeBoard(-xOffset, 1.8, 30, Math.PI / 2, 6);  // Real Betis

    placeBoard(xOffset, 1.8, -30, -Math.PI / 2, 7); // Deportivo
    placeBoard(xOffset, 1.8, 0, -Math.PI / 2, 8);   // Levante
    placeBoard(xOffset, 1.8, 30, -Math.PI / 2, 9);  // LaLiga
  }

  private createFloodlights(scene: THREE.Scene) {
    const corners = [
      { x: -this.fieldWidth / 2 - 8, z: -this.fieldLength / 2 - 8 },
      { x: this.fieldWidth / 2 + 8, z: -this.fieldLength / 2 - 8 },
      { x: -this.fieldWidth / 2 - 8, z: this.fieldLength / 2 + 8 },
      { x: this.fieldWidth / 2 + 8, z: this.fieldLength / 2 + 8 },
    ];

    const towerMat = new THREE.MeshStandardMaterial({ color: 0x2e1065, metalness: 0.8, roughness: 0.3 });
    const lightHeadMat = new THREE.MeshBasicMaterial({ color: 0xffe4e6 });

    corners.forEach(c => {
      // Light Mast
      const mastGeo = new THREE.CylinderGeometry(0.6, 0.9, 32, 8);
      const mast = new THREE.Mesh(mastGeo, towerMat);
      mast.position.set(c.x, 16, c.z);
      scene.add(mast);

      // Light Head Array
      const headGeo = new THREE.BoxGeometry(5, 3, 2);
      const head = new THREE.Mesh(headGeo, lightHeadMat);
      head.position.set(c.x, 32, c.z);
      head.lookAt(0, 0, 0);
      scene.add(head);

      // Spot Light aimed at pitch with soft rose tint
      const spot = new THREE.SpotLight(0xfff1f2, 1.6, 140, Math.PI / 4, 0.4, 1);
      spot.position.set(c.x, 32, c.z);
      spot.target.position.set(0, 0, 0);
      scene.add(spot);
      scene.add(spot.target);
    });
  }

  private createGoals(scene: THREE.Scene, world: RAPIER.World) {
    const goalWidth = 16;
    const goalHeight = 5.5;
    const goalDepth = 4.5;
    const halfLen = (this.fieldLength - 8) / 2;
    const postRadius = 0.25;

    // Authentic White Tubular Steel Goal Posts
    const postMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.25,
      metalness: 0.8
    });

    // Realistic Hexagonal Soccer Netting
    const netMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      wireframe: true,
      transparent: true,
      opacity: 0.65
    });

    const buildGoal = (zPos: number, isNorth: boolean) => {
      const group = new THREE.Group();
      const zDir = isNorth ? -1 : 1;

      // Posts (Left & Right)
      const postGeo = new THREE.CylinderGeometry(postRadius, postRadius, goalHeight, 16);
      
      const leftPost = new THREE.Mesh(postGeo, postMat);
      leftPost.position.set(-goalWidth / 2, goalHeight / 2, 0);
      group.add(leftPost);

      const rightPost = new THREE.Mesh(postGeo, postMat);
      rightPost.position.set(goalWidth / 2, goalHeight / 2, 0);
      group.add(rightPost);

      // Crossbar
      const crossbarGeo = new THREE.CylinderGeometry(postRadius, postRadius, goalWidth + postRadius * 2, 16);
      crossbarGeo.rotateZ(Math.PI / 2);
      const crossbar = new THREE.Mesh(crossbarGeo, postMat);
      crossbar.position.set(0, goalHeight, 0);
      group.add(crossbar);

      // Back Net
      const netGeo = new THREE.BoxGeometry(goalWidth, goalHeight, goalDepth);
      const netMesh = new THREE.Mesh(netGeo, netMat);
      netMesh.position.set(0, goalHeight / 2, (goalDepth / 2) * zDir);
      group.add(netMesh);

      group.position.set(0, 0, zPos);
      scene.add(group);

      // Physics colliders for Goal Posts & Crossbar
      const addPostCollider = (x: number, y: number, z: number, hx: number, hy: number, hz: number) => {
        const bodyDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(x, y, z);
        const body = world.createRigidBody(bodyDesc);
        const colDesc = RAPIER.ColliderDesc.cuboid(hx, hy, hz).setRestitution(0.7).setFriction(0.3);
        world.createCollider(colDesc, body);
      };

      // Left post collider
      addPostCollider(-goalWidth / 2, goalHeight / 2, zPos, postRadius, goalHeight / 2, postRadius);
      // Right post collider
      addPostCollider(goalWidth / 2, goalHeight / 2, zPos, postRadius, goalHeight / 2, postRadius);
      // Crossbar collider
      addPostCollider(0, goalHeight, zPos, goalWidth / 2, postRadius, postRadius);
      // Back net backstop
      addPostCollider(0, goalHeight / 2, zPos + goalDepth * zDir, goalWidth / 2, goalHeight / 2, 0.2);
      // Back net sides
      addPostCollider(-goalWidth / 2, goalHeight / 2, zPos + (goalDepth / 2) * zDir, 0.2, goalHeight / 2, goalDepth / 2);
      addPostCollider(goalWidth / 2, goalHeight / 2, zPos + (goalDepth / 2) * zDir, 0.2, goalHeight / 2, goalDepth / 2);
    };

    buildGoal(-halfLen, true);  // Opponent goal (North)
    buildGoal(halfLen, false);  // Player goal (South)
  }

  private createBoundaryColliders(world: RAPIER.World) {
    const wallH = 25; // Tall invisible barrier
    const w = this.fieldWidth;
    const l = this.fieldLength;
    const halfLen = (this.fieldLength - 8) / 2;
    const goalWidth = 16;
    const goalDepth = 4.5;

    const addBoundary = (x: number, y: number, z: number, hx: number, hy: number, hz: number) => {
      const bDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(x, y, z);
      const b = world.createRigidBody(bDesc);
      const cDesc = RAPIER.ColliderDesc.cuboid(hx, hy, hz).setRestitution(0.6).setFriction(0.2);
      world.createCollider(cDesc, b);
    };

    // Sidewalls (West & East) - completely sealing the sidelines
    addBoundary(-w / 2 - 0.5, wallH / 2, 0, 0.5, wallH / 2, l / 2 + 10);
    addBoundary(w / 2 + 0.5, wallH / 2, 0, 0.5, wallH / 2, l / 2 + 10);

    // Goal line barriers to the left and right of each goal
    const sideWallWidth = (w - goalWidth) / 2;
    const sideWallOffset = goalWidth / 2 + sideWallWidth / 2;

    // North Goal Line (left & right wings)
    addBoundary(-sideWallOffset, wallH / 2, -halfLen, sideWallWidth / 2, wallH / 2, 0.5);
    addBoundary(sideWallOffset, wallH / 2, -halfLen, sideWallWidth / 2, wallH / 2, 0.5);

    // South Goal Line (left & right wings)
    addBoundary(-sideWallOffset, wallH / 2, halfLen, sideWallWidth / 2, wallH / 2, 0.5);
    addBoundary(sideWallOffset, wallH / 2, halfLen, sideWallWidth / 2, wallH / 2, 0.5);

    // Endwalls behind goals
    addBoundary(0, wallH / 2, -halfLen - goalDepth - 2, w / 2 + 5, wallH / 2, 0.5);
    addBoundary(0, wallH / 2, halfLen + goalDepth + 2, w / 2 + 5, wallH / 2, 0.5);
  }

  private createCornerFlags(scene: THREE.Scene) {
    const hw = (this.fieldWidth - 6) / 2;
    const hl = (this.fieldLength - 8) / 2;
    const corners = [
      { x: -hw, z: -hl },
      { x: hw, z: -hl },
      { x: -hw, z: hl },
      { x: hw, z: hl },
    ];

    const poleMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.3,
      metalness: 0.1
    });

    const flagMat = new THREE.MeshStandardMaterial({
      color: 0xff1493,
      roughness: 0.5,
      metalness: 0.1,
      side: THREE.DoubleSide
    });

    const yellowFlagMat = new THREE.MeshStandardMaterial({
      color: 0xfacc15,
      roughness: 0.5,
      metalness: 0.1,
      side: THREE.DoubleSide
    });

    corners.forEach((c, idx) => {
      const group = new THREE.Group();

      // Pole
      const poleGeo = new THREE.CylinderGeometry(0.04, 0.04, 1.6, 8);
      const poleMesh = new THREE.Mesh(poleGeo, poleMat);
      poleMesh.position.y = 0.8;
      poleMesh.castShadow = true;
      group.add(poleMesh);

      // Flag banner (fluttering triangle/box)
      const flagGeo = new THREE.BoxGeometry(0.45, 0.3, 0.02);
      const flagMesh = new THREE.Mesh(flagGeo, idx % 2 === 0 ? flagMat : yellowFlagMat);
      flagMesh.position.set(0.22, 1.4, 0);
      group.add(flagMesh);

      group.position.set(c.x, 0, c.z);
      scene.add(group);
    });
  }
}
