import RAPIER from '@dimforge/rapier3d-compat';

export class Physics {
  public world: RAPIER.World;
  private accumulator = 0;
  private readonly FIXED_DT = 1 / 60;

  constructor() {
    const gravity = { x: 0.0, y: -9.81, z: 0.0 };
    this.world = new RAPIER.World(gravity);
  }

  /** Fixed-timestep stepping: call once per frame with the real delta. */
  public step(frameDelta: number) {
    this.accumulator += frameDelta;

    // Step at most 3 times per frame to avoid spiral of death
    let steps = 0;
    while (this.accumulator >= this.FIXED_DT && steps < 3) {
      this.world.step();
      this.accumulator -= this.FIXED_DT;
      steps++;
    }
  }
}
