import * as THREE from 'three';

export class CameraEffects {
  private camera: THREE.PerspectiveCamera;
  private baseFov: number;
  private currentFov: number;
  private shakeIntensity = 0;
  private shakeDecay = 4.0;
  private shakeOffset = new THREE.Vector3();

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
    this.baseFov = camera.fov;
    this.currentFov = camera.fov;
  }

  /**
   * Apply impact screen shake impulse.
   */
  public addShake(intensity = 0.25) {
    this.shakeIntensity = Math.min(0.6, this.shakeIntensity + intensity);
  }

  public update(deltaTime: number, isSprinting: boolean) {
    // 1. Dynamic Sprint FOV
    const targetFov = isSprinting ? this.baseFov + 8.0 : this.baseFov;
    this.currentFov = THREE.MathUtils.lerp(this.currentFov, targetFov, deltaTime * 6.0);
    if (Math.abs(this.camera.fov - this.currentFov) > 0.01) {
      this.camera.fov = this.currentFov;
      this.camera.updateProjectionMatrix();
    }

    // 2. Screen Shake Decay & Offset
    if (this.shakeIntensity > 0.001) {
      this.shakeIntensity = Math.max(0, this.shakeIntensity - this.shakeDecay * deltaTime);
      
      const angle = Math.random() * Math.PI * 2;
      const amount = this.shakeIntensity * 0.12;
      this.shakeOffset.set(Math.cos(angle) * amount, Math.sin(angle) * amount, 0);
      
      this.camera.position.add(this.shakeOffset);
    }
  }
}
