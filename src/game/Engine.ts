import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { RGBShiftShader } from 'three/examples/jsm/shaders/RGBShiftShader.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { VignetteShader } from 'three/examples/jsm/shaders/VignetteShader.js';
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
  modelParts?: {
    leftLeg: THREE.Group;
    rightLeg: THREE.Group;
    leftArm: THREE.Group;
    rightArm: THREE.Group;
    torso: THREE.Group;
  };
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
  smaaPass!: SMAAPass;
  vignettePass!: ShaderPass;
  
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
  invulnTimer: number = 0;
  
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
  
  trainMaterials: THREE.ShaderMaterial[] = [];

  // Environment
  scenery: THREE.Group;
  sceneryInstances: any[] = [];
  pillarInstanced!: THREE.InstancedMesh;
  mountainInstanced!: THREE.InstancedMesh;
  crysInstanced!: THREE.InstancedMesh;
  frameInstanced!: THREE.InstancedMesh;
  innerFrameInstanced!: THREE.InstancedMesh;

  // Materials for theme switching
  sunMat!: THREE.MeshBasicMaterial;
  starsMat!: THREE.PointsMaterial;
  pillarMat!: THREE.MeshStandardMaterial;
  mountainMat!: THREE.ShaderMaterial;
  wireMat!: THREE.MeshBasicMaterial;
  crysMat!: THREE.MeshStandardMaterial;
  dirLight!: THREE.DirectionalLight;
  ambLight!: THREE.AmbientLight;

  // Player Animation parts
  playerModelGroup?: THREE.Group;
  playerLeftLeg?: THREE.Group;
  playerRightLeg?: THREE.Group;
  playerLeftArm?: THREE.Group;
  playerRightArm?: THREE.Group;
  playerTorso?: THREE.Group;

  applyTheme() {
    const storeText = useGameStore.getState().persistent;
    const theme = storeText.settings?.theme || 'DESERT';
    const postProcessing = storeText.settings?.postProcessing !== false;
    
    // Toggle post processing
    this.bloomPass.enabled = postProcessing;
    this.rgbShiftPass.enabled = postProcessing;

    if (theme === 'DESERT') {
        const bg = new THREE.Color(0xeab308);
        this.scene.background = bg;
        this.scene.fog = new THREE.FogExp2(bg, 0.005);
        this.dirLight.color.setHex(0xffeedd);
        this.ambLight.color.setHex(0xffcc99);
        this.sunMat.color.setHex(0xff5500);
        this.starsMat.color.setHex(0xffcc88);
        this.starsMat.opacity = 0.8;
        this.pillarMat.color.setHex(0xd2691e);
        this.crysMat.color.setHex(0xffaa00);
        this.crysMat.emissive.setHex(0x884400);
        this.wireMat.color.setHex(0xcc6600);
        if (this.mountainMat) {
            this.mountainMat.uniforms.baseColor.value.setHex(0x3a2311);
            this.mountainMat.uniforms.peakColor.value.setHex(0xff4400); // Lava/Sun light peak
        }
    } else if (theme === 'SNOW') {
        const bg = new THREE.Color(0xddeeff);
        this.scene.background = bg;
        this.scene.fog = new THREE.FogExp2(bg, 0.005);
        this.dirLight.color.setHex(0xffffff);
        this.ambLight.color.setHex(0xcceeff);
        this.sunMat.color.setHex(0xffffff);
        this.starsMat.color.setHex(0xffffff); // snowflakes
        this.starsMat.opacity = 0.9;
        this.pillarMat.color.setHex(0x94a3b8);
        this.crysMat.color.setHex(0xbae6fd);
        this.crysMat.emissive.setHex(0x38bdf8);
        this.wireMat.color.setHex(0x60a5fa);
        if (this.mountainMat) {
            this.mountainMat.uniforms.baseColor.value.setHex(0x1e293b);
            this.mountainMat.uniforms.peakColor.value.setHex(0x0ea5e9); // Ice glow peak
        }
    } else if (theme === 'SPRING') {
        const bg = new THREE.Color(0x7dd3fc); // Light blue sky
        this.scene.background = bg;
        this.scene.fog = new THREE.FogExp2(bg, 0.005);
        this.dirLight.color.setHex(0xfff8e7);
        this.ambLight.color.setHex(0xccffcc);
        this.sunMat.color.setHex(0xfde047);
        this.starsMat.color.setHex(0xffffff);
        this.starsMat.opacity = 0.0; // Hide stars/dust in spring
        this.pillarMat.color.setHex(0x4ade80);
        this.crysMat.color.setHex(0xf472b6);
        this.crysMat.emissive.setHex(0xbe185d);
        this.wireMat.color.setHex(0x22c55e);
        if (this.mountainMat) {
            this.mountainMat.uniforms.baseColor.value.setHex(0x064e3b); // Dark green
            this.mountainMat.uniforms.peakColor.value.setHex(0xa7f3d0); // Light green peak
        }
    }

    // Refresh train materials colors based on theme too
    this.trainMaterials.forEach(mat => {
        if (theme === 'DESERT') {
            mat.uniforms.color1.value.setHex(0xd2b48c);
            mat.uniforms.color2.value.setHex(0xc2a47c);
            mat.uniforms.gridColor.value.setHex(0x8b5a2b);
        } else if (theme === 'SNOW') {
            mat.uniforms.color1.value.setHex(0xffffff);
            mat.uniforms.color2.value.setHex(0xe2e8f0);
            mat.uniforms.gridColor.value.setHex(0xcbd5e1);
        } else if (theme === 'SPRING') {
            mat.uniforms.color1.value.setHex(0x86efac);
            mat.uniforms.color2.value.setHex(0x4ade80);
            mat.uniforms.gridColor.value.setHex(0x166534);
        }
    });
  }

  constructor(container: HTMLElement) {
    this.container = container;
    
    // Setup Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xeab308); // Desert sky
    this.scene.fog = new THREE.Fog(0xeab308, 50, 300);
    
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
    
    // Bloom (adjusting for high-tier look - more emissive bleeding)
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.0, 0.5, 0.6);
    this.composer.addPass(this.bloomPass);
    
    // Chromatic Aberration
    this.rgbShiftPass = new ShaderPass(RGBShiftShader);
    this.rgbShiftPass.uniforms['amount'].value = 0.0015;
    this.composer.addPass(this.rgbShiftPass);

    // Vignette
    this.vignettePass = new ShaderPass(VignetteShader);
    this.vignettePass.uniforms['offset'].value = 1.0;
    this.vignettePass.uniforms['darkness'].value = 1.2;
    this.composer.addPass(this.vignettePass);
    
    // SMAA
    this.smaaPass = new SMAAPass(window.innerWidth * this.renderer.getPixelRatio(), window.innerHeight * this.renderer.getPixelRatio());
    this.composer.addPass(this.smaaPass);
    
    // Output pass
    const outputPass = new OutputPass();
    this.composer.addPass(outputPass);
    
    // Lighting
    this.dirLight = new THREE.DirectionalLight(0xffeedd, 2.5); // Intense desert sun
    this.dirLight.position.set(20, 50, 20);
    this.scene.add(this.dirLight);
    
    // Soft sky light (warm ambient)
    this.ambLight = new THREE.AmbientLight(0xffcc99, 0.8);
    this.scene.add(this.ambLight);
    
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

    // Procedural Sci-Fi Soldier Model
    const soldierGroup = new THREE.Group();
    
    // Materials
    const armorMat = new THREE.MeshPhysicalMaterial({ 
        color: COLORS.player, 
        roughness: 0.1, 
        metalness: 0.3, 
        clearcoat: 1.0, 
        clearcoatRoughness: 0.1,
        emissive: COLORS.player,
        emissiveIntensity: 0.3,
        transmission: 0.2, // slight glass look
    }); // High-tech energy armor
    const underSuitMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.8 }); // Slate-800
    const visorMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x38bdf8, emissiveIntensity: 1.5 }); // Light blue visor
    const gunBodyMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.5 }); // Slate-700
    const glowMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x38bdf8, emissiveIntensity: 1.0 });
    
    // Core structure
    this.playerTorso = new THREE.Group();
    this.playerTorso.position.y = 1.0; 
    soldierGroup.add(this.playerTorso);
    
    // Torso (Main chest + stomach)
    // Round chest
    const chest = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.4, 0.6, 8), armorMat);
    chest.position.y = 0.2;
    const stomach = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.4, 0.4, 8), underSuitMat);
    stomach.position.y = -0.3;
    const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.2, 8), gunBodyMat);
    belt.position.y = -0.55;
    this.playerTorso.add(chest, stomach, belt);
    
    // Backpack
    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.3), armorMat);
    pack.position.set(0, 0.1, 0.35); // offset to back (+Z is back)
    const packAcc = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.4, 8), gunBodyMat);
    packAcc.rotation.z = Math.PI / 2;
    packAcc.position.set(0, -0.1, 0.4);
    const packGlow = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.2, 0.36), glowMat);
    packGlow.position.set(-0.15, 0.1, 0.3);
    this.playerTorso.add(pack, packAcc, packGlow);
    
    // Head
    const headGroup = new THREE.Group();
    headGroup.position.y = 0.6; // Pivot at neck
    this.playerTorso.add(headGroup);
    
    const helmet = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.5, 12), armorMat);
    helmet.rotation.y = Math.PI / 2;
    helmet.position.y = 0.2;
    // Sphere top for helmet
    const helmetTop = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 12, 0, Math.PI * 2, 0, Math.PI / 2), armorMat);
    helmetTop.position.y = 0.45;
    
    // Visor shape across face
    const visor = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.31, 0.2, 12, 1, false, Math.PI, Math.PI), visorMat);
    visor.position.set(0, 0.25, 0); 
    visor.rotation.y = -Math.PI / 2;
    headGroup.add(helmet, helmetTop, visor);

    // Left Arm (pivot at shoulder)
    this.playerLeftArm = new THREE.Group();
    this.playerLeftArm.position.set(-0.6, 0.4, 0);
    this.playerTorso.add(this.playerLeftArm);
    
    // Sphere shoulder
    const shoulderL = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 8), armorMat);
    shoulderL.position.y = -0.1;
    const bicepL = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.5, 8), underSuitMat);
    bicepL.position.y = -0.5;
    const forearmL = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.15, 0.5, 8), armorMat);
    forearmL.position.y = -1.0;
    this.playerLeftArm.add(shoulderL, bicepL, forearmL);

    // Right Arm (pivot at shoulder, holding gun)
    this.playerRightArm = new THREE.Group();
    this.playerRightArm.position.set(0.6, 0.4, 0);
    this.playerTorso.add(this.playerRightArm);
    
    const shoulderR = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 8), armorMat);
    shoulderR.position.y = -0.1;
    const bicepR = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.5, 8), underSuitMat);
    bicepR.position.set(0, -0.5, -0.2);
    bicepR.rotation.x = -Math.PI / 4;
    const forearmR = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.15, 0.5, 8), armorMat);
    forearmR.position.set(0, -0.7, -0.5);
    forearmR.rotation.x = -Math.PI / 2;
    this.playerRightArm.add(shoulderR, bicepR, forearmR);

    // Sci-Fi Rifle (Child of right arm)
    const gunGroup = new THREE.Group();
    const gunBody = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.35, 1.2), gunBodyMat); // Keep gun somewhat boxy for tech look
    const gunBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.8, 8), gunBodyMat);
    gunBarrel.rotation.x = Math.PI / 2;
    gunBarrel.position.set(0, 0.1, -0.9);
    const gunMag = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.35, 0.25), gunBodyMat);
    gunMag.position.set(0, -0.3, 0.1);
    const gunStock = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.3, 0.5), gunBodyMat);
    gunStock.position.set(0, -0.05, 0.8);
    const gunGlow1 = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.0, 8), glowMat);
    gunGlow1.rotation.x = Math.PI / 2;
    gunGlow1.position.set(0, 0.05, -0.2);
    
    gunGroup.add(gunBody, gunBarrel, gunMag, gunStock, gunGlow1);
    gunGroup.position.set(-0.1, -0.7, -0.8);
    this.playerRightArm.add(gunGroup);

    // Legs (pivot at hips)
    this.playerLeftLeg = new THREE.Group();
    this.playerLeftLeg.position.set(-0.25, -0.6, 0);
    this.playerTorso.add(this.playerLeftLeg);
    
    const thighL = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.18, 0.6, 8), underSuitMat);
    thighL.position.y = -0.3;
    const calfL = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.15, 0.7, 8), armorMat);
    calfL.position.y = -0.9;
    this.playerLeftLeg.add(thighL, calfL);

    this.playerRightLeg = new THREE.Group();
    this.playerRightLeg.position.set(0.25, -0.6, 0);
    this.playerTorso.add(this.playerRightLeg);
    
    const thighR = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.18, 0.6, 8), underSuitMat);
    thighR.position.y = -0.3;
    const calfR = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.15, 0.7, 8), armorMat);
    calfR.position.y = -0.9;
    this.playerRightLeg.add(thighR, calfR);

    // Raise soldier a bit
    soldierGroup.position.y = 0.5;

    // Use the soldierGroup as the placeholder
    this.playerModelGroup = soldierGroup;
    this.player.add(this.playerModelGroup);

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
    this.starsMat = new THREE.PointsMaterial({size: 1.0, color: 0xffcc88, transparent: true, opacity: 0.8, fog: true}); // Dust storm!
    const starMesh = new THREE.Points(starsGeo, this.starsMat);
    this.scene.add(starMesh);

    // Distant sun
    const sunGeo = new THREE.CircleGeometry(120, 32);
    this.sunMat = new THREE.MeshBasicMaterial({ color: 0xff5500, fog: true, transparent: true, opacity: 0.8 }); // Huge setting sun
    const sun = new THREE.Mesh(sunGeo, this.sunMat);
    sun.position.set(0, 10, -400); // Low on the horizon
    sun.lookAt(this.camera.position);
    this.scene.add(sun);

    // Setup Desert Scenery
    this.scenery = new THREE.Group();
    this.scene.add(this.scenery);
    
    // Instanced Rocks / Pillars
    const numPillars = 40;
    const pillarGeo = new THREE.DodecahedronGeometry(8, 1);
    this.pillarMat = new THREE.MeshStandardMaterial({ color: 0xd2691e, roughness: 1.0, metalness: 0.0 }); // Chocolate / Rock color
    const pillarInstanced = new THREE.InstancedMesh(pillarGeo, this.pillarMat, numPillars);
    
    // Mountains
    const numMountains = 20;
    const mountainGeo = new THREE.ConeGeometry(50, 100, 4);
    
    this.mountainMat = new THREE.ShaderMaterial({
        uniforms: {
            baseColor: { value: new THREE.Color(0x3a2311) },
            peakColor: { value: new THREE.Color(0xff4400) }
        },
        vertexShader: `
            varying float vY;
            void main() {
                vY = position.y;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform vec3 baseColor;
            uniform vec3 peakColor;
            varying float vY;
            void main() {
                float h = clamp((vY + 50.0) / 100.0, 0.0, 1.0);
                vec3 finalColor = mix(baseColor, peakColor, pow(h, 2.0));
                gl_FragColor = vec4(finalColor, 1.0);
            }
        `
    });
    
    const mountainInstanced = new THREE.InstancedMesh(mountainGeo, this.mountainMat, numMountains);
    
    // Instanced Crystals & Wireframes
    const numWireframes = 30;
    const crysGeo = new THREE.IcosahedronGeometry(6, 0);
    this.crysMat = new THREE.MeshStandardMaterial({ 
        color: 0xffaa00, 
        emissive: 0x884400,
        emissiveIntensity: 0.5,
        roughness: 0.4, 
        flatShading: true
    });
    const crysInstanced = new THREE.InstancedMesh(crysGeo, this.crysMat, numWireframes);
    
    const frameGeo = new THREE.BoxGeometry(10, 10, 10);
    const innerFrameGeo = new THREE.OctahedronGeometry(6, 0);
    this.wireMat = new THREE.MeshBasicMaterial({ color: 0xcc6600, wireframe: true, transparent: true, opacity: 0.3 });
    
    const frameInstanced = new THREE.InstancedMesh(frameGeo, this.wireMat, numWireframes);
    const innerFrameInstanced = new THREE.InstancedMesh(innerFrameGeo, this.wireMat, numWireframes);
    
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

    for (let i = 0; i < numMountains; i++) {
        const sign = i % 2 === 0 ? 1 : -1;
        const z = -Math.random() * 600 - 100;
        const x = sign * (100 + Math.random() * 50);
        const y = -10; // Base on ground
        
        // Random slight rotation
        const rot = new THREE.Euler(0, Math.random() * Math.PI, 0);
        this.sceneryInstances.push({
            type: 'mountain', index: i, pos: new THREE.Vector3(x, y, z), rot, rotSpeed: new THREE.Euler()
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
    this.mountainInstanced = mountainInstanced;
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
        } else if (inst.type === 'mountain') {
            dummy.rotation.copy(inst.rot);
            dummy.updateMatrix();
            this.mountainInstanced.setMatrixAt(inst.index, dummy.matrix);
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
    this.scenery.add(mountainInstanced);
    this.scenery.add(crysInstanced);
    this.scenery.add(frameInstanced);
    this.scenery.add(innerFrameInstanced);

    this.clock = new THREE.Clock();
    
    this.setupInput();
    this.initializeWorld();
    this.applyTheme();
    
    useGameStore.subscribe((state, prevState) => {
        if (state.persistent.settings !== prevState.persistent.settings) {
            this.applyTheme();
        }
    });

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
    this.trainMaterials.forEach(m => m.dispose());
    this.trainMaterials = [];
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
    
    // Custom shader material for the train surface to look like desert sand
    const trainMat = new THREE.ShaderMaterial({
        uniforms: {
            time: { value: 0 },
            color1: { value: new THREE.Color(0xd2b48c) }, // Tan
            color2: { value: new THREE.Color(0xc2a47c) }, // Darker sand
            gridColor: { value: new THREE.Color(0x8b5a2b) } // Dark brown
        },
        vertexShader: `
            varying vec2 vUv;
            varying vec3 vWorldPosition;
            void main() {
                vUv = uv;
                vec4 worldPosition = modelMatrix * vec4(position, 1.0);
                vWorldPosition = worldPosition.xyz;
                gl_Position = projectionMatrix * viewMatrix * worldPosition;
            }
        `,
        fragmentShader: `
            uniform float time;
            uniform vec3 color1;
            uniform vec3 color2;
            uniform vec3 gridColor;
            varying vec2 vUv;
            varying vec3 vWorldPosition;
            
            // Noise function
            float random(vec2 st) {
                return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
            }
            
            void main() {
                // Use UV for local mapping so pattern moves with the train
                vec2 gridUv = vUv * vec2(10.0, 40.0); // Scale grid according to train dimensions approx
                
                vec2 grid = abs(fract(gridUv - 0.5) - 0.5) / fwidth(gridUv);
                float line = min(grid.x, grid.y);
                float gridLine = 1.0 - min(line, 1.0);
                
                // Checkerboard pattern for base texture variation
                float noise = random(floor(gridUv * 4.0));
                vec3 baseColor = mix(color1, color2, noise);
                
                vec3 finalColor = mix(baseColor, gridColor, gridLine * 0.3);
                
                gl_FragColor = vec4(finalColor, 1.0);
            }
        `
    });
    this.trainMaterials.push(trainMat);
    
    const trainMesh = new THREE.Mesh(trainGeo, trainMat);
    trainMesh.position.y = -1; // Top of train is y=0
    trainGroup.add(trainMesh);
    
    // Glowing Side Rails
    const energyRailGeo = new THREE.BoxGeometry(0.5, 0.5, TRAIN_LENGTH);
    const railMat = new THREE.MeshPhysicalMaterial({ 
        color: 0xffffff, 
        emissive: 0x00ffff, // cyan energy rails
        emissiveIntensity: 2.0,
        roughness: 0.1,
        metalness: 0.8 
    });
    const leftRail = new THREE.Mesh(energyRailGeo, railMat);
    leftRail.position.set(-trainWidth / 2 + 0.25, 0.25, 0);
    trainGroup.add(leftRail);
    
    const rightRail = new THREE.Mesh(energyRailGeo, railMat);
    rightRail.position.set(trainWidth / 2 - 0.25, 0.25, 0);
    trainGroup.add(rightRail);


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
    
    const matArmor = new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.8 });
    const matDark = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9, metalness: 0.5 });
    const matGlow = new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xff0000, emissiveIntensity: 2 });
    
    const mesh = new THREE.Group();
    mesh.position.y = 1;
    
    const torso = new THREE.Group();
    torso.position.y = 0.8;
    mesh.add(torso);
    
    // Chest depending on type
    let chestGeo: THREE.BufferGeometry = new THREE.CylinderGeometry(0.4, 0.4, 0.6, 8);
    if (type === 'shielder') chestGeo = new THREE.CylinderGeometry(0.6, 0.6, 0.8, 8);
    if (type === 'dodger') chestGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.5, 8);
    const chest = new THREE.Mesh(chestGeo, matArmor);
    torso.add(chest);
    
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 8), matDark);
    head.position.y = (type === 'shielder' ? 0.7 : 0.5);
    torso.add(head);
    
    const eye = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.1, 8, 1, false, 0, Math.PI), matGlow);
    eye.position.y = (type === 'shielder' ? 0.7 : 0.5);
    eye.rotation.y = -Math.PI / 2;
    torso.add(eye);
    
    const leftArm = new THREE.Group();
    leftArm.position.set(-0.6, 0.2, 0);
    const armL = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.7, 8), matArmor);
    armL.position.y = -0.35;
    leftArm.add(armL);
    torso.add(leftArm);
    
    const rightArm = new THREE.Group();
    rightArm.position.set(0.6, 0.2, 0);
    const armR = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.7, 8), matArmor);
    armR.position.y = -0.35;
    rightArm.add(armR);
    torso.add(rightArm);
    
    if (type === 'gunner' || type === 'bomber') {
        const gun = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.9, 8), matDark);
        gun.rotation.x = Math.PI / 2;
        gun.position.set(0, -0.6, -0.4);
        rightArm.add(gun);
    }
    
    const leftLeg = new THREE.Group();
    leftLeg.position.set(-0.3, -0.2, 0);
    const legL = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.8, 8), matArmor);
    legL.position.y = -0.4;
    leftLeg.add(legL);
    torso.add(leftLeg);
    
    const rightLeg = new THREE.Group();
    rightLeg.position.set(0.3, -0.2, 0);
    const legR = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.8, 8), matArmor);
    legR.position.y = -0.4;
    rightLeg.add(legR);
    torso.add(rightLeg);
    
    // Add glowing wireframe outer shell
    const wireMat = new THREE.MeshBasicMaterial({ color, wireframe: true, transparent: true, opacity: 0.6 });
    const wireGroup = mesh.clone(true);
    wireGroup.traverse((child) => {
        if (child instanceof THREE.Mesh) {
            child.material = wireMat;
            child.scale.setScalar(1.05); // slightly larger
        }
    });
    mesh.add(wireGroup);
    
    mesh.scale.set(2.0, 2.0, 2.0); // Make enemies larger
    
    const localZ = (Math.random() - 0.5) * (TRAIN_LENGTH - 10);
    mesh.position.set(lane * LANE_WIDTH, 0, localZ);
    trainGroup.add(mesh); // Attach to train so it moves with it relative to player
    
    this.enemies.push({
      mesh,
      type,
      hp: (type === 'shielder' ? 70 : 30) * diff,
      lane,
      zBase: trainZ + localZ,
      state: 'idle',
      timer: 0,
      modelParts: { torso, leftArm, rightArm, leftLeg, rightLeg }
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
      
      // Massive Floating Pyramid
      const geoCenter = new THREE.ConeGeometry(15, 30, 4);
      const mat = new THREE.MeshPhysicalMaterial({ 
          color: 0xaa0000, 
          emissive: 0x550000, 
          roughness: 0.1,
          metalness: 0.8,
          clearcoat: 1.0,
      });
      const mainObj = new THREE.Mesh(geoCenter, mat);
      mainObj.rotation.x = Math.PI; // Point down
      bossGroup.add(mainObj);
      
      // Wireframe overlay for boss
      const wireMat = new THREE.MeshBasicMaterial({ color: 0xff0000, wireframe: true, transparent: true, opacity: 0.8 });
      const wireMesh = new THREE.Mesh(geoCenter, wireMat);
      wireMesh.scale.setScalar(1.02);
      wireMesh.rotation.copy(mainObj.rotation);
      bossGroup.add(wireMesh);
      
      // Rotating energy ring
      const ringGeo = new THREE.TorusGeometry(18, 0.8, 8, 4);
      const ringMat = new THREE.MeshStandardMaterial({ color: 0xff4400, emissive: 0xcc2200, roughness: 0.1, wireframe: true });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.name = "bossRing"; // to rotate it in update
      ring.rotation.x = Math.PI / 2;
      bossGroup.add(ring);
      
      // "Wings" or side blocks - making them giant floating prisms
      const wingGeo = new THREE.CylinderGeometry(2, 2, 20, 3);
      const wingMat = new THREE.MeshStandardMaterial({ color: 0x333333, emissive: 0x111111 });
      const wing1 = new THREE.Mesh(wingGeo, wingMat);
      wing1.position.set(-15, 5, 0);
      wing1.rotation.z = Math.PI / 4;
      bossGroup.add(wing1);
      
      const wing2 = new THREE.Mesh(wingGeo, wingMat);
      wing2.position.set(15, 5, 0);
      wing2.rotation.z = -Math.PI / 4;
      bossGroup.add(wing2);
      
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
        
        // Visual Recoil
        if (this.playerRightArm) {
            this.playerRightArm.rotation.x -= 0.3;
        }
        
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

  triggerPlayerTrail() {
    if (Math.random() > 0.5) return; // Don't spawn every frame
    const geo = new THREE.TetrahedronGeometry(0.3);
    const mat = new THREE.MeshBasicMaterial({ color: COLORS.player, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(this.player.position);
    mesh.position.y += Math.random() * 2; // Random height on body
    mesh.position.x += (Math.random() - 0.5);
    
    this.scene.add(mesh);
    this.particles.push({
        mesh,
        velocity: new THREE.Vector3(
            (Math.random() - 0.5) * 2,
            Math.random() * 2,
            Math.random() * 5 + 5 // Move backwards relative to world
        ),
        life: 0.5,
        maxLife: 0.5
    });
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
    if (this.invulnTimer > 0) return;
    
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
    
    // Update custom shaders
    this.trainMaterials.forEach(mat => {
        if (mat.uniforms && mat.uniforms.time) {
            mat.uniforms.time.value = this.runTime;
        }
    });
    
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
    
    if (this.invulnTimer > 0) {
        this.invulnTimer -= dt;
        this.player.visible = Math.floor(this.runTime * 15) % 2 === 0;
    } else {
        this.player.visible = true;
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
    
    // Player effects
    this.triggerPlayerTrail();
    
    // Bank animation for lane change
    const xDiff = this.targetX - this.player.position.x;
    if (this.playerModelGroup) {
        // Roll into the turn
        this.playerModelGroup.rotation.z = THREE.MathUtils.lerp(this.playerModelGroup.rotation.z, xDiff * -0.15, 10 * dt);
        // Slight yaw into the turn
        this.playerModelGroup.rotation.y = THREE.MathUtils.lerp(this.playerModelGroup.rotation.y, xDiff * -0.1, 10 * dt);
    }
    
    // 2. Move Player Y (Jumping & Gravity)
    let overTrain = false;
    for (let t of this.trains) {
        // Expand the check bounds slightly to compensate for floating point and train movement
        if (this.player.position.z >= t.position.z - TRAIN_LENGTH/2 - 1.0 && 
            this.player.position.z <= t.position.z + TRAIN_LENGTH/2 + 1.0) {
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
    
    // Animate Player Model
    if (this.playerModelGroup && this.playerLeftLeg && this.playerRightLeg && this.playerLeftArm && this.playerRightArm && this.playerTorso) {
        if (!this.isJumping) {
            // Running animation
            const runSpeed = 15;
            const t = this.runTime * runSpeed;
            
            // Legs swing
            this.playerLeftLeg.rotation.x = Math.sin(t) * 0.8;
            this.playerRightLeg.rotation.x = Math.sin(t + Math.PI) * 0.8;
            
            // Arms swing (opposite to legs)
            this.playerLeftArm.rotation.x = Math.sin(t + Math.PI) * 0.5;
            // Keep right arm pointing forward mostly, but slightly bouncing
            const targetArmX = -0.1 + Math.sin(t) * 0.1;
            this.playerRightArm.rotation.x = THREE.MathUtils.lerp(this.playerRightArm.rotation.x, targetArmX, 15 * dt);
            
            // Torso bounce
            this.playerTorso.position.y = 1.0 + Math.abs(Math.sin(t * 2)) * 0.1;
            this.playerTorso.rotation.y = Math.sin(t) * 0.1;
            this.playerTorso.rotation.z = Math.sin(t + Math.PI/2) * 0.05;
        } else {
            // Jumping animation
            this.playerLeftLeg.rotation.x = THREE.MathUtils.lerp(this.playerLeftLeg.rotation.x, -0.6, 10 * dt);
            this.playerRightLeg.rotation.x = THREE.MathUtils.lerp(this.playerRightLeg.rotation.x, 0.2, 10 * dt);
            
            this.playerLeftArm.rotation.x = THREE.MathUtils.lerp(this.playerLeftArm.rotation.x, 0.5, 10 * dt);
            this.playerRightArm.rotation.x = THREE.MathUtils.lerp(this.playerRightArm.rotation.x, -0.3, 10 * dt);
            
            this.playerTorso.position.y = THREE.MathUtils.lerp(this.playerTorso.position.y, 1.0, 10 * dt);
            this.playerTorso.rotation.y = THREE.MathUtils.lerp(this.playerTorso.rotation.y, 0, 10 * dt);
            this.playerTorso.rotation.z = THREE.MathUtils.lerp(this.playerTorso.rotation.z, 0, 10 * dt);
            
            // Pitch forward/backward depending on vertical velocity
            const jumpPitch = Math.max(-0.5, Math.min(0.5, this.yVelocity * 0.05));
            this.playerTorso.rotation.x = THREE.MathUtils.lerp(this.playerTorso.rotation.x, -jumpPitch, 10 * dt);
        }
        
        // Recover torso pitch when NOT jumping
        if (!this.isJumping) {
            this.playerTorso.rotation.x = THREE.MathUtils.lerp(this.playerTorso.rotation.x, 0, 10 * dt);
        }
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
        // Find and dispose the material of the removed train
        const trainMesh = t.children.find(c => c instanceof THREE.Mesh && c.material instanceof THREE.ShaderMaterial) as THREE.Mesh;
        if (trainMesh && trainMesh.material) {
            const matIndex = this.trainMaterials.indexOf(trainMesh.material as THREE.ShaderMaterial);
            if (matIndex > -1) {
                this.trainMaterials.splice(matIndex, 1);
            }
            (trainMesh.material as THREE.ShaderMaterial).dispose();
        }
        
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
      
      const currentGap = BASE_TRAIN_GAP + (diffLevel - 1) * 4;
      
      this.spawnTrain(minZ - (TRAIN_LENGTH + currentGap));
    }
    
    // 3.5 Move Scenery for Parallax Effect
    let dummy = new THREE.Object3D();
    const instUpdate = { pillar: false, mountain: false, crys: false, frame: false, inner: false };
    
    for (const inst of this.sceneryInstances) {
        if (inst.type === 'mountain') {
            inst.pos.z += moveDist * 0.1; // Mountains move very slowly
            if (inst.pos.z > 200) {
                inst.pos.z -= 800;
            }
        } else {
            inst.pos.z += moveDist * 0.8;
            if (inst.pos.z > 50) {
                inst.pos.z -= 450;
            }
        }
        
        inst.rot.x += inst.rotSpeed.x * dt;
        inst.rot.y += inst.rotSpeed.y * dt;
        inst.rot.z += inst.rotSpeed.z * dt;
        
        dummy.position.copy(inst.pos);
        
        if (inst.type === 'pillar') {
            dummy.updateMatrix();
            this.pillarInstanced.setMatrixAt(inst.index, dummy.matrix);
            instUpdate.pillar = true;
        } else if (inst.type === 'mountain') {
            dummy.rotation.copy(inst.rot);
            dummy.updateMatrix();
            this.mountainInstanced.setMatrixAt(inst.index, dummy.matrix);
            instUpdate.mountain = true;
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
    if (instUpdate.mountain) this.mountainInstanced.instanceMatrix.needsUpdate = true;
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
            const scale = 2.0 + Math.sin(e.timer * 10) * 0.4;
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
                        
                        // High-damage laser attack
                        for(let k = -1; k <= 1; k++) {
                            setTimeout(() => {
                                if (store.gameState !== 'PLAYING') return;
                                const projGeo = new THREE.CylinderGeometry(0.8, 0.8, 10, 8);
                                const projMat = new THREE.MeshBasicMaterial({ color: 0xff0000 }); // Massive red laser
                                const proj = new THREE.Mesh(projGeo, projMat);
                                
                                const spawnPos = new THREE.Vector3();
                                e.mesh.getWorldPosition(spawnPos);
                                spawnPos.y -= 5; // Base of the pyramid
                                proj.position.copy(spawnPos);
                                
                                const pPos = this.player.position.clone();
                                pPos.x += k * LANE_WIDTH * 1.5;
                                const dir = pPos.sub(spawnPos).normalize();
                                
                                // Align cylinder to direction
                                const axis = new THREE.Vector3(0, 1, 0);
                                proj.quaternion.setFromUnitVectors(axis, dir);
                                
                                this.scene.add(proj);
                                this.projectiles.push({ mesh: proj, velocity: dir.multiplyScalar(40 + 5*diffLevel), isPlayer: false, life: 5.0, damage: 30 });
                            }, (k + 1) * 300);
                        }
                        
                        // Flash scene lighting (simulate beam lighting)
                        const originalIntensity = this.dirLight.intensity;
                        const originalColor = this.dirLight.color.getHex();
                        this.dirLight.color.setHex(0xff0000);
                        this.dirLight.intensity = 5.0;
                        setTimeout(() => {
                            this.dirLight.color.setHex(originalColor);
                            this.dirLight.intensity = originalIntensity;
                        }, 400);
                    }
                }
            }
        }
        
        // Enemy Animation
        if (e.modelParts && e.type !== 'boss') {
            const animSpeed = 10;
            const t = this.runTime * animSpeed + e.timer * 5; // Use timer as offset
            
            // Legs swing
            e.modelParts.leftLeg.rotation.x = Math.sin(t) * 0.8;
            e.modelParts.rightLeg.rotation.x = Math.sin(t + Math.PI) * 0.8;
            
            // Arms swing
            e.modelParts.leftArm.rotation.x = Math.sin(t + Math.PI) * 0.5;
            
            if (e.type === 'gunner' || e.type === 'bomber') {
                // Pointing weapon forward
                e.modelParts.rightArm.rotation.x = -0.1 + Math.sin(t*2)*0.05;
            } else {
                e.modelParts.rightArm.rotation.x = Math.sin(t) * 0.5;
            }
            
            // Torso bounce
            e.modelParts.torso.position.y = 0.8 + Math.abs(Math.sin(t * 2)) * 0.1;
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
