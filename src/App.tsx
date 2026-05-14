import React, { useEffect, useRef, useState } from 'react';
import { GameEngine } from './game/Engine';
import { useGameStore, GameState } from './store/useGameStore';
import { Play, ShoppingCart, Target, Settings, ShieldAlert, Zap, Repeat, Heart } from 'lucide-react';
import { audioManager } from './game/AudioManager';
import { motion } from 'motion/react';

let gameEngine: GameEngine | null = null;

// --- Components ---

const HUD = () => {
  const { hp, maxHp, score, combo, bulletTimeMeter, isBulletTime, activePowerup, difficultyLevel, lastHitTime } = useGameStore();
  
  return (
    <>
      {lastHitTime > 0 && (
        <motion.div 
          key={lastHitTime}
          initial={{ opacity: 0.8 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="absolute inset-0 pointer-events-none bg-red-600/30 mix-blend-overlay z-10"
          style={{ boxShadow: 'inset 0 0 150px rgba(255, 0, 0, 0.8)' }}
        />
      )}
      <div className="absolute inset-0 pointer-events-none flex flex-col justify-between z-20" style={{ fontFamily: 'Orbitron, sans-serif' }}>
      {/* Top HUD Bar */}
      <nav className="relative h-auto md:h-24 py-3 md:py-0 flex items-start md:items-center justify-between px-3 md:px-8 bg-gradient-to-b from-black/80 to-transparent">
        
        {/* Left Side: VITALITY and FOCUS */}
        <div className="flex flex-col sm:flex-row items-start md:items-center gap-3 md:gap-8 w-auto md:w-1/3 z-10">
          <div className="group w-[120px] md:w-auto">
            <div className="flex justify-between items-end mb-1">
              <span className="text-[10px] md:text-[12px] font-bold tracking-[0.1em] md:tracking-[0.2em] text-[#ff8800] uppercase">Vitality</span>
              <span className="text-[10px] md:text-sm font-bold text-white/80">{Math.ceil((hp / maxHp) * 100)}/100</span>
            </div>
            <div className="w-full md:w-56 h-2 md:h-3 bg-white/10 border border-white/20 relative">
              {/* Segmented health bar effect */}
              <div 
                  className="absolute inset-y-0 left-0 bg-gradient-to-r from-orange-600 to-orange-400 shadow-[0_0_15px_rgba(255,136,0,0.6)] transition-all duration-300" 
                  style={{ width: `${(hp / maxHp) * 100}%` }}
              >
                  <div className="w-full h-full" style={{ backgroundImage: 'repeating-linear-gradient(90deg, transparent, transparent 4px, rgba(0,0,0,0.5) 4px, rgba(0,0,0,0.5) 5px)' }}></div>
              </div>
            </div>
          </div>
          
          <div className="group w-[120px] md:w-auto hidden sm:block">
            <div className="flex justify-between items-end mb-1">
              <span className="text-[10px] md:text-[12px] font-bold tracking-[0.1em] md:tracking-[0.2em] text-[#00f0ff] uppercase">Focus (Shift)</span>
              <span className="text-[10px] md:text-sm font-bold text-white/80">{bulletTimeMeter >= 100 ? 'READY' : `${Math.floor(bulletTimeMeter)}%`}</span>
            </div>
            <div className="w-full md:w-48 h-2 md:h-3 bg-white/10 border border-white/20 relative">
              <div 
                  className="absolute inset-y-0 left-0 bg-gradient-to-r from-cyan-600 to-cyan-400 shadow-[0_0_15px_rgba(0,240,255,0.6)] transition-all duration-100" 
                  style={{ width: `${bulletTimeMeter}%` }}
              ></div>
            </div>
          </div>
        </div>
        
        {/* Center: THREAT LEVEL */}
        <div className="absolute left-1/2 -translate-x-1/2 top-2 md:top-auto flex flex-col items-center z-0">
             <div className="text-[12px] md:text-[16px] font-black tracking-[0.1em] md:tracking-[0.3em] text-[#ff4e00] uppercase pt-2 drop-shadow-[0_0_8px_rgba(255,78,0,0.8)] whitespace-nowrap">
                 Threat <span className="hidden sm:inline">Level</span> {difficultyLevel.toFixed(1)}x
             </div>
             {activePowerup.type && (
               <div className="text-[9px] md:text-xs font-bold text-yellow-400 animate-pulse mt-1 bg-black/50 px-2 md:px-3 py-0.5 md:py-1 rounded-full border border-yellow-500/30 whitespace-nowrap">
                 {activePowerup.type} - {Math.ceil(activePowerup.timeLeft)}s
               </div>
             )}
        </div>

        {/* Right Side: DISTANCE */}
        <div className="flex flex-col items-end w-auto md:w-1/3 z-10">
          <div className="text-[10px] md:text-[12px] font-bold tracking-[0.1em] md:tracking-[0.3em] text-white/70 uppercase">Distance</div>
          <div className="flex items-baseline gap-1 drop-shadow-[0_0_10px_rgba(255,255,255,0.3)]">
            <span className="text-xl md:text-4xl font-black italic tracking-tighter text-white font-mono leading-none">
              {Math.floor(score).toLocaleString()}
            </span>
            <span className="text-lg md:text-2xl font-black italic text-[#ff4e00] leading-none">M</span>
          </div>
          {combo > 1 && <div className="text-[9px] md:text-xs font-bold tracking-[0.1em] md:tracking-[0.2em] text-[#00f0ff] uppercase mt-1 animate-pulse border border-cyan-500/50 bg-cyan-900/40 px-1 md:px-2 py-0.5 whitespace-nowrap">x{combo} Combo</div>}
        </div>
      </nav>

      {/* Visual Overlay for Bullet Time */}
      {isBulletTime && (
        <div className="fixed inset-0 pointer-events-none z-10 transition-all duration-300 overflow-hidden">
           <div className="absolute inset-0 bg-cyan-500/10 mix-blend-overlay animate-pulse" />
           <div className="absolute inset-0 backdrop-blur-[2px] backdrop-saturate-150" style={{ 
               boxShadow: 'inset 0 0 100px rgba(0, 255, 255, 0.2), inset 0 0 150px rgba(255, 0, 50, 0.2)' 
           }} />
           <div className="absolute inset-0 border-[4px] border-cyan-500/20 mix-blend-screen" />
           <div className="bullet-time-scanline" />
        </div>
      )}

      {/* Combat UI Overlays (Ghosting) */}
      <div className="absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-cyan-900/20 to-transparent pointer-events-none border-l-2 border-cyan-500/30"></div>
      <div className="absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-orange-900/20 to-transparent pointer-events-none border-r-2 border-orange-500/30"></div>

      {/* Mobile Controls Hint */}
      <div className="text-center text-white/50 text-sm mb-4 hidden sm:block">
        ARROWS: Move • SPACE: Fire • SHIFT: Focus (Slow-Mo)
      </div>
    </div>
    </>
  );
};

const MainMenu = () => {
  const { setGameState, persistent } = useGameStore();
  
  const handlePlay = () => {
    audioManager.resume(); // Ensure AudioContext is alive
    setGameState('PLAYING');
    if (gameEngine) gameEngine.start();
  };

  return (
    <div className="absolute inset-0 bg-black/80 flex flex-col pointer-events-auto z-20" style={{ fontFamily: 'Orbitron, sans-serif' }}>
      <main className="flex-1 flex flex-col justify-center items-center relative">
        {/* Title Design */}
        <div className="relative mb-12 text-center flex flex-col items-center">
          <div className="absolute -inset-4 bg-orange-600 blur-[80px] opacity-20"></div>
          <h1 className="text-[60px] sm:text-[100px] md:text-[140px] font-black leading-[0.8] tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-white via-white to-gray-500 uppercase select-none italic text-center">
            TRAIN<br/>ASSAULT
          </h1>
          <div className="absolute -top-6 -left-6 border-l-4 border-t-4 border-orange-500 w-12 h-12"></div>
          <div className="absolute -bottom-6 -right-6 border-r-4 border-b-4 border-cyan-500 w-12 h-12"></div>
          <div className="mt-4 flex items-center justify-center gap-4">
            <div className="h-[1px] w-24 bg-gray-800"></div>
            <span className="text-xs font-bold tracking-[0.5em] text-orange-500 uppercase text-center w-full whitespace-nowrap">Steel & Lead Underworld</span>
            <div className="h-[1px] w-24 bg-gray-800"></div>
          </div>
        </div>

        {/* Menu Navigation */}
        <div className="flex gap-3 md:gap-4 flex-wrap justify-center px-4">
          <button onClick={handlePlay} className="px-8 md:px-12 py-4 md:py-5 bg-white text-black font-black text-lg md:text-xl hover:bg-orange-500 hover:text-white transition-colors uppercase skew-x-[-12deg] flex items-center group">
            <span className="skew-x-[12deg] tracking-widest flex items-center gap-2"><Play fill="currentColor" className="w-5 h-5 md:w-6 md:h-6" /> Start Mission</span>
          </button>
          <button onClick={() => setGameState('MISSIONS')} className="px-8 md:px-12 py-4 md:py-5 bg-transparent border-2 border-white/20 text-white font-black text-lg md:text-xl hover:border-cyan-400 transition-colors uppercase skew-x-[-12deg] flex items-center">
            <span className="skew-x-[12deg] tracking-widest flex items-center gap-2"><Target className="w-5 h-5 md:w-6 md:h-6" /> Armory</span>
          </button>
          <button onClick={() => setGameState('SHOP')} className="px-6 md:px-8 py-4 md:py-5 bg-gray-900 border border-gray-800 text-white font-black text-lg md:text-xl hover:bg-gray-800 transition-colors uppercase skew-x-[-12deg] flex items-center">
            <span className="skew-x-[12deg] flex items-center gap-2"><ShoppingCart className="w-5 h-5 md:w-6 md:h-6" /> Store</span>
          </button>
          <button onClick={() => setGameState('SETTINGS')} className="px-6 md:px-8 py-4 md:py-5 bg-gray-900 border border-gray-800 text-white font-black text-lg md:text-xl hover:bg-gray-800 transition-colors uppercase skew-x-[-12deg] flex items-center">
            <span className="skew-x-[12deg] flex items-center gap-2">Settings</span>
          </button>
        </div>
      </main>

      {/* Bottom Interface Bar */}
      <footer className="h-24 sm:h-32 flex items-center justify-between px-6 sm:px-10 border-t border-white/5 bg-black/40 backdrop-blur-md">
        <div className="flex gap-6 sm:gap-10">
          <div className="flex flex-col">
            <span className="text-[9px] sm:text-[10px] font-bold tracking-widest text-gray-500 uppercase">Credits</span>
            <span className="text-xl sm:text-2xl font-mono font-bold text-white tracking-tight">{persistent.coins.toLocaleString()} <span className="text-[10px] sm:text-xs text-orange-500">$</span></span>
          </div>
          <div className="flex flex-col">
            <span className="text-[9px] sm:text-[10px] font-bold tracking-widest text-gray-500 uppercase">High Score</span>
            <span className="text-xl sm:text-2xl font-mono font-bold text-white tracking-tight">{persistent.highScore.toLocaleString()} <span className="text-[10px] sm:text-xs text-cyan-400">M</span></span>
          </div>
        </div>

        <div className="text-center text-slate-500 text-xs hidden sm:block">
           CONTROLS: A/D/Arrows to dodge | W/Space to jump | Click to shoot | Shift for Slow-Mo
        </div>
      </footer>

      {/* Peripheral Elements */}
      <div className="absolute bottom-36 right-8 text-right opacity-30 select-none pointer-events-none">
        <div className="text-[10px] font-bold uppercase tracking-[0.5em] leading-none mb-1 text-white">System_Status</div>
        <div className="text-[8px] font-mono leading-none text-cyan-400">TRN_ASSAULT_VER_0.4.2_STABLE</div>
      </div>
    </div>
  );
};

const GameOverScreen = () => {
  const { setGameState, persistent, score } = useGameStore();
  const [adTimer, setAdTimer] = useState(0);
  
  const handleRevive = () => {
    // Simulate AD
    setAdTimer(15);
    const interval = setInterval(() => {
      setAdTimer(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          useGameStore.getState().setGameplayState({ hp: 50 }); // Revive 50% HP
          setGameState('PLAYING');
          if (gameEngine) gameEngine.resume();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };
  
  if (adTimer > 0) {
      return (
          <div className="absolute inset-0 bg-black flex flex-col items-center justify-center text-white pointer-events-auto z-50" style={{ fontFamily: 'Rajdhani, sans-serif' }}>
              <h2 className="text-3xl font-bold tracking-widest text-gray-500 uppercase mb-4">Watching Sponsored Video...</h2>
              <div className="text-8xl font-black text-orange-500 font-mono mb-8">{adTimer}</div>
              <p className="text-slate-400 font-bold tracking-widest uppercase">Please wait to revive.</p>
          </div>
      );
  }

  return (
    <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center pointer-events-auto z-50 backdrop-blur-sm" style={{ fontFamily: 'Orbitron, sans-serif' }}>
      <div className="relative mb-12">
        <div className="absolute -inset-4 bg-red-600 blur-[60px] opacity-20"></div>
        <motion.h1 
          initial={{ scale: 2.5, opacity: 0 }}
          animate={{ 
            scale: [2.5, 0.9, 1.1, 1], 
            opacity: 1,
            x: [0, -15, 15, -10, 10, -5, 5, 0]
          }}
          transition={{ 
            duration: 0.7,
            delay: 0.4,
            times: [0, 0.2, 0.4, 0.5, 0.6, 0.7, 0.8, 1],
            ease: "easeOut"
          }}
          className="text-[140px] font-black leading-[0.8] tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-red-500 via-red-600 to-red-900 uppercase select-none italic text-center drop-shadow-[0_0_20px_rgba(255,0,0,0.5)]">
          WASTED
        </motion.h1>
      </div>
      
      <div className="flex gap-12 mb-16">
        <div className="flex flex-col items-center">
            <span className="text-[12px] font-bold tracking-[0.5em] text-gray-500 uppercase mb-1">Score</span>
            <span className="text-5xl font-mono font-black text-white tracking-tight">{Math.floor(score).toLocaleString()}</span>
        </div>
        <div className="flex flex-col items-center">
            <span className="text-[12px] font-bold tracking-[0.5em] text-gray-500 uppercase mb-1">High Score</span>
            <span className="text-5xl font-mono font-black text-gray-400 tracking-tight">{persistent.highScore.toLocaleString()}</span>
        </div>
      </div>
      
      <div className="flex gap-6">
        <button onClick={handleRevive} className="px-10 py-5 bg-red-600 text-white font-black text-xl hover:bg-red-500 transition-colors uppercase skew-x-[-12deg] flex items-center group">
           <span className="skew-x-[12deg] tracking-widest flex items-center gap-2"><Play fill="currentColor" className="w-5 h-5"/> Watch Ad to Revive</span>
        </button>
        <button onClick={() => {
            setGameState('MENU');
            useGameStore.getState().addCoins(Math.floor(score / 100)); // basic reward
        }} className="px-10 py-5 bg-transparent border-2 border-white/20 text-white font-black text-xl hover:border-gray-400 transition-colors uppercase skew-x-[-12deg] flex items-center">
           <span className="skew-x-[12deg] tracking-widest flex items-center gap-2"><Repeat className="w-5 h-5"/> End Run</span>
        </button>
      </div>
    </div>
  );
};

const SettingsMenu = () => {
    const { setGameState, persistent, updateSettings } = useGameStore();

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const { name, value } = e.target;
      updateSettings({ [name]: parseInt(value, 10) });
      
      // We immediately update AudioManager so changes are heard instantly
      if (typeof audioManager !== 'undefined') {
          if (audioManager.updateVolumes) {
              audioManager.updateVolumes();
          }
      }
    };

    return (
        <div className="absolute inset-0 bg-[#0a0a0b] pointer-events-auto flex flex-col p-10 text-white z-40" style={{ fontFamily: 'Orbitron, sans-serif' }}>
            <div className="flex justify-between items-center mb-12 border-b border-white/10 pb-6">
                <div>
                   <h1 className="text-5xl font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-white to-gray-500 uppercase">
                     SYSTEM SETTINGS
                   </h1>
                </div>
                <button onClick={() => setGameState('MENU')} className="px-6 py-3 bg-white/10 text-white font-bold hover:bg-white/20 transition-colors uppercase skew-x-[-12deg]">
                    <span className="skew-x-[12deg] block">Return To Menu</span>
                </button>
            </div>
            
            <div className="flex flex-col gap-12 max-w-2xl mx-auto w-full overflow-y-auto pr-4 pb-20">
                <div className="flex flex-col gap-4">
                   <div className="flex justify-between items-center">
                     <span className="text-xl font-bold tracking-widest uppercase">Theme Environment</span>
                   </div>
                   <div className="flex gap-4">
                     {['CYBER', 'INFERNO', 'TOXIC'].map(theme => (
                         <button 
                           key={theme}
                           onClick={() => updateSettings({ theme: theme as 'CYBER'|'INFERNO'|'TOXIC' })}
                           className={`flex-1 py-3 border-2 font-bold uppercase tracking-widest skew-x-[-12deg] transition-colors ${persistent.settings?.theme === theme ? 'bg-white text-black border-white' : 'border-white/20 text-white/70 hover:border-white/50'}`}
                         >
                            <span className="skew-x-[12deg] block">{theme}</span>
                         </button>
                     ))}
                   </div>
                </div>

                <div className="flex flex-col gap-4">
                   <div className="flex justify-between items-center">
                     <span className="text-xl font-bold tracking-widest uppercase">Post-Processing (Bloom & Effects)</span>
                     <button 
                        onClick={() => updateSettings({ postProcessing: !persistent.settings?.postProcessing })}
                        className={`px-6 py-2 border-2 font-bold uppercase tracking-widest skew-x-[-12deg] transition-colors ${persistent.settings?.postProcessing !== false ? 'bg-green-500 border-green-500 text-black' : 'border-red-500 text-red-500 hover:bg-red-500/20'}`}
                     >
                       <span className="skew-x-[12deg] block">{persistent.settings?.postProcessing !== false ? 'ON' : 'OFF'}</span>
                     </button>
                   </div>
                   <p className="text-sm text-gray-400">Toggle Bloom and Chromatic Aberration. Disable for higher performance and cleaner look.</p>
                </div>

                <div className="flex flex-col gap-4">
                   <div className="flex justify-between items-center">
                     <span className="text-xl font-bold tracking-widest uppercase">Master Volume</span>
                     <span className="font-mono text-gray-400">{persistent.settings?.masterVolume ?? 50}%</span>
                   </div>
                   <input type="range" name="masterVolume" min="0" max="100" value={persistent.settings?.masterVolume ?? 50} onChange={handleChange} className="w-full accent-cyan-400 cursor-pointer" />
                </div>

                <div className="flex flex-col gap-4">
                   <div className="flex justify-between items-center">
                     <span className="text-xl font-bold tracking-widest text-[#ff4e00] uppercase">SFX Volume</span>
                     <span className="font-mono text-gray-400">{persistent.settings?.sfxVolume ?? 50}%</span>
                   </div>
                   <input type="range" name="sfxVolume" min="0" max="100" value={persistent.settings?.sfxVolume ?? 50} onChange={handleChange} className="w-full accent-[#ff4e00] cursor-pointer" />
                </div>

                <div className="flex flex-col gap-4">
                   <div className="flex justify-between items-center">
                     <span className="text-xl font-bold tracking-widest text-emerald-400 uppercase">Music Volume</span>
                     <span className="font-mono text-gray-400">{persistent.settings?.musicVolume ?? 50}%</span>
                   </div>
                   <input type="range" name="musicVolume" min="0" max="100" value={persistent.settings?.musicVolume ?? 50} onChange={handleChange} className="w-full accent-emerald-400 cursor-pointer" />
                </div>
            </div>
        </div>
    );
};

const Shop = () => {
    const { setGameState, persistent, buyItem, equipItem } = useGameStore();
    
    const weapons = [
      { id: 'PISTOL', name: 'Standard Issue', desc: 'Reliable. Average fire rate.', cost: 0, color: 'from-gray-400 to-gray-600' },
      { id: 'SHOTGUN', name: 'The Breacher', desc: 'Fires 3 spread shots. Slow.', cost: 1000, color: 'from-orange-500 to-red-600' },
      { id: 'RIFLE', name: 'Auto-Rifle', desc: 'High speed rapid fire.', cost: 2500, color: 'from-cyan-400 to-blue-600' },
    ];

    return (
        <div className="absolute inset-0 bg-[#0a0a0b] pointer-events-auto flex flex-col p-10 text-white z-40" style={{ fontFamily: 'Orbitron, sans-serif' }}>
            <div className="flex justify-between items-center mb-12 border-b border-white/10 pb-6">
                <div className="relative">
                   <h1 className="text-5xl font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-white to-gray-500 uppercase">
                     ARSENAL STORE
                   </h1>
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-[10px] font-bold tracking-[0.3em] text-gray-500 uppercase">Credits</span>
                  <span className="text-3xl font-mono font-bold text-white tracking-tight">{persistent.coins.toLocaleString()} <span className="text-xs text-orange-500">$</span></span>
                </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 flex-1 overflow-y-auto pr-4">
                {weapons.map(w => {
                  const isOwned = persistent.ownedWeapons.includes(w.id as any);
                  const isEquipped = persistent.equippedWeapon === w.id;
                  
                  return (
                    <div key={w.id} className={`bg-white/5 border ${isEquipped ? 'border-cyan-500 bg-cyan-900/20' : 'border-white/10'} p-6 flex flex-col items-center text-center relative group hover:border-gray-400/50 transition-colors`}>
                        <div className={`absolute top-0 right-0 w-8 h-8 border-t border-r ${isEquipped ? 'border-cyan-500 opacity-100' : 'border-gray-400 opacity-0 group-hover:opacity-100'} transition-opacity`}></div>
                        <div className={`w-32 h-32 bg-gradient-to-br ${w.color} rounded-full mb-6 shadow-[0_0_30px_rgba(255,255,255,0.1)] flex items-center justify-center text-4xl`}>
                           🔫
                        </div>
                        <h3 className="text-2xl font-black uppercase tracking-widest mb-2 italic">{w.name}</h3>
                        <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-6 min-h-[40px]">{w.desc}</p>
                        
                        {isOwned ? (
                          <button 
                            onClick={() => equipItem('weapon', w.id)}
                            className={`mt-auto px-8 py-3 font-black uppercase skew-x-[-12deg] transition-colors w-full ${isEquipped ? 'bg-cyan-500 text-black' : 'bg-white text-black hover:bg-gray-300'}`}
                          >
                             <span className="skew-x-[12deg] tracking-widest">{isEquipped ? 'EQUIPPED' : 'EQUIP'}</span>
                          </button>
                        ) : (
                          <button 
                            onClick={() => buyItem('weapon', w.id, w.cost)}
                            className={`mt-auto px-8 py-3 bg-transparent border-2 border-white/20 text-white font-black uppercase skew-x-[-12deg] transition-colors w-full ${persistent.coins >= w.cost ? 'hover:bg-orange-500 hover:border-orange-500 hover:text-white' : 'opacity-50 cursor-not-allowed'}`}
                          >
                             <span className="skew-x-[12deg] tracking-widest">BUY / {w.cost.toLocaleString()}$</span>
                          </button>
                        )}
                    </div>
                  )
                })}
            </div>
            
            <div className="mt-8 flex justify-center border-t border-white/10 pt-8">
                <button onClick={() => setGameState('MENU')} className="px-12 py-4 bg-transparent border-2 border-white/20 text-white font-black text-xl hover:border-cyan-400 transition-colors uppercase skew-x-[-12deg] flex items-center">
                  <span className="skew-x-[12deg] tracking-widest">Back to Hub</span>
                </button>
            </div>
        </div>
    );
};

const Missions = () => {
    const { setGameState } = useGameStore();
    return (
        <div className="absolute inset-0 bg-[#0a0a0b] pointer-events-auto flex flex-col p-10 text-white z-40" style={{ fontFamily: 'Orbitron, sans-serif' }}>
            <div className="flex justify-between items-center mb-12 border-b border-white/10 pb-6">
                <div className="relative">
                   <h1 className="text-5xl font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-white to-gray-500 uppercase">
                     CAMPAIGN OPS
                   </h1>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto pr-4 flex flex-col gap-4">
               {/* Mission Chapters could be mapped here */}
               <div className="bg-white/5 border border-white/10 p-6 relative group hover:border-cyan-400/50 transition-colors flex justify-between items-center opacity-70">
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-cyan-400"></div>
                    <div>
                      <h2 className="text-2xl font-black uppercase tracking-widest mb-1 italic text-white group-hover:text-cyan-400 transition-colors">Chapter 1: The Freight yard</h2>
                      <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Complete endless mode to unlock narrative campaign.</p>
                    </div>
                    <div className="text-right">
                       <span className="text-[10px] font-bold tracking-[0.2em] text-[#00f0ff] uppercase bg-cyan-900/40 px-3 py-1 border border-cyan-500/30">LOCKED</span>
                    </div>
               </div>
            </div>

            <div className="mt-8 flex justify-center border-t border-white/10 pt-8">
                <button onClick={() => setGameState('MENU')} className="px-12 py-4 bg-transparent border-2 border-white/20 text-white font-black text-xl hover:border-cyan-400 transition-colors uppercase skew-x-[-12deg] flex items-center">
                  <span className="skew-x-[12deg] tracking-widest">Back to Hub</span>
                </button>
            </div>
        </div>
    );
};

// --- App Root ---

const MobileControls = () => {
  const [touchStart, setTouchStart] = useState<{ x: number, y: number, time: number } | null>(null);
  const [isSwiping, setIsSwiping] = useState(false);
  const bulletTimeMeter = useGameStore(state => state.bulletTimeMeter);

  const handleAction = (action: string, isDown: boolean) => {
    if (!gameEngine) return;
    if (action === 'slowmo') {
      gameEngine.keys['ShiftLeft'] = isDown;
    }
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!gameEngine) return;
    setTouchStart({ x: e.clientX, y: e.clientY, time: Date.now() });
    setIsSwiping(false);
    
    // Tap to shoot
    gameEngine.isShooting = true;
    gameEngine.attemptShoot();
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!touchStart || !gameEngine) return;

    const dx = e.clientX - touchStart.x;
    const dy = e.clientY - touchStart.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance > 30 && !isSwiping) {
      setIsSwiping(true);
      gameEngine.isShooting = false; // Cancel shooting if it's a swipe
      
      if (Math.abs(dx) > Math.abs(dy)) {
        // Horizontal swipe
        if (dx > 0) {
          gameEngine.switchLane(1);
        } else {
          gameEngine.switchLane(-1);
        }
      } else {
        // Vertical swipe
        if (dy < 0) {
          gameEngine.jump();
        }
      }
      
      // Reset to prevent repeated swipes continuously
      setTouchStart({ x: e.clientX, y: e.clientY, time: Date.now() });
    }
  };

  const handlePointerUp = () => {
    if (gameEngine) {
      gameEngine.isShooting = false;
    }
    setTouchStart(null);
    setIsSwiping(false);
  };

  return (
    <>
      <div 
        className="absolute inset-x-0 bottom-0 top-24 pointer-events-auto z-20 sm:hidden touch-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      />
      <div className="absolute inset-x-0 bottom-8 md:bottom-12 px-4 flex justify-between items-end pointer-events-none z-30 sm:hidden select-none touch-none">
        {/* Left Side: Empty space, or maybe some visual cues */}
        <div className="flex gap-1 items-end opacity-50">
          <div className="text-white/50 text-[10px] uppercase font-bold tracking-widest pl-2">
            Swipe to Move<br/>Tap to Shoot
          </div>
        </div>

        {/* Focus Button */}
        <div className="flex gap-2 items-end pointer-events-auto relative mt-auto">
          <svg className="absolute -inset-1 w-[72px] h-[72px] -rotate-90 pointer-events-none" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="48" fill="none" stroke="rgba(0,255,255,0.2)" strokeWidth="4" />
            <circle cx="50" cy="50" r="48" fill="none" stroke="rgba(0,255,255,1)" strokeWidth="4" strokeDasharray={301.6} strokeDashoffset={301.6 - (301.6 * Math.max(0, bulletTimeMeter)) / 100} className="transition-all duration-100" />
          </svg>
          <button 
            onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); handleAction('slowmo', true); }}
            onPointerUp={(e) => { e.preventDefault(); e.stopPropagation(); handleAction('slowmo', false); }}
            onPointerLeave={(e) => { e.preventDefault(); handleAction('slowmo', false); }}
            disabled={bulletTimeMeter <= 0}
            className="w-16 h-16 bg-cyan-600/30 border border-cyan-400/60 rounded-full flex flex-col items-center justify-center text-cyan-300 backdrop-blur-md active:bg-cyan-500/60 shadow-[0_0_15px_rgba(0,255,255,0.3)] transition-all disabled:opacity-50 disabled:grayscale"
          >
            <span className="text-2xl leading-none">⏱</span>
            <span className="text-[10px] font-bold tracking-wider uppercase mt-1 text-white">{Math.floor(bulletTimeMeter)}%</span>
          </button>
        </div>
      </div>
    </>
  );
};

export default function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameState = useGameStore(state => state.gameState);

  useEffect(() => {
    if (containerRef.current && !gameEngine) {
      gameEngine = new GameEngine(containerRef.current);
    }
    
    // Add Google Fonts
    const link = document.createElement('link');
    link.href = 'https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Rajdhani:wght@500;700&display=swap';
    link.rel = 'stylesheet';
    document.head.appendChild(link);
    
    return () => {
        if (gameEngine) {
            gameEngine.destroy();
            gameEngine = null;
        }
    };
  }, []);

  return (
    <div className="relative w-full h-screen bg-[#0a0a0b] text-[#e2e2e2] font-sans overflow-hidden flex flex-col items-stretch select-none touch-none">
      {/* Background 3D Lane Perspective Simulation (visible in Menu) */}
      <div className="absolute inset-0 z-0 opacity-20 pointer-events-none">
        <div className="absolute inset-0 flex justify-center" style={{ perspective: '800px' }}>
          <div className="w-[2000px] h-[2000px] bg-gradient-to-t from-orange-500/20 to-transparent" 
               style={{ transform: 'rotateX(75deg) translateY(-200px)', backgroundImage: 'repeating-linear-gradient(0deg, #1a1a1a, #1a1a1a 2px, transparent 2px, transparent 100px), repeating-linear-gradient(90deg, #1a1a1a, #1a1a1a 2px, transparent 2px, transparent 333px)' }}>
          </div>
        </div>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,transparent_0%,rgba(0,0,0,0.8)_100%)]"></div>
      </div>

      {/* ThreeJS Canvas Container */}
      <div ref={containerRef} className="absolute inset-0 pointer-events-auto z-10" />
      
      {/* UI Layer */}
      {gameState === 'MENU' && <MainMenu />}
      {gameState === 'PLAYING' && (
        <>
          <HUD />
          <MobileControls />
        </>
      )}
      {gameState === 'GAME_OVER' && <GameOverScreen />}
      {gameState === 'SHOP' && <Shop />}
      {gameState === 'MISSIONS' && <Missions />}
      {gameState === 'SETTINGS' && <SettingsMenu />}
      
    </div>
  );
}

