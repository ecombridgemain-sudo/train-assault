export const LANE_WIDTH = 3;
export const GRAVITY = 30;
export const JUMP_VELOCITY = 15;
export const FORWARD_SPEED = 20; // Units per second (base)
export const TRAIN_LENGTH = 40;
export const BASE_TRAIN_GAP = 0;
export const MAX_TRAINS = 15;

// Colors
export const COLORS = {
  player: 0x3b82f6,      // Blue soldier
  enemyGrunt: 0xe11d48,  // Red enemies
  enemyDodger: 0x9333ea, // Purple
  enemyShielder: 0x475569,// Slate
  enemyGunner: 0xd97706, // Amber
  enemyBomber: 0xeab308, // Yellow
  train: 0xffffff,
  trainAccent: 0xe2e8f0,
  projectile: 0xfef08a,
  bulletTrail: 0x94a3b8,
  coin: 0xfde047,
  powerupHealth: 0x22c55e,
  powerupShield: 0x06b6d4,
  powerupRapid: 0xd946ef,
  powerupDouble: 0xf97316,
};

export const WEAPONS = {
  PISTOL: {
    fireRate: 0.3, // seconds between shots
    damage: 20,
    projectiles: 1,
    spread: 0,
  },
  SHOTGUN: {
    fireRate: 0.8,
    damage: 15, // per projectile
    projectiles: 3,
    spread: 0.15, // angle
  },
  RIFLE: {
    fireRate: 0.1,
    damage: 10,
    projectiles: 1,
    spread: 0.05,
  }
};
