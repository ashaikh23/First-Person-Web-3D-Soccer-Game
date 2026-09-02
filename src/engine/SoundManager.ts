import * as THREE from 'three';

export class SoundManager {
  private static instance: SoundManager;
  private ctx: AudioContext | null = null;
  private isMuted = false;
  private chargeOsc: OscillatorNode | null = null;
  private chargeGain: GainNode | null = null;

  // Ambient crowd
  private crowdGain: GainNode | null = null;
  private crowdNoise: AudioBufferSourceNode | null = null;
  private crowdFilter: BiquadFilterNode | null = null;

  private constructor() {}

  public static getInstance(): SoundManager {
    if (!SoundManager.instance) {
      SoundManager.instance = new SoundManager();
    }
    return SoundManager.instance;
  }

  private initContext() {
    if (!this.ctx) {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioContextClass();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  public ensureUnlocked() {
    this.initContext();
    this.startAmbientCrowd();
  }

  /**
   * Powerful kick impact thud with sub-bass punch and leather strike snap.
   */
  public playKick(powerRatio = 0.5) {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    const startFreq = 120 + powerRatio * 80;
    const endFreq = 35;
    const duration = 0.18 + powerRatio * 0.12;

    osc.type = 'sine';
    osc.frequency.setValueAtTime(startFreq, t);
    osc.frequency.exponentialRampToValueAtTime(endFreq, t + duration);

    gain.gain.setValueAtTime(0.7 + powerRatio * 0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

    // Leather strike noise
    const bufferSize = Math.floor(this.ctx.sampleRate * 0.05);
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    }

    const whiteNoise = this.ctx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;

    const noiseFilter = this.ctx.createBiquadFilter();
    noiseFilter.type = 'lowpass';
    noiseFilter.frequency.setValueAtTime(600 + powerRatio * 800, t);

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.5 + powerRatio * 0.5, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, t + 0.05);

    whiteNoise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(this.ctx.destination);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(t);
    osc.stop(t + duration);
    whiteNoise.start(t);
    whiteNoise.stop(t + 0.05);
  }

  /**
   * Crisp pass ball strike sound.
   */
  public playPass() {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.12);

    gain.gain.setValueAtTime(0.6, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(t);
    osc.stop(t + 0.12);
  }

  /**
   * Slide tackle grass swoosh friction sound.
   */
  public playSlideTackle() {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const duration = 0.45;
    const bufferSize = Math.floor(this.ctx.sampleRate * duration);
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      output[i] = (Math.random() * 2 - 1) * (1 - (i / bufferSize) * 0.7);
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(800, t);
    filter.frequency.exponentialRampToValueAtTime(300, t + duration);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.01, t);
    gain.gain.linearRampToValueAtTime(0.5, t + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);

    noise.start(t);
    noise.stop(t + duration);
  }

  /**
   * Goalpost / Crossbar metallic resonance clang.
   */
  public playPostHit() {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc1.type = 'sine';
    osc2.type = 'sine';
    osc1.frequency.setValueAtTime(580, t);
    osc2.frequency.setValueAtTime(880, t);

    gain.gain.setValueAtTime(0.6, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.6);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(this.ctx.destination);

    osc1.start(t);
    osc2.start(t);
    osc1.stop(t + 0.6);
    osc2.stop(t + 0.6);
  }

  /**
   * Ball bounce on turf grass.
   */
  public playBounce(velocity = 5) {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;

    const intensity = Math.min(1.0, velocity / 15.0);
    if (intensity < 0.1) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(90, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.08);

    gain.gain.setValueAtTime(intensity * 0.4, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(t);
    osc.stop(t + 0.08);
  }

  /**
   * Referee whistle blow.
   */
  public playWhistle(long = false) {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const duration = long ? 0.75 : 0.35;

    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    lfo.frequency.setValueAtTime(28, t);
    lfoGain.gain.setValueAtTime(120, t);
    lfo.connect(lfoGain);

    osc1.type = 'sine';
    osc2.type = 'sine';
    osc1.frequency.setValueAtTime(2800, t);
    osc2.frequency.setValueAtTime(3200, t);

    lfoGain.connect(osc1.frequency);
    lfoGain.connect(osc2.frequency);

    gain.gain.setValueAtTime(0.01, t);
    gain.gain.linearRampToValueAtTime(0.35, t + 0.04);
    gain.gain.setValueAtTime(0.35, t + duration - 0.06);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(this.ctx.destination);

    lfo.start(t);
    osc1.start(t);
    osc2.start(t);
    lfo.stop(t + duration);
    osc1.stop(t + duration);
    osc2.stop(t + duration);
  }

  /**
   * Stadium crowd roar when a goal is scored.
   */
  public playGoalRoar() {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const duration = 2.8;
    const bufferSize = Math.floor(this.ctx.sampleRate * duration);
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }

    const whiteNoise = this.ctx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(450, t);
    filter.frequency.linearRampToValueAtTime(950, t + 0.6);
    filter.frequency.linearRampToValueAtTime(500, t + duration);
    filter.Q.setValueAtTime(1.2, t);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.01, t);
    gain.gain.linearRampToValueAtTime(0.65, t + 0.4);
    gain.gain.linearRampToValueAtTime(0.5, t + 1.8);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

    whiteNoise.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);

    whiteNoise.start(t);
    whiteNoise.stop(t + duration);

    setTimeout(() => {
      this.playWhistle(true);
    }, 120);
  }

  /**
   * Ambient crowd murmur that reacts to distance to goal.
   */
  private startAmbientCrowd() {
    if (!this.ctx || this.crowdNoise) return;

    const bufferSize = this.ctx.sampleRate * 4;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }

    this.crowdNoise = this.ctx.createBufferSource();
    this.crowdNoise.buffer = noiseBuffer;
    this.crowdNoise.loop = true;

    this.crowdFilter = this.ctx.createBiquadFilter();
    this.crowdFilter.type = 'lowpass';
    this.crowdFilter.frequency.setValueAtTime(400, this.ctx.currentTime);

    this.crowdGain = this.ctx.createGain();
    this.crowdGain.gain.setValueAtTime(0.08, this.ctx.currentTime);

    this.crowdNoise.connect(this.crowdFilter);
    this.crowdFilter.connect(this.crowdGain);
    this.crowdGain.connect(this.ctx.destination);

    this.crowdNoise.start();
  }

  public updateCrowdIntensity(ballZ: number) {
    if (!this.ctx || !this.crowdGain || !this.crowdFilter) return;

    // Ball near either goal (Z near ±50) increases crowd excitement
    const distToGoal = Math.min(Math.abs(ballZ - 51), Math.abs(ballZ - (-51)));
    const excitement = THREE.MathUtils.clamp(1.0 - distToGoal / 35.0, 0, 1);

    const targetGain = 0.08 + excitement * 0.14;
    const targetFreq = 400 + excitement * 400;

    const t = this.ctx.currentTime;
    this.crowdGain.gain.setTargetAtTime(targetGain, t, 0.2);
    this.crowdFilter.frequency.setTargetAtTime(targetFreq, t, 0.2);
  }

  public startChargeRiser() {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx || this.chargeOsc) return;

    const t = this.ctx.currentTime;
    this.chargeOsc = this.ctx.createOscillator();
    this.chargeGain = this.ctx.createGain();

    this.chargeOsc.type = 'sine';
    this.chargeOsc.frequency.setValueAtTime(160, t);
    this.chargeOsc.frequency.exponentialRampToValueAtTime(550, t + 1.0);

    this.chargeGain.gain.setValueAtTime(0.01, t);
    this.chargeGain.gain.linearRampToValueAtTime(0.2, t + 0.1);

    this.chargeOsc.connect(this.chargeGain);
    this.chargeGain.connect(this.ctx.destination);

    this.chargeOsc.start(t);
  }

  public stopChargeRiser() {
    if (this.chargeOsc && this.chargeGain && this.ctx) {
      const t = this.ctx.currentTime;
      this.chargeGain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
      this.chargeOsc.stop(t + 0.05);
      this.chargeOsc = null;
      this.chargeGain = null;
    }
  }
}
