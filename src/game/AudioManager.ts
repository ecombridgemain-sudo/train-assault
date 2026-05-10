import { useGameStore } from '../store/useGameStore';

class ProceduralAudio {
  ctx: AudioContext;
  masterGain: GainNode;
  sfxGain: GainNode;
  musicGain: GainNode;

  constructor() {
    this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    this.masterGain = this.ctx.createGain();
    this.sfxGain = this.ctx.createGain();
    this.musicGain = this.ctx.createGain();
    
    this.sfxGain.connect(this.masterGain);
    this.musicGain.connect(this.masterGain);
    this.masterGain.connect(this.ctx.destination);
    
    this.updateVolumes();
  }
  
  updateVolumes() {
    try {
      const { settings } = useGameStore.getState().persistent;
      this.masterGain.gain.value = settings.masterVolume / 100;
      this.sfxGain.gain.value = settings.sfxVolume / 100;
      this.musicGain.gain.value = settings.musicVolume / 100;
    } catch {
      this.masterGain.gain.value = 0.5;
    }
  }

  resume() {
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    this.updateVolumes();
  }

  setMasterVolume(val: number) {
    this.masterGain.gain.value = val;
  }

  playShoot() {
    this.resume();
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    // Noise burst
    const bufferSize = this.ctx.sampleRate * 0.1; // 100ms
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    
    const noiseFilter = this.ctx.createBiquadFilter();
    noiseFilter.type = 'highpass';
    noiseFilter.frequency.value = 1000;
    
    // Oscillator snap
    osc.type = 'square';
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.1);
    
    gain.gain.setValueAtTime(1, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.1);
    
    osc.connect(gain);
    noise.connect(noiseFilter);
    noiseFilter.connect(gain);
    gain.connect(this.sfxGain);
    
    osc.start(t);
    noise.start(t);
    osc.stop(t + 0.1);
  }

  playHit() {
    this.resume();
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(400, t);
    osc.frequency.exponentialRampToValueAtTime(100, t + 0.1);
    
    gain.gain.setValueAtTime(0.5, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.1);
    
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + 0.1);
  }

  playJump() {
    this.resume();
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(300, t);
    osc.frequency.linearRampToValueAtTime(600, t + 0.15);
    
    gain.gain.setValueAtTime(0.3, t);
    gain.gain.linearRampToValueAtTime(0, t + 0.15);
    
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + 0.15);
  }

  playExplosion() {
    this.resume();
    const t = this.ctx.currentTime;
    
    const bufferSize = this.ctx.sampleRate * 0.5; // 500ms
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1000, t);
    filter.frequency.exponentialRampToValueAtTime(100, t + 0.5);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(1, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.5);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);

    noise.start(t);
  }

  playCoin() {
    this.resume();
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1200, t);
    osc.frequency.setValueAtTime(1600, t + 0.05);
    
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.3, t + 0.02);
    gain.gain.linearRampToValueAtTime(0, t + 0.15);
    
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + 0.15);
  }

  playHealthPickup() {
    this.resume();
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(400, t);
    osc.frequency.linearRampToValueAtTime(800, t + 0.1);
    osc.frequency.linearRampToValueAtTime(1200, t + 0.2);
    
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.4, t + 0.05);
    gain.gain.linearRampToValueAtTime(0, t + 0.3);
    
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + 0.3);
  }

  playShieldPickup() {
    this.resume();
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'square';
    osc.frequency.setValueAtTime(200, t);
    osc.frequency.linearRampToValueAtTime(250, t + 0.1);
    osc.frequency.linearRampToValueAtTime(200, t + 0.2);
    
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.3, t + 0.05);
    gain.gain.linearRampToValueAtTime(0, t + 0.4);
    
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + 0.4);
  }

  playRapidFirePickup() {
    this.resume();
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(800, t);
    osc.frequency.exponentialRampToValueAtTime(1600, t + 0.1);
    
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.3, t + 0.02);
    gain.gain.linearRampToValueAtTime(0, t + 0.15);
    
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + 0.15);
  }

  playPowerupWarning() {
    this.resume();
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, t);
    osc.frequency.setValueAtTime(600, t + 0.05);
    
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.2, t + 0.05);
    gain.gain.linearRampToValueAtTime(0, t + 0.15);
    
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + 0.15);
  }
}

export const audioManager = new ProceduralAudio();
