import { create } from 'zustand';

export type GameState = 'MENU' | 'PLAYING' | 'PAUSED' | 'GAME_OVER' | 'SHOP' | 'MISSIONS' | 'SETTINGS';
export type GameMode = 'UNLIMITED' | 'MISSION';
export type WeaponType = 'PISTOL' | 'SHOTGUN' | 'RIFLE';

interface PersistentData {
  coins: number;
  gems: number;
  highScore: number;
  unlockedChapters: number[];
  unlockedMissions: number[];
  ownedSkins: string[];
  equippedSkin: string;
  ownedWeapons: WeaponType[];
  equippedWeapon: WeaponType;
  settings: {
    masterVolume: number;
    musicVolume: number;
    sfxVolume: number;
  };
}

interface StoreState {
  // UI / Meta State
  gameState: GameState;
  gameMode: GameMode;
  currentMissionId: number | null;
  persistent: PersistentData;
  setGameState: (state: GameState) => void;
  setGameMode: (mode: GameMode) => void;
  setCurrentMission: (id: number | null) => void;
  addCoins: (amount: number) => void;
  spendCoins: (amount: number) => boolean;
  updateHighScore: (score: number) => void;
  buyItem: (type: 'weapon' | 'skin', id: string, cost: number) => boolean;
  equipItem: (type: 'weapon' | 'skin', id: string) => void;
  updateSettings: (settings: Partial<PersistentData['settings']>) => void;
  
  // Realtime Gameplay State
  hp: number;
  maxHp: number;
  score: number;
  combo: number;
  bulletTimeMeter: number;
  isBulletTime: boolean;
  distance: number;
  difficultyLevel: number;
  activePowerup: { type: 'SHIELD' | 'DOUBLE_COIN' | 'RAPID_FIRE' | 'DOUBLE_WEAPONS' | null, timeLeft: number };
  setGameplayState: (state: Partial<{ 
    hp: number, maxHp: number, score: number, combo: number, 
    bulletTimeMeter: number, isBulletTime: boolean, distance: number,
    difficultyLevel: number, activePowerup: { type: 'SHIELD' | 'DOUBLE_COIN' | 'RAPID_FIRE' | 'DOUBLE_WEAPONS' | null, timeLeft: number }
  }>) => void;
}

const loadPersistentData = (): PersistentData => {
  const saved = localStorage.getItem('train_assault_save');
  const defaultData: PersistentData = {
    coins: 0,
    gems: 0,
    highScore: 0,
    unlockedChapters: [1],
    unlockedMissions: [101],
    ownedSkins: ['default'],
    equippedSkin: 'default',
    ownedWeapons: ['PISTOL'],
    equippedWeapon: 'PISTOL',
    settings: {
      masterVolume: 50,
      musicVolume: 50,
      sfxVolume: 50,
    }
  };
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      return { ...defaultData, ...parsed, settings: { ...defaultData.settings, ...parsed.settings } };
    } catch {
      return defaultData;
    }
  }
  return defaultData;
};

const savePersistentData = (data: PersistentData) => {
  localStorage.setItem('train_assault_save', JSON.stringify(data));
};

export const useGameStore = create<StoreState>((set, get) => ({
  gameState: 'MENU',
  gameMode: 'UNLIMITED',
  currentMissionId: null,
  persistent: loadPersistentData(),
  
  setGameState: (state) => set({ gameState: state }),
  setGameMode: (mode) => set({ gameMode: mode }),
  setCurrentMission: (id) => set({ currentMissionId: id }),
  
  updateSettings: (settings) => set((state) => {
    const nextPersistent = { 
      ...state.persistent, 
      settings: { ...state.persistent.settings, ...settings } 
    };
    savePersistentData(nextPersistent);
    return { persistent: nextPersistent };
  }),
  
  addCoins: (amount) => set((state) => {
    const nextPersistent = { ...state.persistent, coins: state.persistent.coins + amount };
    savePersistentData(nextPersistent);
    return { persistent: nextPersistent };
  }),
  
  spendCoins: (amount) => {
    let success = false;
    set((state) => {
      if (state.persistent.coins >= amount) {
        success = true;
        const nextPersistent = { ...state.persistent, coins: state.persistent.coins - amount };
        savePersistentData(nextPersistent);
        return { persistent: nextPersistent };
      }
      return state;
    });
    return success;
  },

  buyItem: (type, id, cost) => {
    const state = get();
    if (state.persistent.coins >= cost) {
      if (type === 'weapon' && !state.persistent.ownedWeapons.includes(id as WeaponType)) {
        state.spendCoins(cost);
        const newPersistent = { ...get().persistent, ownedWeapons: [...get().persistent.ownedWeapons, id as WeaponType] };
        savePersistentData(newPersistent);
        set({ persistent: newPersistent });
        return true;
      }
    }
    return false;
  },

  equipItem: (type, id) => {
    const state = get();
    if (type === 'weapon' && state.persistent.ownedWeapons.includes(id as WeaponType)) {
      const newPersistent = { ...state.persistent, equippedWeapon: id as WeaponType };
      savePersistentData(newPersistent);
      set({ persistent: newPersistent });
    }
  },
  
  updateHighScore: (score) => set((state) => {
    if (score > state.persistent.highScore) {
      const nextPersistent = { ...state.persistent, highScore: score };
      savePersistentData(nextPersistent);
      return { persistent: nextPersistent };
    }
    return state;
  }),
  
  hp: 100,
  maxHp: 100,
  score: 0,
  combo: 1,
  bulletTimeMeter: 100,
  isBulletTime: false,
  distance: 0,
  difficultyLevel: 1,
  activePowerup: { type: null, timeLeft: 0 },
  
  setGameplayState: (newState) => set((state) => ({ ...state, ...newState })),
}));
