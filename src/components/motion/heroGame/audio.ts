import musicTrack8BitUrl from '../../../assets/audio/dj-artmusic-8-bit.mp3?url';
import musicTrackFunUrl from '../../../assets/audio/dj-artmusic-fun.mp3?url';
import musicTrackHeroUrl from '../../../assets/audio/dj-artmusic-hero.mp3?url';

const MUTED_KEY = 'heroGameAudioMuted';
const VOLUME_KEY = 'heroGameAudioVolume';
const MUSIC_MUTED_KEY = 'heroGameMusicMuted';
const MUSIC_TRACK_INDEX_KEY = 'heroGameMusicTrackIndex';

/** CLAUDE.md a11y rule: audio starts muted until the player opts in. */
const DEFAULT_MUTED = true;
const DEFAULT_VOLUME = 0.6;
const DEFAULT_MUSIC_MUTED = false;
/** Background music sits well under SFX/master level so it stays "background". */
const MUSIC_VOLUME_SCALE = 0.45;
const MUSIC_TRACK_URLS = [
  musicTrackFunUrl,
  musicTrack8BitUrl,
  musicTrackHeroUrl,
] as const;

export type SfxName =
  | 'jump'
  | 'doubleJump'
  | 'slam'
  | 'hopUp'
  | 'hopDown'
  | 'hit'
  | 'hitHeavy'
  | 'pickup'
  | 'billboardTalk'
  | 'billboardGlitch'
  | 'respawn';

type Listener = () => void;

function readStoredMuted(): boolean {
  if (typeof window === 'undefined') return DEFAULT_MUTED;
  const raw = window.localStorage.getItem(MUTED_KEY);
  return raw === null ? DEFAULT_MUTED : raw === 'true';
}

function readStoredVolume(): number {
  if (typeof window === 'undefined') return DEFAULT_VOLUME;
  const raw = window.localStorage.getItem(VOLUME_KEY);
  if (raw === null) return DEFAULT_VOLUME;
  const parsed = Number(raw);
  return Number.isFinite(parsed)
    ? Math.min(1, Math.max(0, parsed))
    : DEFAULT_VOLUME;
}

function readStoredMusicMuted(): boolean {
  if (typeof window === 'undefined') return DEFAULT_MUSIC_MUTED;
  const raw = window.localStorage.getItem(MUSIC_MUTED_KEY);
  return raw === null ? DEFAULT_MUSIC_MUTED : raw === 'true';
}

function readStoredMusicTrackIndex(): number {
  if (typeof window === 'undefined') return 0;
  const raw = window.localStorage.getItem(MUSIC_TRACK_INDEX_KEY);
  if (raw === null) return 0;
  const parsed = Number(raw);
  return Number.isInteger(parsed) &&
    parsed >= 0 &&
    parsed < MUSIC_TRACK_URLS.length
    ? parsed
    : 0;
}

function getAudioContextConstructor(): typeof AudioContext | undefined {
  const w = window as unknown as {
    AudioContext?: typeof AudioContext;
    webkitAudioContext?: typeof AudioContext;
  };
  return w.AudioContext ?? w.webkitAudioContext;
}

interface ToneOptions {
  type: OscillatorType;
  /** Starting frequency in Hz. */
  startFreq: number;
  /** Optional ending frequency — omit for a flat tone. */
  endFreq?: number;
  /** Total duration in seconds. */
  duration: number;
  /** Peak gain (0–1). */
  peak: number;
  /** Delay before the tone starts, in seconds — used to chain notes. */
  delay?: number;
}

/** Short oscillator blip with a quick attack and exponential decay — the basic "8-bit beep". */
function playTone(ctx: AudioContext, options: ToneOptions) {
  const { type, startFreq, endFreq, duration, peak, delay = 0 } = options;
  if (peak <= 0) return;

  const now = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const gainNode = ctx.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(startFreq, now);
  if (endFreq !== undefined && endFreq !== startFreq) {
    osc.frequency.exponentialRampToValueAtTime(
      Math.max(1, endFreq),
      now + duration,
    );
  }

  gainNode.gain.setValueAtTime(0.0001, now);
  gainNode.gain.exponentialRampToValueAtTime(
    peak,
    now + Math.min(0.015, duration * 0.3),
  );
  gainNode.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  osc.connect(gainNode).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + duration + 0.02);
}

interface NoiseOptions {
  /** Total duration in seconds. */
  duration: number;
  /** Peak gain (0–1). */
  peak: number;
  /** Biquad filter cutoff/center frequency in Hz. */
  filterFreq: number;
  filterType?: BiquadFilterType;
  /** Delay before the noise starts, in seconds. */
  delay?: number;
}

/** Short filtered white-noise burst — used for impact/crash textures. */
function playNoise(ctx: AudioContext, options: NoiseOptions) {
  const {
    duration,
    peak,
    filterFreq,
    filterType = 'lowpass',
    delay = 0,
  } = options;
  if (peak <= 0) return;

  const now = ctx.currentTime + delay;
  const sampleCount = Math.max(1, Math.floor(ctx.sampleRate * duration));
  const buffer = ctx.createBuffer(1, sampleCount, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < sampleCount; i++) data[i] = Math.random() * 2 - 1;

  const source = ctx.createBufferSource();
  source.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = filterType;
  filter.frequency.value = filterFreq;

  const gainNode = ctx.createGain();
  gainNode.gain.setValueAtTime(peak, now);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  source.connect(filter).connect(gainNode).connect(ctx.destination);
  source.start(now);
  source.stop(now + duration + 0.02);
}

/**
 * One synth "patch" per game event. Kept short, soft, and varied in pitch so
 * they read as classic 8-bit feedback without becoming grating on repeat.
 */
const SFX_BUILDERS: Record<
  SfxName,
  (ctx: AudioContext, volume: number) => void
> = {
  jump: (ctx, volume) => {
    playTone(ctx, {
      type: 'square',
      startFreq: 280,
      endFreq: 560,
      duration: 0.11,
      peak: 0.22 * volume,
    });
  },
  doubleJump: (ctx, volume) => {
    playTone(ctx, {
      type: 'square',
      startFreq: 360,
      endFreq: 620,
      duration: 0.08,
      peak: 0.18 * volume,
    });
    playTone(ctx, {
      type: 'square',
      startFreq: 520,
      endFreq: 880,
      duration: 0.12,
      peak: 0.22 * volume,
      delay: 0.06,
    });
  },
  slam: (ctx, volume) => {
    playTone(ctx, {
      type: 'sawtooth',
      startFreq: 320,
      endFreq: 60,
      duration: 0.22,
      peak: 0.32 * volume,
    });
    playNoise(ctx, {
      duration: 0.12,
      peak: 0.22 * volume,
      filterFreq: 220,
      filterType: 'lowpass',
    });
  },
  hopUp: (ctx, volume) => {
    playTone(ctx, {
      type: 'square',
      startFreq: 260,
      endFreq: 420,
      duration: 0.07,
      peak: 0.16 * volume,
    });
  },
  hopDown: (ctx, volume) => {
    playTone(ctx, {
      type: 'square',
      startFreq: 260,
      endFreq: 160,
      duration: 0.08,
      peak: 0.16 * volume,
    });
  },
  hit: (ctx, volume) => {
    playNoise(ctx, {
      duration: 0.07,
      peak: 0.18 * volume,
      filterFreq: 1400,
      filterType: 'bandpass',
    });
    playTone(ctx, {
      type: 'square',
      startFreq: 200,
      endFreq: 140,
      duration: 0.06,
      peak: 0.12 * volume,
    });
  },
  hitHeavy: (ctx, volume) => {
    playNoise(ctx, {
      duration: 0.16,
      peak: 0.28 * volume,
      filterFreq: 500,
      filterType: 'lowpass',
    });
    playTone(ctx, {
      type: 'triangle',
      startFreq: 140,
      endFreq: 50,
      duration: 0.2,
      peak: 0.3 * volume,
    });
  },
  pickup: (ctx, volume) => {
    playTone(ctx, {
      type: 'square',
      startFreq: 988,
      duration: 0.07,
      peak: 0.18 * volume,
    });
    playTone(ctx, {
      type: 'square',
      startFreq: 1318,
      duration: 0.16,
      peak: 0.22 * volume,
      delay: 0.06,
    });
  },
  billboardTalk: (ctx, volume) => {
    // Slight pitch variance per call gives a "chattering" Inscryption/Animal
    // Crossing-style voice as the billboard types out each character.
    const base = 520 + Math.random() * 260;
    playTone(ctx, {
      type: 'square',
      startFreq: base,
      endFreq: base * 0.8,
      duration: 0.04,
      peak: 0.09 * volume,
    });
  },
  billboardGlitch: (ctx, volume) => {
    playNoise(ctx, {
      duration: 0.07,
      peak: 0.18 * volume,
      filterFreq: 2200,
      filterType: 'highpass',
    });
    playTone(ctx, {
      type: 'square',
      startFreq: 180,
      endFreq: 900,
      duration: 0.05,
      peak: 0.12 * volume,
      delay: 0.01,
    });
  },
  respawn: (ctx, volume) => {
    // Quick ascending major arpeggio — a little "new game ready" jingle for
    // the R-key world reset.
    playTone(ctx, {
      type: 'square',
      startFreq: 392,
      duration: 0.07,
      peak: 0.16 * volume,
    });
    playTone(ctx, {
      type: 'square',
      startFreq: 523,
      duration: 0.07,
      peak: 0.18 * volume,
      delay: 0.07,
    });
    playTone(ctx, {
      type: 'square',
      startFreq: 659,
      duration: 0.14,
      peak: 0.22 * volume,
      delay: 0.14,
    });
  },
};

/**
 * Shared per-page audio controller for the hero mini-game: synthesizes 8-bit
 * SFX via the Web Audio API, plays/loops the background track, and persists
 * a single mute flag + volume level (CLAUDE.md: muted by default, never
 * autoplay with sound, persist choice in localStorage). One instance is
 * shared by the canvas (`HeroGame`) and the always-visible mute control
 * (`HeroAudioToggle`).
 */
class HeroAudioEngine {
  private muted = readStoredMuted();
  private volume = readStoredVolume();
  private musicMuted = readStoredMusicMuted();
  private musicTrackIndex = readStoredMusicTrackIndex();
  private ctx: AudioContext | null = null;
  private music: HTMLAudioElement | null = null;
  private readonly listeners = new Set<Listener>();

  isMuted(): boolean {
    return this.muted;
  }

  getVolume(): number {
    return this.volume;
  }

  isMusicMuted(): boolean {
    return this.musicMuted;
  }

  getMusicTrackIndex(): number {
    return this.musicTrackIndex;
  }

  getMusicTrackCount(): number {
    return MUSIC_TRACK_URLS.length;
  }

  /** Notified whenever `muted`/`volume` change — used by UI to stay in sync. */
  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    for (const listener of this.listeners) listener();
  }

  setMuted(muted: boolean) {
    if (this.muted === muted) return;
    this.muted = muted;
    window.localStorage.setItem(MUTED_KEY, String(muted));
    this.applyMusicVolume();
    this.notify();
  }

  toggleMuted() {
    this.setMuted(!this.muted);
  }

  setMusicMuted(muted: boolean) {
    if (this.musicMuted === muted) return;
    this.musicMuted = muted;
    window.localStorage.setItem(MUSIC_MUTED_KEY, String(muted));
    this.applyMusicVolume();
    this.notify();
  }

  toggleMusicMuted() {
    this.setMusicMuted(!this.musicMuted);
  }

  setMusicTrackIndex(index: number) {
    const count = MUSIC_TRACK_URLS.length;
    const wrapped = ((index % count) + count) % count;
    if (this.musicTrackIndex === wrapped) return;

    this.musicTrackIndex = wrapped;
    window.localStorage.setItem(MUSIC_TRACK_INDEX_KEY, String(wrapped));

    const wasPlaying = this.music !== null && !this.music.paused;
    if (this.music) {
      this.music.pause();
      this.music.src = MUSIC_TRACK_URLS[this.musicTrackIndex];
      this.music.load();
      this.music.currentTime = 0;
      this.applyMusicVolume();
      if (wasPlaying) void this.music.play().catch(() => {});
    }
    this.notify();
  }

  changeMusicTrack(delta: number) {
    this.setMusicTrackIndex(this.musicTrackIndex + delta);
  }

  setVolume(volume: number) {
    const clamped = Math.min(1, Math.max(0, volume));
    if (this.volume === clamped) return;
    this.volume = clamped;
    window.localStorage.setItem(VOLUME_KEY, String(clamped));
    this.applyMusicVolume();
    this.notify();
  }

  private getContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtor = getAudioContextConstructor();
      if (!AudioCtor) return null;
      this.ctx = new AudioCtor();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  private applyMusicVolume() {
    if (!this.music) return;
    this.music.volume =
      this.muted || this.musicMuted ? 0 : this.volume * MUSIC_VOLUME_SCALE;
  }

  /** Starts the looping background track from the top (called when the player hits play). */
  playMusic() {
    if (typeof window === 'undefined') return;
    if (!this.music) {
      const audio = new Audio(MUSIC_TRACK_URLS[this.musicTrackIndex]);
      audio.loop = true;
      audio.preload = 'auto';
      this.music = audio;
    }
    this.applyMusicVolume();
    this.music.currentTime = 0;
    void this.music.play().catch(() => {});
  }

  /** Pauses the background track (called on exit/deactivate). */
  stopMusic() {
    if (!this.music) return;
    this.music.pause();
    this.music.currentTime = 0;
  }

  /** Plays a synthesized SFX patch, skipped entirely while muted or silent. */
  playSfx(name: SfxName) {
    if (this.muted || this.volume <= 0) return;
    const ctx = this.getContext();
    if (!ctx) return;
    SFX_BUILDERS[name](ctx, this.volume);
  }
}

let instance: HeroAudioEngine | null = null;

/** Lazily creates the shared per-page audio engine instance. */
export function getHeroAudio(): HeroAudioEngine {
  if (!instance) instance = new HeroAudioEngine();
  return instance;
}
