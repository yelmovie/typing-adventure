/**
 * AudioManager — BGM/SFX 구조.
 *  - SFX: public/assets/audio/sfx_*.ogg (scripts/gen-sfx.mjs 로 자체 합성) 를 WebAudio 버퍼로 재생.
 *    동시 재생·피치 조절(콤보가 오를수록 음이 올라감)이 되고, 파일이 없으면 내장 톤으로 대체.
 *  - BGM: <audio> 루프. 파일이 없어도 오류 없이 동작한다.
 */
import { SaveSystem } from './SaveSystem';

type SfxName = 'hit' | 'miss' | 'perfect' | 'click' | 'clear' | 'combo' | 'defeat' | 'hurt' | 'countdown' | 'go' | 'star' | 'tap' | 'fever' | 'coin' | 'bomb';

const SFX_NAMES: SfxName[] = ['hit', 'miss', 'perfect', 'click', 'clear', 'combo', 'defeat', 'hurt', 'countdown', 'go', 'star', 'tap', 'fever', 'coin', 'bomb'];
const sfxUrl = (n: SfxName) => `./assets/audio/sfx_${n}.ogg`;
/** 기본 음량 (파일별 보정) */
const SFX_GAIN: Partial<Record<SfxName, number>> = { tap: 0.55, click: 0.6, hit: 0.9, fever: 1, bomb: 1 };
// docs/AUDIO-PROMPTS.md 의 파일명과 일치. 파일이 없으면 조용히 무시된다.
const BGM_FILES: Record<string, string> = {
  home: 'bgm_home.mp3',
  map: 'bgm_map.mp3',
  battle: 'bgm_forest.mp3', // 기본 전투 = 푸른 숲
  forest: 'bgm_forest.mp3',
  city: 'bgm_city.mp3',
  desert: 'bgm_desert.mp3',
  train: 'bgm_train.mp3',
  boss: 'bgm_boss.mp3',
  result: 'bgm_result.mp3',
};
// 트랙별 음량 보정 (mean -15.5dB 기준으로 맞춤, 0.5 = 기본)
const BGM_GAIN: Record<string, number> = { boss: 0.42, city: 0.58, desert: 0.46, forest: 0.5, home: 0.47, map: 0.53, result: 0.6, train: 0.51 };
export const STAGE_BGM: Record<string, keyof typeof BGM_FILES> = { stage_1: 'forest', stage_2: 'city', stage_3: 'desert', stage_4: 'train', stage_5: 'boss' };

class AudioManagerImpl {
  private ctx: AudioContext | null = null;
  private buffers = new Map<SfxName, AudioBuffer | null>(); // null = 로딩 중/없음
  private sfxBus: GainNode | null = null;
  private preloaded = false;
  private bgmEl: HTMLAudioElement | null = null;
  private bgmName = '';
  private rate = 1;
  /** 자동재생 정책에 막힌 BGM: 다음 사용자 입력(unlock)에서 재시도 */
  private bgmPending = false;
  private userActivated = false;

  private ensureCtx(): AudioContext | null {
    if (this.ctx) return this.ctx;
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC();
    } catch {
      this.ctx = null;
    }
    return this.ctx;
  }

  /** 사용자 입력 이후 호출: AudioContext 재개 + 효과음 미리 받기 */
  unlock() {
    this.userActivated = true;
    if (this.bgmOn && this.bgmName && !this.bgmEl) void this.bgm(this.bgmName);
    const c = this.ensureCtx();
    if (c && c.state === 'suspended') void c.resume();
    if (this.bgmOn && this.bgmPending && this.bgmEl) this.playBgmEl(this.bgmEl);
    if (c && !this.preloaded) {
      this.preloaded = true;
      for (const n of SFX_NAMES) void this.loadSfx(n);
    }
  }

  private bus(c: AudioContext): GainNode {
    if (!this.sfxBus) {
      this.sfxBus = c.createGain();
      this.sfxBus.gain.value = SaveSystem.get().settings.sfxVolume ?? 0.9;
      this.sfxBus.connect(c.destination);
    }
    return this.sfxBus;
  }

  private async loadSfx(name: SfxName): Promise<AudioBuffer | null> {
    if (this.buffers.has(name)) return this.buffers.get(name)!;
    this.buffers.set(name, null);
    const c = this.ensureCtx();
    if (!c) return null;
    try {
      const res = await fetch(sfxUrl(name));
      if (!res.ok || (res.headers.get('content-type') ?? '').includes('text/html')) return null;
      const buf = await c.decodeAudioData(await res.arrayBuffer());
      this.buffers.set(name, buf);
      return buf;
    } catch {
      return null;
    }
  }

  get sfxOn() {
    return SaveSystem.get().settings.sfx;
  }
  get bgmOn() {
    return SaveSystem.get().settings.bgm;
  }

  /**
   * 효과음 재생. rate = 피치(1 = 원음). 콤보 연출: 5콤보당 반음 정도 올라가게 호출 측에서 rate를 준다.
   * 파일이 아직 없거나 로딩 중이면 내장 톤으로 대체.
   */
  sfx(name: SfxName, opts: { rate?: number; gain?: number } = {}) {
    if (!this.sfxOn) return;
    const c = this.ensureCtx();
    const buf = this.buffers.get(name);
    if (!c || !buf) {
      if (buf === undefined) void this.loadSfx(name);
      this.synth(name);
      return;
    }
    const src = c.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = opts.rate ?? 1;
    const g = c.createGain();
    g.gain.value = (SFX_GAIN[name] ?? 0.8) * (opts.gain ?? 1);
    src.connect(g).connect(this.bus(c));
    src.start();
  }

  /** 콤보 수 → 피치 배율 (20콤보에서 약 +5반음) */
  comboRate(combo: number): number {
    return Math.pow(2, Math.min(combo, 20) / 48);
  }

  /** 파일이 없을 때의 대체 톤 (짧고 부드럽게) */
  private synth(name: SfxName) {
    const c = this.ensureCtx();
    if (!c || c.state !== 'running') return;
    const t = c.currentTime;
    const play = (freq: number, dur: number, type: OscillatorType, gain = 0.08, delay = 0, slide = 0) => {
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t + delay);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + delay + dur);
      g.gain.setValueAtTime(0.0001, t + delay);
      g.gain.exponentialRampToValueAtTime(gain, t + delay + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + delay + dur);
      o.connect(g).connect(this.bus(c));
      o.start(t + delay);
      o.stop(t + delay + dur + 0.02);
    };
    switch (name) {
      case 'hit': play(660, 0.09, 'square', 0.06); play(990, 0.08, 'triangle', 0.05, 0.04); break;
      case 'perfect': play(784, 0.1, 'triangle', 0.07); play(1046, 0.12, 'triangle', 0.07, 0.08); play(1318, 0.18, 'triangle', 0.07, 0.16); break;
      case 'miss': play(220, 0.18, 'sawtooth', 0.05, 0, -120); break;
      case 'hurt': play(160, 0.2, 'square', 0.05, 0, -80); break;
      case 'click': play(880, 0.05, 'triangle', 0.05); break;
      case 'combo': play(523, 0.08, 'triangle', 0.06); play(659, 0.08, 'triangle', 0.06, 0.07); play(784, 0.12, 'triangle', 0.06, 0.14); break;
      case 'defeat': play(300, 0.25, 'triangle', 0.06, 0, -200); play(150, 0.3, 'square', 0.04, 0.1, -100); break;
      case 'clear': [523, 659, 784, 1046, 1318].forEach((f, i) => play(f, 0.22, 'triangle', 0.07, i * 0.12)); break;
      case 'countdown': play(440, 0.15, 'triangle', 0.06); break;
      case 'go': play(660, 0.12, 'triangle', 0.07); play(880, 0.25, 'triangle', 0.07, 0.1); break;
      case 'star': play(1046, 0.15, 'triangle', 0.06); play(1568, 0.25, 'triangle', 0.06, 0.1); break;
      case 'tap': play(880, 0.05, 'square', 0.035); break;
      case 'fever': [659, 784, 988, 1318, 1568, 1976].forEach((f, i) => play(f, 0.16, 'triangle', 0.07, i * 0.07)); break;
      case 'coin': play(1318, 0.08, 'square', 0.05); play(1760, 0.2, 'square', 0.05, 0.08); break;
      case 'bomb': play(120, 0.35, 'sawtooth', 0.07, 0, -80); play(60, 0.4, 'square', 0.05, 0.05, -30); break;
    }
  }

  async bgm(name: keyof typeof BGM_FILES | 'none') {
    if (name === 'none') {
      this.stopBgm();
      return;
    }
    if (this.bgmName === name && this.bgmEl) return;
    this.stopBgm();
    this.bgmName = name;
    // Remember the scene without downloading a track that autoplay would block.
    if (!this.bgmOn || !this.userActivated) return;
    const url = `./assets/bgm/${BGM_FILES[name]}`;
    // The media element uses GET, allowing prepared offline caches to serve audio.
    if (this.bgmName !== name || !this.bgmOn) return;
    const el = new Audio(url);
    el.loop = name !== 'result';
    el.volume = (BGM_GAIN[name] ?? 0.5) * ((SaveSystem.get().settings.bgmVolume ?? 0.7) / 0.7);
    el.playbackRate = this.rate;
    this.bgmEl = el;
    this.playBgmEl(el);
  }

  private playBgmEl(el: HTMLAudioElement) {
    this.bgmPending = false;
    el.play().then(() => { this.bgmPending = false; }).catch(() => { this.bgmPending = el === this.bgmEl; });
  }

  /** bgm·sfx 둘 다 꺼져 있으면 음소거 상태 */
  isMuted() {
    const st = SaveSystem.get().settings;
    return !st.bgm && !st.sfx;
  }

  /** 원터치 음소거: bgm·sfx 를 함께 끄고 켠다 */
  toggleMute() {
    const on = this.isMuted();
    SaveSystem.setSettings({ bgm: on, sfx: on });
    this.applySettings();
    return !on;
  }

  /** FEVER 템포업 (BGM 파일이 있을 때만 체감) */
  setRate(rate: number) {
    this.rate = rate;
    if (this.bgmEl) this.bgmEl.playbackRate = rate;
  }

  stopBgm() {
    if (this.bgmEl) {
      this.bgmEl.pause();
      this.bgmEl = null;
    }
    this.bgmPending = false;
    this.bgmName = '';
  }

  applySettings() {
    const st = SaveSystem.get().settings;
    if (this.sfxBus) this.sfxBus.gain.value = st.sfxVolume ?? 0.9;
    if (this.bgmEl) this.bgmEl.volume = (BGM_GAIN[this.bgmName] ?? 0.5) * ((st.bgmVolume ?? 0.7) / 0.7);
    if (!this.bgmOn) {
      this.bgmEl?.pause();
      this.bgmPending = false;
    }
    else if (this.bgmEl) this.playBgmEl(this.bgmEl);
    else if (this.bgmName) {
      const n = this.bgmName;
      this.bgmName = '';
      void this.bgm(n as keyof typeof BGM_FILES);
    }
  }
}

export const AudioManager = new AudioManagerImpl();
