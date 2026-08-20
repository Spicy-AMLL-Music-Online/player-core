import { EQ_BANDS } from './equalizer-presets.js';

/**
 * Spicy AMLL Player — Audio Engine
 * Dual-channel Web Audio graph supporting equalizers and seamless transitions.
 */
export default class AudioPlayer {
  constructor() {
    this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    this.masterGain = this.audioContext.createGain();
    this.masterGain.connect(this.audioContext.destination);

    // Analysis tap (non-audio) so the background can react to low-frequency energy
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.6;
    this.masterGain.connect(this.analyser);
    this._freqData = new Uint8Array(this.analyser.frequencyBinCount);

    // Low-freq onset state (drives the background): kick-band flux with an
    // adaptive energy threshold, pulses gated to the song's own rhythm.
    this._prevBass = 0;
    this._fluxEMA = 0.01;
    this._interEMA = 0.5;
    this._lastOnset = -1;
    this._lastPulse = -1;
    this._pulse = 0;
    this._lastTime = 0;

    // Channel A
    this.audioA = new Audio();
    this.audioA.crossOrigin = 'anonymous';
    this.gainA = this.audioContext.createGain();
    this.sourceA = this.audioContext.createMediaElementSource(this.audioA);
    this.sourceA.connect(this.gainA);

    // Channel B
    this.audioB = new Audio();
    this.audioB.crossOrigin = 'anonymous';
    this.gainB = this.audioContext.createGain();
    this.sourceB = this.audioContext.createMediaElementSource(this.audioB);
    this.sourceB.connect(this.gainB);

    this.currentChannel = 'A';

    // Filter network
    this.eqNodes = [];
    this.setupEQ();

    this.isPlaying = false;
    this.duration = 0;

    // Transition parameters
    this.crossfadeDuration = 0;
    this._crossfadeTriggered = false;

    // Events
    this.onLoadedMetadata = null;
    this.onEnded = null;
    this.onPlay = null;
    this.onPause = null;
    this.onError = null;
    this.onPositionUpdate = null;
    this.onCrossfadeTrigger = null;

    this._bindChannelEvents(this.audioA, 'A');
    this._bindChannelEvents(this.audioB, 'B');

    this.repeatMode = 0; 
    this.shuffleActive = false;

    // Tracking loop
    setInterval(() => {
      if (this.isPlaying) {
        const pos = this.getPosition();
        if (this.onPositionUpdate) this.onPositionUpdate(pos);

        // Evaluate crossfade trigger threshold
        if (
          this.crossfadeDuration > 0 &&
          !this._crossfadeTriggered &&
          this.duration > 0
        ) {
          const remaining = (this.duration - pos) / 1000;
          if (remaining <= this.crossfadeDuration && remaining > 0) {
            this._crossfadeTriggered = true;
            if (this.onCrossfadeTrigger) this.onCrossfadeTrigger();
          }
        }
      }
    }, 100);
  }

  get audio() {
    return this.currentChannel === 'A' ? this.audioA : this.audioB;
  }

  get _inactiveAudio() {
    return this.currentChannel === 'A' ? this.audioB : this.audioA;
  }

  get activeGain() {
    return this.currentChannel === 'A' ? this.gainA : this.gainB;
  }

  get _inactiveGain() {
    return this.currentChannel === 'A' ? this.gainB : this.gainA;
  }

  setupEQ() {
    this.eqNodes = EQ_BANDS.map(freq => {
      const filter = this.audioContext.createBiquadFilter();
      filter.type = 'peaking';
      filter.frequency.value = freq;
      filter.Q.value = 1;
      filter.gain.value = 0;
      return filter;
    });

    this.gainA.connect(this.eqNodes[0]);
    this.gainB.connect(this.eqNodes[0]);
    for (let i = 0; i < this.eqNodes.length - 1; i++) {
      this.eqNodes[i].connect(this.eqNodes[i + 1]);
    }
    this.eqNodes[this.eqNodes.length - 1].connect(this.masterGain);
  }

  _bindChannelEvents(audioEl, channel) {
    audioEl.addEventListener('loadedmetadata', () => {
      if (this.currentChannel !== channel) return;
      this.duration = audioEl.duration * 1000;
      if (this.onLoadedMetadata) this.onLoadedMetadata(this.duration);
    });

    audioEl.addEventListener('error', () => {
      if (this.currentChannel !== channel) return;
      const err = audioEl.error;
      console.error(`[AudioPlayer] Media error on channel ${channel}:`, err ? { code: err.code, message: err.message } : 'Unknown');
      if (this.onError) this.onError(err);
    });

    audioEl.addEventListener('ended', () => {
      if (this.currentChannel !== channel) return;
      this.handleEnded();
    });

    audioEl.addEventListener('play', () => {
      if (this.currentChannel !== channel) return;
      this.isPlaying = true;
      if (this.onPlay) this.onPlay();
    });

    audioEl.addEventListener('pause', () => {
      if (this.currentChannel !== channel) return;
      this.isPlaying = false;
      if (this.onPause) this.onPause();
    });
  }

  setEQGain(index, value) {
    if (this.eqNodes[index]) {
      this.eqNodes[index].gain.setTargetAtTime(value, this.audioContext.currentTime, 0.1);
    }
  }

  /**
   * Sets new source URL on the active channel and fully tears down inactive
   * channel state to release decoder buffers and prevent split-second playbacks.
   */
  setSource(url) {
    this._silenceChannel(this._inactiveAudio, this._inactiveGain);
    this._crossfadeTriggered = false;
    this._prevBass = 0;
    this._fluxEMA = 0.01;
    this._interEMA = 0.5;
    this._lastOnset = -1;
    this._lastPulse = -1;
    this._pulse = 0;
    this._lastTime = 0;

    this.activeGain.gain.cancelScheduledValues(this.audioContext.currentTime);
    this.activeGain.gain.setValueAtTime(1, this.audioContext.currentTime);

    const wasPlaying = this.isPlaying;
    this.audio.src = url;
    this.audio.load();
    if (wasPlaying) this.play();
  }

  /**
   * Crossfades active channel down while ramping inactive channel up.
   */
  transitionTo(url, crossfadeSeconds) {
    const ctx = this.audioContext;
    const now = ctx.currentTime;
    const dur = crossfadeSeconds;

    const nextAudio = this._inactiveAudio;
    const nextGain  = this._inactiveGain;
    const prevGain  = this.activeGain;
    const prevAudio = this.audio;

    nextAudio.pause();
    nextAudio.removeAttribute('src');
    nextAudio.load();

    nextGain.gain.cancelScheduledValues(now);
    nextGain.gain.setValueAtTime(0, now);
    nextGain.gain.linearRampToValueAtTime(1, now + dur);

    nextAudio.src = url;
    nextAudio.load();

    this.currentChannel = this.currentChannel === 'A' ? 'B' : 'A';
    this._crossfadeTriggered = false;

    nextAudio.play().catch(e => console.warn('Crossfade play failed:', e));

    prevGain.gain.cancelScheduledValues(now);
    prevGain.gain.setValueAtTime(prevGain.gain.value, now);
    prevGain.gain.linearRampToValueAtTime(0, now + dur);

    setTimeout(() => {
      this._silenceChannel(prevAudio, prevGain);
    }, (dur + 0.1) * 1000);
  }

  /**
   * Hard-resets a media element's source state and volume to release OS audio resources.
   */
  _silenceChannel(audioEl, gainNode) {
    gainNode.gain.cancelScheduledValues(this.audioContext.currentTime);
    gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
    audioEl.pause();
    audioEl.removeAttribute('src');
    audioEl.load();
  }

  getPosition() {
    return this.audio.currentTime * 1000;
  }

  getLatencyCompensatedPosition() {
    const latencyMs = ((this.audioContext.outputLatency ?? 0) + (this.audioContext.baseLatency ?? 0)) * 1000;
    return Math.max(0, this.audio.currentTime * 1000 - latencyMs);
  }

  seek(ms) {
    if (this.audioContext.state === 'suspended') this.audioContext.resume();
    this.audio.currentTime = ms / 1000;
  }

  play() {
    if (this.audioContext.state === 'suspended') this.audioContext.resume();
    return this.audio.play().catch(e => console.warn('Playback failed:', e));
  }

  pause() {
    this.audio.pause();
  }

  togglePlay() {
    if (this.audio.paused) {
      this.play();
    } else {
      this.pause();
    }
    return !this.audio.paused;
  }

  handleEnded() {
    if (this.repeatMode === 2) {
      this.seek(0);
      this.play();
    } else {
      if (this.onEnded) this.onEnded();
    }
  }

  setVolume(v) {
    this.masterGain.gain.setTargetAtTime(v, this.audioContext.currentTime, 0.1);
  }

  getVolume() {
    return this.masterGain.gain.value;
  }

  /**
   * Low-frequency beat level (0..1) driving the background.
   *
   * Kick-band energy flux (~35-85Hz) with an adaptive onset threshold. Each
   * detected bass hit fires a pulse gated to the song's self-learned onset
   * interval, so rhythmic pulses stay locked to the beat and continuous 808
   * walls become musical pumps instead of a constant blob. Validated offline
   * against a 74 BPM track: one pulse per beat, quiet between.
   */
  getLowFreqLevel() {
    const t = this.audioContext.currentTime;
    const dt = this._lastTime ? Math.min(0.5, t - this._lastTime) : 0.016;
    this._lastTime = t;

    // Freeze the release when playback stops so the effect dies out gently.
    if (!this.isPlaying) {
      this._pulse = (this._pulse || 0) * Math.exp(-Math.max(dt, 0.016) / 0.09);
      return this._pulse;
    }

    this.analyser.getByteFrequencyData(this._freqData);

    // Kick-band energy (~35-85Hz): the actual kick/sub hit, not the melodic
    // bassline riding above. Flux = positive jump from last frame.
    const binHz = this.audioContext.sampleRate / this.analyser.fftSize;
    const maxBin = Math.min(this._freqData.length, Math.round(85 / binHz));
    const minBin = Math.round(35 / binHz);
    let bsum = 0, bn = 0;
    for (let i = minBin; i < maxBin; i++) { bsum += this._freqData[i]; bn++; }
    const bass = bn > 0 ? bsum / bn / 255 : 0;
    const flux = Math.max(0, bass - this._prevBass);
    this._prevBass = bass;

    // Adaptive onset threshold: jump clearly above the recent flux noise.
    // Rises fast on hits, decays toward a floor in between.
    this._fluxEMA = flux > 0.5 * this._fluxEMA
      ? 0.3 * flux + 0.7 * this._fluxEMA
      : (this._fluxEMA * 0.9 + 0.005 * 0.1);
    const onset = flux > Math.max(0.012, this._fluxEMA * 1.8);

    // Track the song's rhythm via the average interval between onsets, and
    // cooldown each pulse to it (clamped) so continuous 808 rolls pulse at
    // the beat rate instead of stacking into a constant wall.
    if (onset) {
      if (this._lastOnset >= 0) {
        const iv = t - this._lastOnset;
        this._interEMA = 0.08 * iv + 0.92 * this._interEMA;
      }
      this._lastOnset = t;
    }
    const cooldown = Math.min(0.75, Math.max(0.22, this._interEMA));

    // Fire one pulse per musical hit.
    if (onset && t - this._lastPulse >= cooldown) {
      this._pulse = 1;
      this._lastPulse = t;
    }

    // Fast release so it visibly pops then breathes back between beats.
    this._pulse *= Math.exp(-dt / 0.09);
    return Math.min(1, this._pulse);
  }
  }

  static formatTime(ms, negative = false) {
    if (isNaN(ms)) return '0:00';
    const totalSeconds = Math.floor(Math.abs(ms) / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const formatted = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    return negative ? `-${formatted}` : formatted;
  }
}
