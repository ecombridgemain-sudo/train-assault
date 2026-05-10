import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { RGBShiftShader } from 'three/examples/jsm/shaders/RGBShiftShader.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { useGameStore, WeaponType } from '../store/useGameStore';
import { audioManager } from './AudioManager';
import { LANE_WIDTH, FORWARD_SPEED, GRAVITY, JUMP_VELOCITY, TRAIN_LENGTH, COLORS, MAX_TRAINS, BASE_TRAIN_GAP, WEAPONS } from './constants';

type Lane = -1 | 0 | 1;

interface Enemy {
  mesh: THREE.Mesh | THREE.Group;
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
  type: 'health' | 'shield' | 'rapid' | 'coin' | 'double';
  zBase: number;
  lane: Lane;
  spinY: number;
}

export class GameEngine {
  container: HTMLElement;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  
  // Post-Processing
  composer!: EffectComposer;
  bloomPass!: UnrealBloomPass;
  rgbShiftPass!: ShaderPass;
  
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
  lastBossScore: number = 0;
  
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
  sceneryInstances: any[] = [];
  pillarInstanced!: THREE.InstancedMesh;
  crysInstanced!: THREE.InstancedMesh;
  frameInstanced!: THREE.InstancedMesh;
  innerFrameInstanced!: THREE.InstancedMesh;

  constructor(container: HTMLElement) {
    this.container = container;
    
    // Setup Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0f1a);
    this.scene.fog = new THREE.Fog(0x0a0f1a, 100, 400);
    
    // Setup Camera
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.camera.position.set(0, 5, 10);
    
    // Setup Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.container.appendChild(this.renderer.domElement);
    
    // Setup Post-Processing
    this.composer = new EffectComposer(this.renderer);
    
    const renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(renderPass);
    
    // Bloom
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.8, 0.4, 0.85);
    this.composer.addPass(this.bloomPass);
    
    // Chromatic Aberration
    this.rgbShiftPass = new ShaderPass(RGBShiftShader);
    this.rgbShiftPass.uniforms['amount'].value = 0.0015;
    this.composer.addPass(this.rgbShiftPass);
    
    // Output pass
    const outputPass = new OutputPass();
    this.composer.addPass(outputPass);
    
    // Lighting
    const dirLight = new THREE.DirectionalLight(0xccddff, 1.5);
    dirLight.position.set(10, 20, 10);
    this.scene.add(dirLight);
    
    // Add some colored rim lighting for synthwave look
    const rimLight1 = new THREE.DirectionalLight(0xff00ff, 1.5);
    rimLight1.position.set(-20, 10, -10);
    this.scene.add(rimLight1);

    const rimLight2 = new THREE.DirectionalLight(0x00ffff, 1.5);
    rimLight2.position.set(20, 10, -10);
    this.scene.add(rimLight2);
    
    const ambLight = new THREE.AmbientLight(0x1a1a2e, 1.5);
    this.scene.add(ambLight);
    
    // Add sun light for better model shading
    const sunLight = new THREE.DirectionalLight(0xffffff, 2);
    sunLight.position.set(10, 20, 10);
    sunLight.lookAt(0, 0, 0);
    this.scene.add(sunLight);
    
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
    // Load local file from the /public folder
    loader.load(
      '/illiakan_v1.glb',
      (gltf) => {
        console.log('Player model loaded successfully');
        // Remove placeholder and add the loaded model
        this.player.remove(placeholder);
        
        const model = gltf.scene;
        
        // Auto-scale and center the model to fit a 1x2x1 bounding box
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        
        if (size.y > 0) {
            const scale = 2.0 / size.y; // Target height = 2 units
            model.scale.set(scale, scale, scale);
            
            // Recalculate box after scaling
            const scaledBox = new THREE.Box3().setFromObject(model);
            const center = scaledBox.getCenter(new THREE.Vector3());
            
            // Re-center around X and Z, and place the bottom at Y = -1 (local to the player group)
            model.position.x -= center.x;
            model.position.y += (-1 - scaledBox.min.y);
            model.position.z -= center.z;
        } else {
            model.scale.set(1, 1, 1); 
            model.position.set(0, -1, 0);
        }
        
        model.rotation.y = Math.PI; // Face forward
        
        // Make sure its materials render correctly with lighting
        model.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) {
                const mesh = child as THREE.Mesh;
                mesh.castShadow = true;
                mesh.receiveShadow = true;
                // Avoid complete blackness if the model has faulty materials
                if (mesh.material) {
                    // if it's an array of materials, we leave it, otherwise ensure rough lighting
                    if (!Array.isArray(mesh.material)) {
                        mesh.material.needsUpdate = true;
                    }
                }
            }
        });
        
        // Let's keep the gun on the real model too
        model.add(gun); 
        
        this.player.add(model);
      },
      (progress) => {
         console.log(`Loading model: ${Math.round((progress.loaded / progress.total) * 100)}%`);
      },
      (err) => {
        console.error('Could not load maincaracter.glb, using placeholder.', err);
        // Put placeholder back if it fails
        this.player.add(placeholder);
      }
    );
    
    // Starfield Background
    const starsGeo = new THREE.BufferGeometry();
    const starsCount = 2000;
    const posArray = new Float32Array(starsCount * 3);
    for(let i=0; i<starsCount*3; i++) {
        posArray[i] = (Math.random() - 0.5) * 800; // Spread wide
    }
    starsGeo.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
    const starsMat = new THREE.PointsMaterial({size: 0.5, color: 0xddddff, transparent: true, opacity: 0.8, fog: false});
    const starMesh = new THREE.Points(starsGeo, starsMat);
    this.scene.add(starMesh);

    // Distant sun
    const sunGeo = new THREE.CircleGeometry(20, 32);
    const sunMat = new THREE.MeshBasicMaterial({ color: 0xffeebb, fog: false, transparent: true, opacity: 0.9 });
    const sun = new THREE.Mesh(sunGeo, sunMat);
    sun.position.set(10, 60, -400);
    this.scene.add(sun);

    // Setup Space Scenery
    this.scenery = new THREE.Group();
    this.scene.add(this.scenery);
    
    // Instanced Black Pillars
    const numPillars = 40;
    const pillarGeo = new THREE.BoxGeometry(2, 25, 2);
    const pillarMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9, metalness: 0.2 });
    const pillarInstanced = new THREE.InstancedMesh(pillarGeo, pillarMat, numPillars);
    
    // Instanced Crystals & Wireframes
    const numWireframes = 30;
    const crysGeo = new THREE.IcosahedronGeometry(8, 1);
    const crysMat = new THREE.MeshStandardMaterial({ 
        color: 0x8899aa, 
        emissive: 0x223344,
        metalness: 0.8, 
        roughness: 0.2, 
        flatShading: true
    });
    const crysInstanced = new THREE.InstancedMesh(crysGeo, crysMat, numWireframes);
    
    const frameGeo = new THREE.BoxGeometry(25, 25, 25);
    const innerFrameGeo = new THREE.BoxGeometry(18, 18, 18);
    const wireMat = new THREE.MeshBasicMaterial({ color: 0x445566, wireframe: true, transparent: true, opacity: 0.5 });
    
    const frameInstanced = new THREE.InstancedMesh(frameGeo, wireMat, numWireframes);
    const innerFrameInstanced = new THREE.InstancedMesh(innerFrameGeo, wireMat, numWireframes);
    
    // Store data for moving instances
    this.sceneryInstances = [];
    
    for (let i = 0; i < numPillars; i++) {
        const sign = i % 2 === 0 ? 1 : -1;
        const z = -Math.random() * 450;
        const x = sign * (12 + Math.random() * 8);
        const y = (Math.random() - 0.5) * 15 + 10;
        
        this.sceneryInstances.push({
            type: 'pillar', index: i, pos: new THREE.Vector3(x, y, z), rot: new THREE.Euler(), rotSpeed: new THREE.Euler()
        });
    }
    
    for (let i = 0; i < numWireframes; i++) {
        const sign = Math.random() > 0.5 ? 1 : -1;
        const z = -Math.random() * 450; 
        const x = sign * (40 + Math.random() * 30);
        const y = (Math.random() - 0.5) * 40;
        
        const rot = new THREE.Euler(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
        const rotSpeed = new THREE.Euler((Math.random() - 0.5) * 0.2, (Math.random() - 0.5) * 0.2, (Math.random() - 0.5) * 0.2);
        
        this.sceneryInstances.push({
            type: 'wireframe', index: i, pos: new THREE.Vector3(x, y, z), rot, rotSpeed
        });
    }
    
    this.pillarInstanced = pillarInstanced;
    this.crysInstanced = crysInstanced;
    this.frameInstanced = frameInstanced;
    this.innerFrameInstanced = innerFrameInstanced;
    
    // Set initial matrices
    const dummy = new THREE.Object3D();
    for (const inst of this.sceneryInstances) {
        dummy.position.copy(inst.pos);
        if (inst.type === 'pillar') {
            dummy.updateMatrix();
            this.pillarInstanced.setMatrixAt(inst.index, dummy.matrix);
        } else if (inst.type === 'wireframe') {
            dummy.rotation.copy(inst.rot);
            dummy.updateMatrix();
            this.crysInstanced.setMatrixAt(inst.index, dummy.matrix);
            this.frameInstanced.setMatrixAt(inst.index, dummy.matrix);
            
            dummy.rotation.set(inst.rot.x + Math.PI/4, inst.rot.y + Math.PI/4, inst.rot.z);
            dummy.updateMatrix();
            this.innerFrameInstanced.setMatrixAt(inst.index, dummy.matrix);
        }
    }
    
    this.scenery.add(pillarInstanced);
    this.scenery.add(crysInstanced);
    this.scenery.add(frameInstanced);
    this.scenery.add(innerFrameInstanced);

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
      e.preventDefault();
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
    }, { passive: false });
    
    this.renderer.domElement.addEventListener('touchmove', (e) => {
        e.preventDefault();
    }, { passive: false });
    
    this.renderer.domElement.addEventListener('touchend', (e) => {
      e.preventDefault();
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
    if (this.composer) {
        this.composer.setSize(window.innerWidth, window.innerHeight);
    }
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
    this.lastBossScore = 0;
    
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
        this.spawnTrain(i * (TRAIN_LENGTH + BASE_TRAIN_GAP) * -1);
    }
  }

  spawnTrain(zPos: number) {
    const trainGroup = new THREE.Group();
    trainGroup.position.z = zPos;
    
    // The road itself
    const trainWidth = LANE_WIDTH * 3 + 2;
    const trainGeo = new THREE.BoxGeometry(trainWidth, 2, TRAIN_LENGTH);
    const trainMat = new THREE.MeshStandardMaterial({ color: COLORS.train });
    const trainMesh = new THREE.Mesh(trainGeo, trainMat);
    trainMesh.position.y = -1; // Top of train is y=0
    trainGroup.add(trainMesh);
    
    // Add side fences
    const fenceMat = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.5, roughness: 0.5 });
    const fenceHeight = 1.0;
    const postGeo = new THREE.BoxGeometry(0.2, fenceHeight, 0.2);
    const railGeo = new THREE.BoxGeometry(0.1, 0.1, TRAIN_LENGTH);
    
    const buildFence = () => {
        const fence = new THREE.Group();
        const topRail = new THREE.Mesh(railGeo, fenceMat);
        topRail.position.y = fenceHeight * 0.9;
        fence.add(topRail);
        const midRail = new THREE.Mesh(railGeo, fenceMat);
        midRail.position.y = fenceHeight * 0.4;
        fence.add(midRail);
        
        for (let i = 0; i < TRAIN_LENGTH; i += 4) {
            const post = new THREE.Mesh(postGeo, fenceMat);
            // Center the posts along the Z axis
            post.position.set(0, fenceHeight / 2, -TRAIN_LENGTH / 2 + i + 2);
            fence.add(post);
        }
        return fence;
    };
    
    const leftFence = buildFence();
    leftFence.position.x = -trainWidth / 2 + 0.2;
    trainGroup.add(leftFence);
    
    const rightFence = buildFence();
    rightFence.position.x = trainWidth / 2 - 0.2;
    trainGroup.add(rightFence);

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
      
      const pTypes: Pickup['type'][] = ['health', 'shield', 'rapid', 'double', 'coin', 'coin', 'coin'];
      const type = pTypes[Math.floor(Math.random() * pTypes.length)];
      
      let color = COLORS.coin;
      if (type === 'health') color = COLORS.powerupHealth;
      if (type === 'shield') color = COLORS.powerupShield;
      if (type === 'rapid') color = COLORS.powerupRapid;
      if (type === 'double') color = COLORS.powerupDouble;
      
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

  spawnBoss() {
      const bossGroup = new THREE.Group();
      
      // Main central block
      const geoCenter = new THREE.BoxGeometry(4, 4, 3);
      const mat = new THREE.MeshStandardMaterial({ color: 0xaa0000, emissive: 0x440000, roughness: 0.2 });
      const mainObj = new THREE.Mesh(geoCenter, mat);
      bossGroup.add(mainObj);
      
      // Rotating ring around it
      const ringGeo = new THREE.TorusGeometry(3.5, 0.4, 8, 24);
      const ringMat = new THREE.MeshStandardMaterial({ color: 0xff4400, emissive: 0xcc2200, roughness: 0.1 });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.name = "bossRing"; // to rotate it in update
      bossGroup.add(ring);
      
      // "Wings" or side blocks
      const wingGeo = new THREE.BoxGeometry(8, 1, 2);
      const wingMat = new THREE.MeshStandardMaterial({ color: 0x333333, emissive: 0x111111 });
      const wing = new THREE.Mesh(wingGeo, wingMat);
      bossGroup.add(wing);
      
      const diff = useGameStore.getState().difficultyLevel;
      
      // Starting position way out and high up
      bossGroup.position.set(0, 30, -100);
      
      this.scene.add(bossGroup);
      
      this.enemies.push({
          mesh: bossGroup,
          type: 'boss',
          hp: 800 * diff,
          lane: 0,
          zBase: -80, // Target Z for 'entering'
          state: 'intro',
          timer: 0
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
    
    const isDouble = store.activePowerup.type === 'DOUBLE_WEAPONS';
    const shotsToFire = isDouble ? 2 : 1;
    
    for (let s = 0; s < shotsToFire; s++) {
        const offset = isDouble ? (s === 0 ? -0.5 : 0.5) : 0;
        for (let i = 0; i < weaponConfig.projectiles; i++) {
            const projGeo = new THREE.BoxGeometry(0.2, 0.2, 2);
            const projMat = new THREE.MeshBasicMaterial({ color: COLORS.bulletTrail });
            const proj = new THREE.Mesh(projGeo, projMat);
            proj.position.copy(this.player.position);
            proj.position.y += 0.5; // Shoot from chest
            proj.position.x += offset; // Double weapon offset
            
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
    
    // Dynamic post-processing effects
    const store = useGameStore.getState();
    const hpRatio = store.hp / store.maxHp;
    
    let targetBloom = 0.8;
    let targetRgbShift = 0.0015;
    
    if (store.isBulletTime) {
        targetBloom += 1.5;
        targetRgbShift += 0.008;
    }
    
    if (hpRatio < 0.3) {
        targetBloom += 0.5;
        targetRgbShift += 0.005 + Math.sin(this.runTime * 10) * 0.002;
    }
    
    this.bloomPass.strength += (targetBloom - this.bloomPass.strength) * dtRaw * 5;
    this.rgbShiftPass.uniforms['amount'].value += (targetRgbShift - this.rgbShiftPass.uniforms['amount'].value) * dtRaw * 5;
    
    this.composer.render();
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
        
        // Expiry tick warning
        if (nextTime <= 3.0 && nextTime > 0) {
            if (Math.floor(store.activePowerup.timeLeft) !== Math.floor(nextTime)) {
                audioManager.playPowerupWarning();
            }
        }
        
        if (nextTime <= 0) {
            store.setGameplayState({ activePowerup: { type: null, timeLeft: 0 }});
        } else {
            store.setGameplayState({ activePowerup: { type: store.activePowerup.type, timeLeft: nextTime }});
        }
    }
    
    // Boss trigger
    if (store.score > this.lastBossScore + 1500) {
        this.lastBossScore = store.score;
        const hasBoss = this.enemies.some(e => e.type === 'boss');
        if (!hasBoss) {
            this.spawnBoss();
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
    let overTrain = false;
    for (let t of this.trains) {
        if (this.player.position.z >= t.position.z - TRAIN_LENGTH/2 && 
            this.player.position.z <= t.position.z + TRAIN_LENGTH/2) {
            overTrain = true;
            break;
        }
    }

    if (!overTrain && this.player.position.y <= 1.0 && this.yVelocity <= 0) {
        this.isJumping = true;
    }

    if (this.isJumping) {
      this.player.position.y += this.yVelocity * dt;
      this.yVelocity -= GRAVITY * dt;
      
      if (this.player.position.y <= 1 && overTrain && this.yVelocity < 0) {
        if (this.player.position.y > 0) {
          this.player.position.y = 1;
          this.isJumping = false;
          this.yVelocity = 0;
        } else {
          // Snagged the front face of the train!
          this.die();
        }
      }
    }
    
    if (this.player.position.y < -10) {
        this.die();
    }
    
    // 3. Move Trains
    const moveDist = FORWARD_SPEED * diffLevel * dt;
    store.setGameplayState({ distance: store.distance + moveDist, score: Math.floor(store.distance + moveDist) });
    
    let needsNewTrain = false;
    for (let i = this.trains.length - 1; i >= 0; i--) {
      const t = this.trains[i];
      t.position.z += moveDist;
      
      if (t.position.z > 80) {
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
      
      const currentGap = BASE_TRAIN_GAP + (diffLevel - 1) * 8;
      
      this.spawnTrain(minZ - (TRAIN_LENGTH + currentGap));
    }
    
    // 3.5 Move Scenery for Parallax Effect
    let dummy = new THREE.Object3D();
    const instUpdate = { pillar: false, crys: false, frame: false, inner: false };
    
    for (const inst of this.sceneryInstances) {
        inst.pos.z += moveDist * 0.8;
        if (inst.pos.z > 50) {
            inst.pos.z -= 450;
        }
        
        inst.rot.x += inst.rotSpeed.x * dt;
        inst.rot.y += inst.rotSpeed.y * dt;
        inst.rot.z += inst.rotSpeed.z * dt;
        
        dummy.position.copy(inst.pos);
        
        if (inst.type === 'pillar') {
            dummy.updateMatrix();
            this.pillarInstanced.setMatrixAt(inst.index, dummy.matrix);
            instUpdate.pillar = true;
        } else if (inst.type === 'wireframe') {
            dummy.rotation.copy(inst.rot);
            dummy.updateMatrix();
            this.crysInstanced.setMatrixAt(inst.index, dummy.matrix);
            this.frameInstanced.setMatrixAt(inst.index, dummy.matrix);
            instUpdate.crys = true;
            instUpdate.frame = true;
            
            dummy.rotation.set(inst.rot.x + Math.PI/4, inst.rot.y + Math.PI/4, inst.rot.z);
            dummy.updateMatrix();
            this.innerFrameInstanced.setMatrixAt(inst.index, dummy.matrix);
            instUpdate.inner = true;
        }
    }
    
    if (instUpdate.pillar) this.pillarInstanced.instanceMatrix.needsUpdate = true;
    if (instUpdate.crys) this.crysInstanced.instanceMatrix.needsUpdate = true;
    if (instUpdate.frame) this.frameInstanced.instanceMatrix.needsUpdate = true;
    if (instUpdate.inner) this.innerFrameInstanced.instanceMatrix.needsUpdate = true;
    
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
                      if (e.type === 'boss') {
                          this.triggerExplosion(e.mesh.getWorldPosition(new THREE.Vector3()), 0xffffff); // Extra big explosion effect natively handled by having more particles in the future, for now double explosion
                          this.triggerExplosion(e.mesh.getWorldPosition(new THREE.Vector3()), 0xff0000);
                          store.setGameplayState({ combo: store.combo + 5, score: store.score + 5000 });
                      } else {
                          store.setGameplayState({ combo: store.combo + 1, score: store.score + 100 * store.combo });
                      }
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
        } else if (e.type === 'boss') {
            const ring = e.mesh.getObjectByName('bossRing');
            if (ring) {
                ring.rotation.z += dt * 2;
                ring.rotation.x = Math.sin(e.timer) * 0.2;
            }
            
            if (e.state === 'intro') {
                // Dramatic descent and spin
                e.mesh.position.y = THREE.MathUtils.lerp(e.mesh.position.y, 6, dt * 2);
                e.mesh.position.z = THREE.MathUtils.lerp(e.mesh.position.z, -80, dt * 2);
                
                // Spin around Y axis rapidly, then slow down
                e.mesh.rotation.y += dt * (15 * Math.max(0, 2.5 - e.timer));
                
                if (e.timer > 3.0) {
                    e.state = 'entering';
                    e.mesh.rotation.y = 0;
                    e.timer = 0; // Reset timer for entering state
                }
            } else {
                // Normal movement for entering/attacking state
                e.mesh.position.x = Math.sin(e.timer * 0.5) * LANE_WIDTH * 1.5;
                e.mesh.position.y = 6 + Math.sin(e.timer * 2) * 2;
                
                if (e.state === 'entering') {
                    e.zBase = Math.min(-40, e.zBase + dt * 10);
                    e.mesh.position.z = e.zBase;
                    if (e.zBase >= -40) e.state = 'attacking';
                } else if (e.state === 'attacking') {
                    e.mesh.position.z = e.zBase + Math.sin(e.timer * 0.3) * 5;
                    
                    // Boss attack pattern
                    if (e.timer > 1.5 - (diffLevel * 0.1)) {
                        e.timer = 0;
                        
                        // High-damage sweeping attack
                        for(let k = -1; k <= 1; k++) {
                            setTimeout(() => {
                                if (store.gameState !== 'PLAYING') return;
                                const projGeo = new THREE.BoxGeometry(1, 0.5, 2);
                                const projMat = new THREE.MeshBasicMaterial({ color: 0xffaa00 });
                                const proj = new THREE.Mesh(projGeo, projMat);
                                
                                const spawnPos = new THREE.Vector3();
                                e.mesh.getWorldPosition(spawnPos);
                                spawnPos.y -= 2; // Under the boss
                                proj.position.copy(spawnPos);
                                
                                const pPos = this.player.position.clone();
                                pPos.x += k * LANE_WIDTH * 1.2;
                                const dir = pPos.sub(spawnPos).normalize();
                                
                                this.scene.add(proj);
                                // Projectiles marked as not from player, with high size/damage
                                this.projectiles.push({ mesh: proj, velocity: dir.multiplyScalar(20 + 5*diffLevel), isPlayer: false, life: 5.0 });
                            }, (k + 1) * 150);
                        }
                    }
                }
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
            if (p.type === 'health') {
                audioManager.playHealthPickup();
                store.setGameplayState({ hp: Math.min(store.maxHp, store.hp + 30) });
            } else if (p.type === 'shield') {
                audioManager.playShieldPickup();
                store.setGameplayState({ activePowerup: { type: 'SHIELD', timeLeft: 15 }});
            } else if (p.type === 'rapid') {
                audioManager.playRapidFirePickup();
                store.setGameplayState({ activePowerup: { type: 'RAPID_FIRE', timeLeft: 10 }});
            } else if (p.type === 'double') {
                audioManager.playRapidFirePickup(); // Use same sound for now
                store.setGameplayState({ activePowerup: { type: 'DOUBLE_WEAPONS', timeLeft: 15 }});
            } else if (p.type === 'coin') {
                audioManager.playCoin();
                store.addCoins(10);
            }
            p.mesh.parent?.remove(p.mesh);
            this.pickups.splice(i, 1);
        }
    }
    
    // 6. Extraneous logic removed

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
