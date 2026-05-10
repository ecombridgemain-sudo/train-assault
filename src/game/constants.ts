export const LANE_WIDTH = 3;
export const GRAVITY = 30;
export const JUMP_VELOCITY = 15;
export const FORWARD_SPEED = 20; // Units per second (base)
export const TRAIN_LENGTH = 40;
export const BASE_TRAIN_GAP = 0;
export const MAX_TRAINS = 15;

// Colors
export const COLORS = {
  player: 0x00ffcc,
  enemyGrunt: 0xff3333,
  enemyDodger: 0xff00ff,
  enemyShielder: 0x666666,
  enemyGunner: 0xffff00,
  enemyBomber: 0xff6600,
  train: 0x555566,
  trainAccent: 0xffaa00,
  projectile: 0xffff00,
  bulletTrail: 0x00ffff,
  coin: 0xffd700,
  powerupHealth: 0x00ff00,
  powerupShield: 0x00ffff,
  powerupRapid: 0xff00ff,
  powerupDouble: 0xffaa00,
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
