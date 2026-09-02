import * as THREE from 'three';

export class BallTrail {
  private mesh: THREE.Line;
  private geometry: THREE.BufferGeometry;
  private positions: Float32Array;
  private colors: Float32Array;
  private maxPoints = 20;
  private history: THREE.Vector3[] = [];

  constructor(scene: THREE.Scene) {
    this.positions = new Float32Array(this.maxPoints * 3);
    this.colors = new Float32Array(this.maxPoints * 3);

    // Initialize gradient colors (bright white/pink head fading to transparent tail)
    for (let i = 0; i < this.maxPoints; i++) {
      const alpha = 1.0 - i / this.maxPoints;
      // Head is bright white/pink (1.0, 0.2, 0.6), tail fades out
      this.colors[i * 3] = 1.0 * alpha;
      this.colors[i * 3 + 1] = (0.2 + 0.8 * alpha) * alpha;
      this.colors[i * 3 + 2] = (0.6 + 0.4 * alpha) * alpha;
    }

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));

    const material = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
      linewidth: 3,
      depthWrite: false
    });

    this.mesh = new THREE.Line(this.geometry, material);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  public update(ballPos: THREE.Vector3, ballVelocity: THREE.Vector3) {
    const speed = ballVelocity.length();

    if (speed > 10.0) {
      // Add current position to head of history
      this.history.unshift(ballPos.clone());
      if (this.history.length > this.maxPoints) {
        this.history.pop();
      }
      this.mesh.visible = true;
    } else {
      // Shrink trail when ball slows down
      if (this.history.length > 0) {
        this.history.pop();
      }
      if (this.history.length < 2) {
        this.mesh.visible = false;
        return;
      }
    }

    // Populate buffer with historical positions
    for (let i = 0; i < this.history.length; i++) {
      const p = this.history[i];
      this.positions[i * 3] = p.x;
      this.positions[i * 3 + 1] = p.y;
      this.positions[i * 3 + 2] = p.z;
    }

    this.geometry.setDrawRange(0, this.history.length);
    (this.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }
}
