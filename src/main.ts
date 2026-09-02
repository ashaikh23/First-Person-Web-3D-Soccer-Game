import './style.css';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { Renderer } from './engine/Renderer';
import { Physics } from './engine/Physics';
import { Pitch } from './entities/Pitch';
import { Ball } from './entities/Ball';
import { PlayerController } from './entities/PlayerController';
import { DribbleShoot } from './mechanics/DribbleShoot';
import { PracticeMode } from './modes/PracticeMode';
import { MatchMode } from './modes/MatchMode';
import { GameManager, Difficulty } from './state/GameManager';
import { flatDist } from './ai/SoccerAI';
import { MiniMap } from './engine/MiniMap';
import { SoundManager } from './engine/SoundManager';
import { ParticleSystem } from './engine/ParticleSystem';
import { CameraEffects } from './engine/CameraEffects';
import { BallTrail } from './engine/BallTrail';

async function init() {
  await RAPIER.init();

  const renderer = new Renderer();
  const physics = new Physics();
  const miniMap = new MiniMap('minimap');
  const sounds = SoundManager.getInstance();
  const particles = new ParticleSystem(renderer.scene);
  const cameraEffects = new CameraEffects(renderer.camera);
  const ballTrail = new BallTrail(renderer.scene);

  // Stadium & Pitch
  new Pitch(renderer.scene, physics.world);
  
  // Match Ball
  const ball = new Ball(renderer.scene, physics.world, new THREE.Vector3(0, 1.0, 5.0));

  // Player with Athletic Soccer Legs
  const player = new PlayerController(renderer.scene, renderer.camera, physics.world, new THREE.Vector3(0, 1.8, 10.0));

  // 3D Aim Trajectory Arrow & Dribble/Shoot mechanics
  const mechanics = new DribbleShoot(renderer.scene, player, ball, particles, cameraEffects);

  // Game Modes
  let practiceMode: PracticeMode | null = null;
  let matchMode: MatchMode | null = null;

  const gm = GameManager.getInstance();

  // ── UI ELEMENTS ──
  const startMenu = document.getElementById('start-menu')!;
  const uiContainer = document.getElementById('ui-container')!;
  const pauseMenu = document.getElementById('pause-menu')!;
  const resultsModal = document.getElementById('results-modal')!;
  const btnPractice = document.getElementById('btn-practice')!;
  const btnMatch = document.getElementById('btn-match')!;
  const btnStart = document.getElementById('btn-start')!;
  const btnResume = document.getElementById('btn-resume')!;
  const btnQuit = document.getElementById('btn-quit')!;
  const btnPlayAgain = document.getElementById('btn-play-again')!;
  const btnResultsMenu = document.getElementById('btn-results-menu')!;
  const scoreElem = document.getElementById('score')!;
  const timerElem = document.getElementById('timer')!;
  const modeElem = document.getElementById('mode')!;
  const difficultySelection = document.getElementById('difficulty-selection')!;
  const diffButtons = document.querySelectorAll('.diff-btn');

  // ── MODE SELECTION ──
  btnPractice.addEventListener('click', () => {
    gm.gameMode = 'Practice';
    btnPractice.classList.add('active');
    btnMatch.classList.remove('active');
    difficultySelection.style.display = 'none';
    btnStart.style.display = 'block';
  });

  btnMatch.addEventListener('click', () => {
    gm.gameMode = 'Match';
    btnMatch.classList.add('active');
    btnPractice.classList.remove('active');
    difficultySelection.style.display = 'block';
    btnStart.style.display = 'block';
  });

  // ── DIFFICULTY SELECTION ──
  diffButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      diffButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      gm.difficulty = (btn as HTMLElement).dataset.diff as Difficulty;
    });
  });

  // ── MODE VISIBILITY SYNC ──
  const syncModeVisibility = () => {
    if (gm.gameMode === 'Practice') {
      if (!practiceMode) {
        practiceMode = new PracticeMode(renderer.scene, physics.world);
      }
      practiceMode.setVisible(true);
      if (matchMode) matchMode.setVisible(false);
    } else {
      if (!matchMode) {
        matchMode = new MatchMode(renderer.scene, physics.world, particles);
      }
      matchMode.setVisible(true);
      if (practiceMode) practiceMode.setVisible(false);
    }
  };

  // ── START GAME ──
  btnStart.addEventListener('click', () => {
    gm.isGameStarted = true;
    sounds.ensureUnlocked();
    sounds.playWhistle();

    startMenu.style.display = 'none';
    uiContainer.style.display = 'block';
    modeElem.innerText = `Mode: ${gm.gameMode === 'Practice' ? 'Practice Mode' : 'Match Mode'}`;

    syncModeVisibility();
    player.controls.lock();
  });

  // ── PAUSE / RESUME ──
  player.controls.addEventListener('unlock', () => {
    if (gm.isGameStarted && resultsModal.style.display !== 'flex') {
      pauseMenu.style.display = 'flex';
      uiContainer.style.display = 'none';
    }
  });

  btnResume.addEventListener('click', () => {
    pauseMenu.style.display = 'none';
    uiContainer.style.display = 'block';
    player.controls.lock();
  });

  btnQuit.addEventListener('click', () => {
    window.location.reload();
  });

  // ── FULL TIME RESULTS ──
  const showFullTimeResults = () => {
    gm.isGameStarted = false;
    player.controls.unlock();
    uiContainer.style.display = 'none';
    pauseMenu.style.display = 'none';
    resultsModal.style.display = 'flex';

    sounds.playWhistle(true);

    const titleElem = document.getElementById('results-title')!;
    if (gm.score > gm.enemyScore) {
      titleElem.textContent = 'VICTORY! PINK FC WINS!';
      titleElem.style.color = '#ff1493';
      sounds.playGoalRoar();
    } else if (gm.score < gm.enemyScore) {
      titleElem.textContent = 'FULL TIME - VIOLET FC WINS';
      titleElem.style.color = '#a855f7';
    } else {
      titleElem.textContent = 'DRAW / MATCH TIED';
      titleElem.style.color = '#ffd700';
    }

    document.getElementById('res-score-pink')!.textContent = String(gm.score);
    document.getElementById('res-score-violet')!.textContent = String(gm.enemyScore);

    const poss = gm.getPossessionPercentage();
    document.getElementById('stat-possession')!.textContent = `${poss.player}% - ${poss.enemy}%`;
    document.getElementById('stat-shots')!.textContent = `${gm.shotsTotal} (${gm.shotsOnTarget})`;
    document.getElementById('stat-passes')!.textContent = String(gm.passesCompleted);
  };

  btnPlayAgain.addEventListener('click', () => {
    resultsModal.style.display = 'none';
    gm.reset();
    gm.isGameStarted = true;
    uiContainer.style.display = 'block';
    ball.resetPosition(new THREE.Vector3(0, 0.6, 0));
    player.resetPosition(new THREE.Vector3(0, 1.8, 10.0));
    sounds.playWhistle();
    player.controls.lock();
  });

  btnResultsMenu.addEventListener('click', () => {
    window.location.reload();
  });

  // ── PASS LOGIC (E KEY / RIGHT CLICK) ──
  const executePass = () => {
    if (!gm.isGameStarted || !player.controls.isLocked || !matchMode || gm.gameMode !== 'Match') return;
    const playerPos = player.camera.position.clone();
    const ballPos = new THREE.Vector3(
      ball.body.translation().x,
      ball.body.translation().y,
      ball.body.translation().z
    );

    // Generous pass range (up to 6.5m around player)
    if (flatDist(playerPos, ballPos) < 6.5) {
      const enemyPositions = matchMode.enemyAI.getPositions();
      const lookDir = new THREE.Vector3();
      player.camera.getWorldDirection(lookDir);
      lookDir.y = 0;
      lookDir.normalize();

      const bestIdx = matchMode.teammateAI.findBestPassTarget(playerPos, enemyPositions, lookDir);

      if (bestIdx >= 0) {
        const teammatePositions = matchMode.teammateAI.getPositions();
        const target = teammatePositions[bestIdx];

        // Pass the ball directly to that teammate with crisp, reliable velocity
        const dir = new THREE.Vector3(target.x - ballPos.x, 0, target.z - ballPos.z);
        const dist = dir.length();
        if (dist > 0.1) {
          dir.divideScalar(dist);
          const passSpeed = Math.min(24.0, dist * 1.1 + 8.0);

          sounds.playPass();
          particles.spawnTurfDust(ballPos, dir, 8);
          gm.passesCompleted++;

          ball.body.setLinvel({
            x: dir.x * passSpeed,
            y: 0.15,
            z: dir.z * passSpeed
          }, true);

          // Notify teammate to intercept & trap
          matchMode.teammateAI.notifyPassIncoming(bestIdx);

          // Trigger kick animation
          player.triggerKick();
        }
      }
    }
  };

  document.addEventListener('keydown', (e) => {
    if (e.code === 'KeyE') executePass();
  });

  document.addEventListener('mousedown', (e) => {
    if (e.button === 2 && player.controls.isLocked) {
      executePass();
    }
  });

  document.addEventListener('contextmenu', (e) => e.preventDefault());

  // ── MODE SWITCH (M) ──
  document.addEventListener('keydown', (e) => {
    if (e.code === 'KeyM' && gm.isGameStarted && player.controls.isLocked) {
      gm.gameMode = gm.gameMode === 'Practice' ? 'Match' : 'Practice';
      modeElem.innerText = `Mode: ${gm.gameMode === 'Practice' ? 'Practice Mode' : 'Match Mode'}`;
      syncModeVisibility();
    }
  });

  // ── MINIMAP TOGGLE MINIMIZE (N / CLICK) ──
  const minimapContainer = document.getElementById('minimap-container')!;
  const btnToggleMinimap = document.getElementById('btn-toggle-minimap')!;
  let isMinimapMinimized = false;

  const toggleMinimap = () => {
    isMinimapMinimized = !isMinimapMinimized;
    if (isMinimapMinimized) {
      minimapContainer.classList.add('minimized');
      btnToggleMinimap.textContent = '+';
    } else {
      minimapContainer.classList.remove('minimized');
      btnToggleMinimap.textContent = '−';
    }
  };

  btnToggleMinimap.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleMinimap();
  });

  document.addEventListener('keydown', (e) => {
    if (e.code === 'KeyN' && gm.isGameStarted) {
      toggleMinimap();
    }
  });

  // ── GAME LOOP ──
  const clock = new THREE.Clock();
  let prevBallVelY = 0;
  let wasSliding = false;

  function animate() {
    requestAnimationFrame(animate);

    const isRunning = gm.isGameStarted && player.controls.isLocked;
    const rawDelta = clock.getDelta();
    const deltaTime = isRunning ? Math.min(rawDelta, 0.1) : 0;
    
    if (isRunning) {
      physics.step(deltaTime);
      ball.update();
      player.update(deltaTime);
      mechanics.update(deltaTime);
      particles.update(deltaTime);
      cameraEffects.update(deltaTime, gm.stamina > 0 && Boolean(player['isSprinting']));

      // Ball Trailing Speed Ribbon
      const ballPosVec = ball.mesh.position;
      const bLinvel = ball.body.linvel();
      const ballVelVec = new THREE.Vector3(bLinvel.x, bLinvel.y, bLinvel.z);
      ballTrail.update(ballPosVec, ballVelVec);

      // Slide Tackle Sound & Turf Particle Burst
      if (player.isSliding && !wasSliding) {
        sounds.playSlideTackle();
        const fwd = new THREE.Vector3();
        player.camera.getWorldDirection(fwd);
        particles.spawnTurfDust(player.camera.position, fwd, 20);

        // Slide tackle ball steal if close
        if (flatDist(player.camera.position, ballPosVec) < 2.5) {
          ball.body.setLinvel({
            x: fwd.x * 16.0,
            y: 0.2,
            z: fwd.z * 16.0
          }, true);
        }
      }
      wasSliding = player.isSliding;

      // Ball Bounce Sound on Pitch
      if (prevBallVelY < -2.0 && bLinvel.y > 0.5 && ballPosVec.y < 0.8) {
        sounds.playBounce(Math.abs(prevBallVelY));
      }
      prevBallVelY = bLinvel.y;

      // Reactive Crowd Atmosphere
      sounds.updateCrowdIntensity(ballPosVec.z);
      
      // Game Timer
      gm.timer += deltaTime;
      const mins = Math.floor(gm.timer / 60).toString().padStart(2, '0');
      const secs = Math.floor(gm.timer % 60).toString().padStart(2, '0');
      timerElem.innerText = `${mins}:${secs}`;

      // Match Full Time at 5:00 minutes (in Match Mode)
      if (gm.gameMode === 'Match' && gm.timer >= 300) {
        showFullTimeResults();
      }

      // Player Goal Detection (Opponent Goal at Z = -51)
      if (ballPosVec.z < -50.5 && Math.abs(ballPosVec.x) < 8.0 && ballPosVec.y < 5.5) {
        gm.score += 1;
        if (gm.gameMode === 'Match' && matchMode) {
          matchMode.resetKickoff('player', player, ball);
        } else {
          sounds.playGoalRoar();
          particles.spawnGoalCelebration(new THREE.Vector3(0, 2.5, -51));
          ball.resetPosition(new THREE.Vector3(0, 1.0, 5));
          player.resetPosition(new THREE.Vector3(0, 1.8, 10));
        }
      }

      // Out of Bounds Sideline & Corner Resets
      if (Math.abs(ballPosVec.x) > 34.0) {
        // Touchline out of bounds -> place on touchline with short whistle
        sounds.playWhistle();
        const resetX = Math.sign(ballPosVec.x) * 32.0;
        ball.resetPosition(new THREE.Vector3(resetX, 0.6, ballPosVec.z));
      }

      // Mode Updates
      if (gm.gameMode === 'Practice' && practiceMode) {
        practiceMode.update(deltaTime, ball);
      } else if (gm.gameMode === 'Match' && matchMode) {
        matchMode.update(deltaTime, ball, player);
      }
    } else {
      // Keep visuals updated even while paused / in menu
      ball.mesh.position.set(
        ball.body.translation().x,
        ball.body.translation().y,
        ball.body.translation().z
      );
      particles.update(deltaTime);
    }

    if (gm.isGameStarted) {
      // ── MINIMAP RADAR UPDATE ──
      if (!isMinimapMinimized) {
        const pPos = player.camera.position;
        const forward = new THREE.Vector3();
        player.camera.getWorldDirection(forward);
        const playerYaw = Math.atan2(forward.x, forward.z) + Math.PI;

        const teammates = (matchMode && gm.gameMode === 'Match') ? matchMode.teammateAI.getPositions() : [];
        const enemies = (matchMode && gm.gameMode === 'Match') ? matchMode.enemyAI.getPositions() : [];
        const goalies = (matchMode && gm.gameMode === 'Match') ? matchMode.getGoaliePositions() : [];
        const cones = (practiceMode && gm.gameMode === 'Practice') ? practiceMode.getCones() : [];

        miniMap.render(pPos, playerYaw, ball.mesh.position, teammates, enemies, goalies, cones);
      }

      // Update score displays
      scoreElem.innerText = String(gm.score);
    }

    renderer.render();
  }

  animate();
}

init().catch(console.error);
