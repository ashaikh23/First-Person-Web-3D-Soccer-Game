import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { TextureGenerator } from '../engine/TextureGenerator';

export class Ball {
  public mesh: THREE.Mesh;
  public body: RAPIER.RigidBody;

  constructor(scene: THREE.Scene, world: RAPIER.World, position: THREE.Vector3) {
    const radius = 0.55;
    
    // 1. Realistic Match Soccer Ball Texture
    const soccerTex = TextureGenerator.createSoccerBallTexture();

    // 2. Ball Visuals (White leather with pink & gold panel styling)
    const geometry = new THREE.SphereGeometry(radius, 32, 32);
    const material = new THREE.MeshStandardMaterial({ 
      map: soccerTex,
      roughness: 0.35,
      metalness: 0.05
    });

    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    scene.add(this.mesh);

    // 3. Realistic Soccer Ball Physics
    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(position.x, position.y, position.z)
      .setLinearDamping(0.6)   // Natural rolling deceleration on pitch grass
      .setAngularDamping(1.0)  // Natural spin rolling resistance
      .setCcdEnabled(true);    // Continuous collision detection
      
    this.body = world.createRigidBody(bodyDesc);
    
    const colliderDesc = RAPIER.ColliderDesc.ball(radius)
      .setRestitution(0.50)   // Authentic match ball bounce
      .setFriction(0.75)      // Authentic grass friction
      .setDensity(2.5);       // Authentic ball weight
    world.createCollider(colliderDesc, this.body);
  }

  public update() {
    const translation = this.body.translation();
    const rotation = this.body.rotation();
    
    this.mesh.position.set(translation.x, translation.y, translation.z);
    this.mesh.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);

    // Safety bounds check
    if (translation.y < -5 || translation.y > 40 || Math.abs(translation.x) > 40 || Math.abs(translation.z) > 60) {
      this.resetPosition(new THREE.Vector3(0, 0.6, 0));
    }
  }

  public resetPosition(position: THREE.Vector3) {
    this.body.setTranslation({ x: position.x, y: position.y, z: position.z }, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.mesh.position.copy(position);
  }
}
