import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { useGameStore, WeaponType } from '../store/useGameStore';
import { audioManager } from './AudioManager';
import { LANE_WIDTH, FORWARD_SPEED, GRAVITY, JUMP_VELOCITY, TRAIN_LENGTH, COLORS, MAX_TRAINS, TRAIN_GAP, WEAPONS } from './constants';

type Lane = -1 | 0 | 1;

interface Enemy {
  mesh: THREE.Mesh;
  type: 'grunt' | 'dodger' | 'shielder' | 'gunner' | 'bomber' | 'boss';
  hp: number;
  lane: Lane;
  zBase: number; // Base position on the train
  state: string;
  timer: number;
}

interface Particle {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
}

interface Projectile {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  isPlayer: boolean;
  life: number;
}

interface Pickup {
  mesh: THREE.Mesh;
  type: 'health' | 'shield' | 'rapid' | 'coin';
  zBase: number;
  lane: Lane;
  spinY: number;
}

export class GameEngine {
  container: HTMLElement;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  
  clock: THREE.Clock;
  isRunning: boolean = false;
  
  // Game Objects
  player: THREE.Object3D;
  trains: THREE.Group[] = [];
  enemies: Enemy[] = [];
  particles: Particle[] = [];
  projectiles: Projectile[] = [];
  pickups: Pickup[] = [];
  
  // Game Loop / Progress
  runTime: number = 0;
  shootTimer: number = 0;
  isShooting: boolean = false;
  
  // Player State
  lane: Lane = 0;
  targetX: number = 0;
  yVelocity: number = 0;
  isJumping: boolean = false;
  currentZ: number = 0;
  
  // Combat State
  timeScale: number = 1.0;
  
  // Inputs
  keys: { [key: string]: boolean } = {};
  
  // Shake
  shakeTimer: number = 0;
  shakeIntensity: number = 0;
  
  // Environment
  scenery: THREE.Group;

  constructor(container: HTMLElement) {
    this.container = container;
    
    // Setup Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0a1a);
    this.scene.fog = new THREE.Fog(0x0a0a1a, 20, 150);
    
    // Setup Camera
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.camera.position.set(0, 5, 10);
    
    // Setup Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.container.appendChild(this.renderer.domElement);
    
    // Lighting
    const dirLight = new THREE.DirectionalLight(0xccddff, 1.5);
    dirLight.position.set(10, 20, 10);
    this.scene.add(dirLight);
    
    const ambLight = new THREE.AmbientLight(0x404040, 2);
    this.scene.add(ambLight);
    
    /* =========================================================
     * HOW TO REPLACE CUBES WITH REAL 3D MODELS:
     * 1. Import GLTFLoader:
     *    import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
     * 2. Initialize it:
     *    const loader = new GLTFLoader();
     * 3. Load your model (e.g., player model):
     *    loader.load('https://your-cdn.com/player.glb', (gltf) => {
     *       const model = gltf.scene;
     *       this.scene.add(model);
     *       this.player = model; // Replace the box mesh
     *    });
     * put your `.glb` or `.gltf` model URLs there. 
     * You can do this for enemies, trains, and the player.
     * ========================================================= */

    // Setup Player
    this.player = new THREE.Group();
    this.player.position.y = 1;

    // Default Placeholder Box
    const playerGeo = new THREE.BoxGeometry(1, 2, 1);
    const playerMat = new THREE.MeshStandardMaterial({ color: COLORS.player, emissive: 0x005544 });
    const placeholder = new THREE.Mesh(playerGeo, playerMat);
    this.player.add(placeholder);

    // Add visual "Gun" to placeholder
    const gunGeo = new THREE.BoxGeometry(0.3, 0.4, 1.2);
    const gunMat = new THREE.MeshStandardMaterial({ color: 0x555555 });
    const gun = new THREE.Mesh(gunGeo, gunMat);
    gun.position.set(0.65, 0.2, -0.5); // attached to right side
    placeholder.add(gun);

    this.scene.add(this.player);

    // Async GLTF Loading
    const loader = new GLTFLoader();
    // Assuming the user places 'maincaracter.glb' in the vite public folder -> served at /maincaracter.glb
    loader.load(
      '/maincaracter.glb',
      (gltf) => {
        console.log('Player model loaded successfully');
        // Remove placeholder and add the loaded model
        this.player.remove(placeholder);
        
        const model = gltf.scene;
        
        // Optional: you may need to adjust scale, rotation & position of the model to fit
        model.scale.set(1, 1, 1); 
        model.position.set(0, -1, 0); // shift down if pivot is at center instead of feet
        model.rotation.y = Math.PI; // Face forward
        
        // Let's keep the gun on the real model too
        model.add(gun); 
        
        this.player.add(model);
      },
      undefined,
      (err) => {
        console.warn('Could not load maincaracter.glb, using placeholder. Make sure it is placed in the "public" directory.', err);
      }
    );
    
    // Setup City Scenery Background
    this.scenery = new THREE.Group();
    this.scene.add(this.scenery);
    for (let i = 0; i < 40; i++) {
        const height = 10 + Math.random() * 40;
        const geo = new THREE.BoxGeometry(5, height, 5);
        const mat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9, emissive: 0x050511 });
        const bldg = new THREE.Mesh(geo, mat);
        const z = (Math.random() - 0.5) * 300;
        const x = (Math.random() > 0.5 ? 1 : -1) * (30 + Math.random() * 40);
        bldg.position.set(x, height / 2 - 5, z);
        this.scenery.add(bldg);
    }

    this.clock = new THREE.Clock();
    
    this.setupInput();
    this.initializeWorld();
    
    window.addEventListener('resize', this.onWindowResize.bind(this));
  }

  setupInput() {
    window.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') this.switchLane(-1);
      if (e.code === 'ArrowRight' || e.code === 'KeyD') this.switchLane(1);
      if (e.code === 'ArrowUp' || e.code === 'KeyW') this.jump();
      if (e.code === 'Space') {
          if (!this.isShooting) {
              this.isShooting = true;
              this.attemptShoot();
          }
      }
    });
    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
      if (e.code === 'Space') this.isShooting = false;
    });
    
    // Mouse click to shoot
    this.renderer.domElement.addEventListener('mousedown', () => {
      if (useGameStore.getState().gameState === 'PLAYING') {
         this.isShooting = true;
         this.attemptShoot();
      }
    });
    this.renderer.domElement.addEventListener('mouseup', () => {
        this.isShooting = false;
    });

    // Touch support (simple swipe and tap)
    let touchStartX = 0;
    let touchStartY = 0;
    this.renderer.domElement.addEventListener('touchstart', (e) => {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
    });
    this.renderer.domElement.addEventListener('touchend', (e) => {
      const touchEndX = e.changedTouches[0].clientX;
      const touchEndY = e.changedTouches[0].clientY;
      const dx = touchEndX - touchStartX;
      const dy = touchEndY - touchStartY;
      
      if (Math.abs(dx) > 30 && Math.abs(dx) > Math.abs(dy)) {
        this.switchLane(dx > 0 ? 1 : -1);
      } else if (Math.abs(dy) > 30 && dy < 0) {
        this.jump();
      } else if (Math.abs(dx) < 10 && Math.abs(dy) < 10) {
        if (useGameStore.getState().gameState === 'PLAYING') {
          this.shoot();
        }
      }
    });
  }

  onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  initializeWorld() {
    this.currentZ = 0;
    this.player.position.set(0, 1, 0);
    this.lane = 0;
    this.targetX = 0;
    this.yVelocity = 0;
    this.isJumping = false;
    this.timeScale = 1.0;
    this.runTime = 0;
    this.shootTimer = 0;
    
    // Clear old objects
    this.trains.forEach(t => this.scene.remove(t));
    this.trains = [];
    this.enemies.forEach(e => this.scene.remove(e.mesh));
    this.enemies = [];
    this.projectiles.forEach(p => this.scene.remove(p.mesh));
    this.projectiles = [];
    this.pickups.forEach(p => this.scene.remove(p.mesh));
    this.pickups = [];
    
    // Generate initial trains
    for (let i = 0; i < MAX_TRAINS; i++) {
        this.spawnTrain(i * (TRAIN_LENGTH + TRAIN_GAP) * -1);
    }
  }

  spawnTrain(zPos: number) {
    const trainGroup = new THREE.Group();
    trainGroup.position.z = zPos;
    
    const trainGeo = new THREE.BoxGeometry(LANE_WIDTH * 3 + 2, 2, TRAIN_LENGTH);
    const trainMat = new THREE.MeshStandardMaterial({ color: COLORS.train });
    const trainMesh = new THREE.Mesh(trainGeo, trainMat);
    trainMesh.position.y = -1; // Top of train is y=0
    trainGroup.add(trainMesh);
    
    // Randomly spawn an enemy or pickup on this train if it's not the first few
    if (zPos < -50) {
        if (Math.random() > 0.3) {
            this.spawnEnemy(trainGroup, zPos);
        } else if (Math.random() > 0.5) {
            this.spawnPickup(trainGroup, zPos);
        }
    }
    
    this.scene.add(trainGroup);
    this.trains.push(trainGroup);
  }

  spawnEnemy(trainGroup: THREE.Group, trainZ: number) {
    const store = useGameStore.getState();
    const diff = store.difficultyLevel;
    const lanes: Lane[] = [-1, 0, 1];
    const lane = lanes[Math.floor(Math.random() * lanes.length)];
    
    const enemyGeo = new THREE.BoxGeometry(1.2, 2, 1.2);
    // Determine type
    const types: ('grunt' | 'dodger' | 'shielder' | 'gunner' | 'bomber')[] = ['grunt', 'grunt', 'dodger', 'shielder', 'gunner'];
    if (diff > 1.5) types.push('gunner', 'bomber', 'dodger'); // harder spawns later
    
    const type = types[Math.floor(Math.random() * types.length)];
    
    let color = COLORS.enemyGrunt;
    if (type === 'dodger') color = COLORS.enemyDodger;
    if (type === 'shielder') color = COLORS.enemyShielder;
    if (type === 'gunner') color = COLORS.enemyGunner;
    if (type === 'bomber') color = COLORS.enemyBomber;
    
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.5 });
    const mesh = new THREE.Mesh(enemyGeo, mat);
    
    const localZ = (Math.random() - 0.5) * (TRAIN_LENGTH - 10);
    mesh.position.set(lane * LANE_WIDTH, 1, localZ);
    trainGroup.add(mesh); // Attach to train so it moves with it relative to player
    
    this.enemies.push({
      mesh,
      type,
      hp: (type === 'shielder' ? 70 : 30) * diff,
      lane,
      zBase: trainZ + localZ,
      state: 'idle',
      timer: 0
    });
  }

  spawnPickup(trainGroup: THREE.Group, trainZ: number) {
      const lanes: Lane[] = [-1, 0, 1];
      const lane = lanes[Math.floor(Math.random() * lanes.length)];
      
      const pTypes: Pickup['type'][] = ['health', 'shield', 'rapid', 'coin', 'coin', 'coin'];
      const type = pTypes[Math.floor(Math.random() * pTypes.length)];
      
      let color = COLORS.coin;
      if (type === 'health') color = COLORS.powerupHealth;
      if (type === 'shield') color = COLORS.powerupShield;
      if (type === 'rapid') color = COLORS.powerupRapid;
      
      const geo = type === 'coin' ? new THREE.CylinderGeometry(0.5, 0.5, 0.2, 16) : new THREE.OctahedronGeometry(0.5);
      const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.5 });
      const mesh = new THREE.Mesh(geo, mat);
      
      if (type === 'coin') mesh.rotation.x = Math.PI / 2;
      
      const localZ = (Math.random() - 0.5) * (TRAIN_LENGTH - 10);
      mesh.position.set(lane * LANE_WIDTH, 1, localZ);
      trainGroup.add(mesh);
      
      this.pickups.push({
          mesh,
          type,
          lane,
          zBase: trainZ + localZ,
          spinY: Math.random() * Math.PI
      });
  }

  switchLane(dir: number) {
    if (this.lane === -1 && dir === -1) return;
    if (this.lane === 1 && dir === 1) return;
    this.lane = Math.max(-1, Math.min(1, this.lane + dir)) as Lane;
    this.targetX = this.lane * LANE_WIDTH;
    audioManager.playJump(); // Need a quick swish sound
  }

  jump() {
    if (!this.isJumping) {
      this.yVelocity = JUMP_VELOCITY;
      this.isJumping = true;
      audioManager.playJump();
    }
  }

  attemptShoot() {
      if (this.shootTimer <= 0) {
          this.shoot();
      }
  }

  shoot() {
    const store = useGameStore.getState();
    const weaponId = store.persistent.equippedWeapon;
    const weaponConfig = WEAPONS[weaponId] || WEAPONS.PISTOL;
    
    let activeFr = weaponConfig.fireRate;
    if (store.activePowerup.type === 'RAPID_FIRE') activeFr *= 0.3;
    
    this.shootTimer = activeFr;
    
    // Raycast forward from player
    audioManager.playShoot();
    
    for (let i = 0; i < weaponConfig.projectiles; i++) {
        const projGeo = new THREE.BoxGeometry(0.2, 0.2, 2);
        const projMat = new THREE.MeshBasicMaterial({ color: COLORS.bulletTrail });
        const proj = new THREE.Mesh(projGeo, projMat);
        proj.position.copy(this.player.position);
        proj.position.y += 0.5; // Shoot from chest
        
        let vel = new THREE.Vector3(0, 0, -50);
        if (weaponConfig.projectiles > 1) {
            // Spread
            const angle = ((i / (weaponConfig.projectiles - 1)) - 0.5) * weaponConfig.spread;
            vel.applyAxisAngle(new THREE.Vector3(0, 1, 0), angle);
        } else if (weaponConfig.spread > 0) { // Slight inaccuracy for rifle maybe
            const angle = (Math.random() - 0.5) * weaponConfig.spread;
            vel.applyAxisAngle(new THREE.Vector3(0, 1, 0), angle);
        }
        
        // Tag with damage amount
        proj.userData = { damage: weaponConfig.damage };
        
        this.scene.add(proj);
        this.projectiles.push({
            mesh: proj,
            velocity: vel,
            isPlayer: true,
            life: 1.5
        });
    }
    
    this.addScreenShake(0.1);
  }

  triggerExplosion(pos: THREE.Vector3, color: number) {
    audioManager.playExplosion();
    // Generate particles
    for (let i = 0; i < 20; i++) {
      const geo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
      const mat = new THREE.MeshBasicMaterial({ color });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(pos);
      
      this.scene.add(mesh);
      this.particles.push({
        mesh,
        velocity: new THREE.Vector3((Math.random()-0.5)*10, Math.random()*10, (Math.random()-0.5)*10),
        life: 1.0,
        maxLife: 1.0
      });
    }
  }

  addScreenShake(intensity: number) {
    this.shakeTimer = 0.2;
    this.shakeIntensity = intensity;
  }

  takeDamage(amount: number) {
    const store = useGameStore.getState();
    if (store.activePowerup.type === 'SHIELD') {
        store.setGameplayState({ activePowerup: { type: null, timeLeft: 0 }});
        this.addScreenShake(0.3);
        audioManager.playHit();
        return; // Absorbed!
    }
    
    const newHp = Math.max(0, store.hp - amount);
    audioManager.playHit();
    this.addScreenShake(0.5);
    store.setGameplayState({ hp: newHp, combo: 1 }); // reset combo
    
    if (newHp <= 0) {
      this.die();
    }
  }

  die() {
    useGameStore.getState().setGameState('GAME_OVER');
    this.isRunning = false;
    // Update high score
    const store = useGameStore.getState();
    store.updateHighScore(store.score);
  }

  start() {
    if (!this.isRunning) {
        this.isRunning = true;
        this.clock.start();
        this.initializeWorld();
        useGameStore.getState().setGameplayState({ hp: 100, score: 0, combo: 1, distance: 0 });
        this.animate();
    }
  }

  pause() {
      this.isRunning = false;
  }

  resume() {
      if (!this.isRunning) {
          this.isRunning = true;
          this.clock.start();
          this.animate();
      }
  }

  animate = () => {
    if (!this.isRunning) return;
    requestAnimationFrame(this.animate);
    
    const dtRaw = this.clock.getDelta();
    // Clamp dt to avoid huge jumps on lag
    const dt = Math.min(dtRaw, 0.1) * this.timeScale;
    
    this.update(dt);
    
    // Camera follow
    const camTarget = new THREE.Vector3(
      this.player.position.x * 0.5,
      this.player.position.y + 4,
      this.player.position.z + 10
    );
    
    this.camera.position.lerp(camTarget, 10 * dtRaw);
    
    // Screen shake
    if (this.shakeTimer > 0) {
      this.shakeTimer -= dtRaw;
      this.camera.position.x += (Math.random() - 0.5) * this.shakeIntensity;
      this.camera.position.y += (Math.random() - 0.5) * this.shakeIntensity;
    }
    
    this.camera.lookAt(this.player.position.x * 0.5, this.player.position.y, this.player.position.z - 20);
    
    this.renderer.render(this.scene, this.camera);
  }

  update(dt: number) {
    const store = useGameStore.getState();
    
    this.runTime += dt;
    const diffLevel = 1 + Math.floor(this.runTime / 15) * 0.2; // Increase 20% every 15s
    
    if (this.shootTimer > 0) this.shootTimer -= dt;
    if (this.isShooting && this.shootTimer <= 0) {
        this.attemptShoot();
    }
    
    // Powerups tick
    if (store.activePowerup.timeLeft > 0) {
        const nextTime = store.activePowerup.timeLeft - dt;
        if (nextTime <= 0) {
            store.setGameplayState({ activePowerup: { type: null, timeLeft: 0 }});
        } else {
            store.setGameplayState({ activePowerup: { type: store.activePowerup.type, timeLeft: nextTime }});
        }
    }
    
    // Bullet time input
    if (this.keys['ShiftLeft'] || this.keys['ShiftRight']) {
      if (store.bulletTimeMeter > 0) {
        this.timeScale = THREE.MathUtils.lerp(this.timeScale, 0.3, 10 * dt);
        store.setGameplayState({ bulletTimeMeter: store.bulletTimeMeter - 20 * dt, isBulletTime: true });
      } else {
        this.timeScale = THREE.MathUtils.lerp(this.timeScale, 1.0, 10 * dt);
        store.setGameplayState({ isBulletTime: false });
      }
    } else {
      this.timeScale = THREE.MathUtils.lerp(this.timeScale, 1.0, 10 * dt);
      store.setGameplayState({ 
        bulletTimeMeter: Math.min(100, store.bulletTimeMeter + 5 * dt),
        isBulletTime: false,
        difficultyLevel: diffLevel
      });
    }
  
    // 1. Move Player X (Lane Swapping)
    this.player.position.x = THREE.MathUtils.lerp(this.player.position.x, this.targetX, 15 * dt);
    
    // 2. Move Player Y (Jumping & Gravity)
    if (this.isJumping) {
      this.player.position.y += this.yVelocity * dt;
      this.yVelocity -= GRAVITY * dt;
      
      if (this.player.position.y <= 1) {
        this.player.position.y = 1;
        this.isJumping = false;
        this.yVelocity = 0;
      }
    }
    
    // 3. Move Trains
    const moveDist = FORWARD_SPEED * diffLevel * dt;
    store.setGameplayState({ distance: store.distance + moveDist, score: Math.floor(store.distance + moveDist) });
    
    let needsNewTrain = false;
    for (let i = this.trains.length - 1; i >= 0; i--) {
      const t = this.trains[i];
      t.position.z += moveDist;
      
      if (t.position.z > 20) {
        this.scene.remove(t);
        this.trains.splice(i, 1);
        needsNewTrain = true;
      }
    }
    
    if (needsNewTrain) {
      // Find furthest train
      let minZ = 0;
      this.trains.forEach(t => {
          if (t.position.z < minZ) minZ = t.position.z;
      });
      this.spawnTrain(minZ - (TRAIN_LENGTH + TRAIN_GAP));
    }
    
    // 3.5 Move Scenery for Parallax Effect
    for (const bldg of this.scenery.children) {
        bldg.position.z += moveDist * 0.8; // Move slightly slower for parallax
        if (bldg.position.z > 50) {
            bldg.position.z -= 300;
        }
    }
    
    // 4. Update Projectiles
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.mesh.position.addScaledVector(p.velocity, dt);
      p.life -= dt;
      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        this.projectiles.splice(i, 1);
        continue;
      }
      
      // Collision with enemies (if player projectile)
      if (p.isPlayer) {
          // get AABB of projectile
          const pBox = new THREE.Box3().setFromObject(p.mesh);
          let hit = false;
          for (let j = 0; j < this.enemies.length; j++) {
              const e = this.enemies[j];
              // Compute world bounding box for enemy (who is inside a train group)
              const eBox = new THREE.Box3().setFromObject(e.mesh);
              if (pBox.intersectsBox(eBox)) {
                  e.hp -= p.mesh.userData.damage || 10;
                  hit = true;
                  this.triggerExplosion(p.mesh.position, COLORS.projectile);
                  if (e.hp <= 0) {
                      // Kill enemy
                      this.triggerExplosion(e.mesh.getWorldPosition(new THREE.Vector3()), COLORS.enemyGrunt);
                      e.mesh.parent?.remove(e.mesh);
                      this.enemies.splice(j, 1);
                      store.setGameplayState({ combo: store.combo + 1, score: store.score + 100 * store.combo });
                  }
                  break;
              }
          }
          if (hit) {
              this.scene.remove(p.mesh);
              this.projectiles.splice(i, 1);
          }
      } else {
          // Collision with player
           const pBox = new THREE.Box3().setFromObject(p.mesh);
           const playerBox = new THREE.Box3().setFromObject(this.player);
           if (pBox.intersectsBox(playerBox)) {
               this.takeDamage(10);
               this.scene.remove(p.mesh);
               this.projectiles.splice(i, 1);
           }
      }
    }
    
    // 5. Update Enemies
    for (let i = this.enemies.length - 1; i >= 0; i--) {
        const e = this.enemies[i];
        
        // Remove if passed behind player
        const worldPos = new THREE.Vector3();
        e.mesh.getWorldPosition(worldPos);
        if (worldPos.z > 10) {
            e.mesh.parent?.remove(e.mesh);
            this.enemies.splice(i, 1);
            continue;
        }
        
        // AI Behaviors
        e.timer += dt;
        if (e.type === 'dodger') {
            e.mesh.position.x = e.lane * LANE_WIDTH + Math.sin(e.timer * 4 * diffLevel) * 1.5;
            // Dodgers sometimes shoot at high levels
            if (diffLevel >= 1.4 && e.timer > 3 && worldPos.distanceTo(this.player.position) < 40) {
                e.timer = 0;
                const projGeo = new THREE.BoxGeometry(0.2, 0.2, 1);
                const projMat = new THREE.MeshBasicMaterial({ color: 0xff00ff });
                const proj = new THREE.Mesh(projGeo, projMat);
                proj.position.copy(worldPos);
                const dir = this.player.position.clone().sub(worldPos).normalize();
                this.scene.add(proj);
                this.projectiles.push({ mesh: proj, velocity: dir.multiplyScalar(25 * diffLevel), isPlayer: false, life: 3.0 });
            }
        } else if (e.type === 'gunner') {
            if (e.timer > Math.max(0.5, 2 - diffLevel*0.5) && worldPos.distanceTo(this.player.position) < 50) {
                e.timer = 0;
                // Shoot projectile
                const projGeo = new THREE.BoxGeometry(0.3, 0.3, 1);
                const projMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
                const proj = new THREE.Mesh(projGeo, projMat);
                proj.position.copy(worldPos);
                
                // Direction towards player roughly
                const dir = this.player.position.clone().sub(worldPos).normalize();
                
                this.scene.add(proj);
                this.projectiles.push({
                    mesh: proj,
                    velocity: dir.multiplyScalar(20 * diffLevel), // Faster bullets at higher diff
                    isPlayer: false,
                    life: 3.0
                });
            }
        } else if (e.type === 'bomber') {
            const scale = 1 + Math.sin(e.timer * 10) * 0.2;
            e.mesh.scale.set(scale, scale, scale);
            if (worldPos.distanceTo(this.player.position) < 5) {
                // Explode on player
                this.takeDamage(30);
                this.triggerExplosion(worldPos, COLORS.enemyBomber);
                e.mesh.parent?.remove(e.mesh);
                this.enemies.splice(i, 1);
                continue;
            }
        }
        
        // Player body collision
        const eBox = new THREE.Box3().setFromObject(e.mesh);
        // Shrink player box slightly to be forgiving
        const playerBox = new THREE.Box3().setFromObject(this.player);
        playerBox.expandByScalar(-0.2);
        
        if (playerBox.intersectsBox(eBox)) {
            // Hit by enemy
            this.takeDamage(20);
            this.triggerExplosion(worldPos, 0xff0000);
            e.mesh.parent?.remove(e.mesh);
            this.enemies.splice(i, 1);
        }
    }
    
    // 5.5 Update Pickups
    const playerBoxExpanded = new THREE.Box3().setFromObject(this.player).expandByScalar(0.5);
    for (let i = this.pickups.length - 1; i >= 0; i--) {
        const p = this.pickups[i];
        p.mesh.rotation.y += dt * 2;
        p.spinY += dt;
        p.mesh.position.y = 1 + Math.sin(p.spinY * 4) * 0.3;
        
        const worldPos = new THREE.Vector3();
        p.mesh.getWorldPosition(worldPos);
        
        if (worldPos.z > 10) {
            p.mesh.parent?.remove(p.mesh);
            this.pickups.splice(i, 1);
            continue;
        }
        
        const pBox = new THREE.Box3().setFromObject(p.mesh);
        if (playerBoxExpanded.intersectsBox(pBox)) {
            // Picked up!
            audioManager.playCoin();
            if (p.type === 'health') {
                store.setGameplayState({ hp: Math.min(store.maxHp, store.hp + 30) });
            } else if (p.type === 'shield') {
                store.setGameplayState({ activePowerup: { type: 'SHIELD', timeLeft: 15 }});
            } else if (p.type === 'rapid') {
                store.setGameplayState({ activePowerup: { type: 'RAPID_FIRE', timeLeft: 10 }});
            } else if (p.type === 'coin') {
                store.addCoins(10);
            }
            p.mesh.parent?.remove(p.mesh);
            this.pickups.splice(i, 1);
        }
    }
    
    // 6. Fall off train check
    let overTrain = false;
    for (let t of this.trains) {
        // Rough check Z bounds
        if (this.player.position.z >= t.position.z - TRAIN_LENGTH/2 && 
            this.player.position.z <= t.position.z + TRAIN_LENGTH/2) {
            overTrain = true;
            break;
        }
    }
    if (!overTrain && !this.isJumping && this.player.position.y <= 1.1) { // 1.1 leeway
        // Start falling
        this.yVelocity -= GRAVITY * dt;
        this.player.position.y += this.yVelocity * dt;
        if (this.player.position.y < -10) {
            this.die();
        }
    }

    // 7. Update Particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i];
        p.mesh.position.addScaledVector(p.velocity, dt);
        p.mesh.rotation.x += dt * 5;
        p.mesh.rotation.y += dt * 5;
        p.life -= dt;
        p.mesh.scale.setScalar(Math.max(0, p.life / p.maxLife));
        if (p.life <= 0) {
            this.scene.remove(p.mesh);
            this.particles.splice(i, 1);
        }
    }
  }

  destroy() {
      this.isRunning = false;
      this.renderer.dispose();
      this.container.innerHTML = '';
  }
}
