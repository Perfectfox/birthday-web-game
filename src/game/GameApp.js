import { AssetLoader } from "./AssetLoader.js";
import { RhythmEngine } from "../rhythm/RhythmEngine.js";
import { StarField } from "../star/StarField.js";
import { ContourMapper } from "../star/ContourMapper.js";
import { PhotoContourExtractor } from "../photo/PhotoContourExtractor.js";
import { GameRenderer } from "./GameRenderer.js";
import { GameState } from "../state/GameState.js";

const FINAL_REVEAL_DURATION_MS = 4200;
const ENDING_VIDEO_DELAY_MS = 2600;
const ENDING_VIDEO_FADE_MS = 1200;
const ENDING_VIDEO_VISUAL_DURATION_MS = 10020;
const ENDING_CAPTION_DELAY_MS = 760;
const ENDING_CAPTION_FADE_MS = 1300;
const START_CEREMONY_MS = 1550;

export class GameApp {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.loader = new AssetLoader();
    this.state = new GameState();
    this.renderer = new GameRenderer(canvas, this.ctx);
    this.keys = new Map([
      ["KeyD", 0],
      ["KeyF", 1],
      ["KeyJ", 2],
      ["KeyK", 3]
    ]);
    this.calibrationKeys = new Map([
      ["BracketLeft", -25],
      ["BracketRight", 25],
      ["Backslash", 0]
    ]);
    this.lastFrame = performance.now();
    this.isRunning = false;
    this.finalReveal = {
      active: false,
      startedAt: 0
    };
    this.videoReveal = {
      active: false,
      startedAt: 0,
      ended: false
    };
    this.startCeremony = {
      active: false,
      startedAt: 0,
      duration: START_CEREMONY_MS,
      origin: null
    };
    this.demoAutoplay = false;
    this.endingVideoMuted = false;
    this.endingVideoDisabled = false;
    this.endingVideoUnavailableNotified = false;
    this.endingCompleteNotified = false;
    this.endingVideoNeedsGesture = false;
    this.endingVideoVisualDurationMs = ENDING_VIDEO_VISUAL_DURATION_MS;
    this.endingCaptions = ["格格，生日快乐", "愿璀璨星河照亮你的前路"];
  }

  async load(manifestUrl) {
    this.assets = await this.loader.loadManifest(manifestUrl);
    const [starMapImage, portraitImage, starMapData, beatmap, contourData, audio, endingVideo] = await Promise.all([
      this.loader.loadImage(this.assets.starMapImage),
      this.loader.loadImage(this.assets.portraitImage),
      this.loader.loadJson(this.assets.starMapData),
      this.loader.loadJson(this.assets.beatmap),
      this.loader.loadOptionalJson(this.assets.portraitContour),
      this.loader.loadOptionalAudio(this.assets.audio),
      this.loader.loadOptionalVideo(this.assets.endingVideo)
    ]);

    this.starField = new StarField(starMapImage, starMapData.stars);
    this.portraitImage = portraitImage;
    this.contourData = contourData;
    this.endingVideo = endingVideo;
    this.endingVideoVisualDurationMs = Number(this.assets.endingVideoVisualDurationMs ?? ENDING_VIDEO_VISUAL_DURATION_MS);
    this.endingCaptions = Array.isArray(this.assets.endingCaptions) && this.assets.endingCaptions.length
      ? this.assets.endingCaptions
      : this.endingCaptions;
    this.endingVideo?.addEventListener("ended", () => {
      this.videoReveal.ended = true;
      this.notifyEndingComplete();
    });
    const contour = contourData?.points?.length
      ? contourData.points
      : normalizeContourPointCount(PhotoContourExtractor.extract(portraitImage, beatmap.notes.length), beatmap.notes.length);
    const contourTargets = ContourMapper.mapContourToStars(contour, starMapData.stars, contourData?.projection);
    this.starField.setContourTargets(contourTargets);

    this.rhythm = new RhythmEngine(beatmap, audio);
    this.rhythm.onHit = (result) => this.handleNoteResult(result, "lit");
    this.rhythm.onMiss = (result) => this.handleNoteResult(result, "missed");
    this.rhythm.onEnd = () => this.startFinalReveal();

    window.addEventListener("keydown", (event) => this.handleKeyDown(event));
    window.addEventListener("pointerdown", (event) => this.handlePointerDown(event));
    this.canvas.addEventListener("pointerdown", (event) => this.handleCanvasPointerDown(event));
    window.addEventListener("resize", () => this.renderer.resize());
    this.renderer.resize();
  }

  startPreview() {
    this.isRunning = true;
    requestAnimationFrame((time) => this.frame(time));
  }

  async startRhythm(options = {}) {
    this.demoAutoplay = false;
    this.state.reset();
    this.starField.reset();
    this.renderer.clearTransientEffects();
    this.finalReveal.active = false;
    this.finalReveal.startedAt = 0;
    this.resetEndingVideo({ muted: false, disabled: false });
    this.startStartCeremony(options.origin);
    this.rhythm.reset();
    await this.rhythm.start();
  }

  startDemo(options = {}) {
    const speed = clamp(Number(options.speed ?? 4), 1, 6);
    const startAt = this.resolveDemoStart(options);
    this.demoAutoplay = true;
    this.state.reset();
    this.starField.reset();
    this.renderer.clearTransientEffects();
    this.finalReveal.active = false;
    this.finalReveal.startedAt = 0;
    this.startCeremony.active = false;
    this.resetEndingVideo({ muted: true, disabled: false });
    this.rhythm.reset();
    this.seedDemoProgress(startAt);
    this.rhythm.startSilent(speed, startAt);
    this.renderer.showSystemMessage(`演示 x${speed} ${formatSeconds(startAt)}`);
  }

  previewFinalReveal(options = {}) {
    this.demoAutoplay = false;
    this.rhythm?.reset();
    this.state.reset();
    for (const target of this.starField.contourTargets) {
      target.state = "lit";
    }
    this.renderer.clearTransientEffects();
    this.startCeremony.active = false;
    this.resetEndingVideo({
      muted: Boolean(options.mutedEndingVideo),
      disabled: Boolean(options.disableEndingVideo)
    });
    this.startFinalReveal();
    if (options.skipToVideo) {
      this.finalReveal.startedAt -= FINAL_REVEAL_DURATION_MS + ENDING_VIDEO_DELAY_MS;
    }
  }

  returnToStartScreen() {
    this.demoAutoplay = false;
    this.state.reset();
    this.starField?.reset();
    this.renderer.clearTransientEffects();
    this.finalReveal.active = false;
    this.finalReveal.startedAt = 0;
    this.startCeremony.active = false;
    this.startCeremony.startedAt = 0;
    this.resetEndingVideo({ muted: true, disabled: false });
    this.rhythm?.reset();
  }

  startFinalReveal() {
    this.finalReveal.active = true;
    this.finalReveal.startedAt = performance.now();
    this.startCeremony.active = false;
    this.renderer.triggerTrackDissolve();
    this.videoReveal.active = false;
    this.videoReveal.startedAt = 0;
    this.videoReveal.ended = false;
  }

  startStartCeremony(origin) {
    this.startCeremony.active = true;
    this.startCeremony.startedAt = performance.now();
    this.startCeremony.duration = START_CEREMONY_MS;
    this.startCeremony.origin = origin ?? null;
  }

  resetEndingVideo({ muted, disabled = false }) {
    this.endingVideoMuted = muted;
    this.endingVideoDisabled = disabled;
    this.videoReveal.active = false;
    this.videoReveal.startedAt = 0;
    this.videoReveal.ended = false;
    this.endingVideoUnavailableNotified = false;
    this.endingCompleteNotified = false;
    if (!this.endingVideo) return;
    this.endingVideo.pause();
    this.endingVideo.muted = muted;
    try {
      this.endingVideo.currentTime = 0;
    } catch {
      // Some browsers reject currentTime changes before enough metadata is ready.
    }
  }

  handleKeyDown(event) {
    if (event.repeat) return;
    if (event.code === "KeyR") {
      event.preventDefault();
      this.previewFinalReveal();
      return;
    }
    if (this.handleCalibrationKey(event)) return;
    if (!this.keys.has(event.code) || !this.rhythm?.isPlaying) return;
    event.preventDefault();
    this.hitLane(this.keys.get(event.code));
  }

  hitLane(lane) {
    if (!this.rhythm?.isPlaying) return;
    this.renderer.pressLane(lane);
    const result = this.rhythm.hitLane(lane);
    this.renderer.showJudgement(result, lane, this.rhythm.calibrationOffset);
    if (result?.consumed) {
      this.state.applyJudgement(result.judgement);
    }
  }

  getCalibrationOffset() {
    return this.rhythm?.calibrationOffset ?? 0;
  }

  setCalibrationOffset(valueMs) {
    if (!this.rhythm) return;
    this.rhythm.setCalibrationOffset(valueMs);
    this.renderer.showSystemMessage(`延迟 ${this.rhythm.calibrationOffset}ms`);
  }

  setIntroScene(scene) {
    this.renderer.setIntroScene(scene);
  }

  getResultSummary() {
    return this.state.getSummary(this.rhythm?.notes?.length ?? 0);
  }

  handleCalibrationKey(event) {
    if (!this.calibrationKeys.has(event.code) || !this.rhythm) return false;
    event.preventDefault();
    const delta = this.calibrationKeys.get(event.code);
    if (delta === 0) {
      this.rhythm.setCalibrationOffset(0);
    } else {
      this.rhythm.adjustCalibration(delta);
    }
    this.renderer.showSystemMessage(`延迟 ${this.rhythm.calibrationOffset}ms`);
    return true;
  }

  handlePointerDown(event) {
    if (event.target?.closest?.("button")) return;
    if (this.videoReveal.ended) return;
    if (!this.videoReveal.active || !this.endingVideo?.paused) return;
    this.endingVideo.muted = this.endingVideoMuted;
    this.endingVideo.play()
      .then(() => {
        this.endingVideoNeedsGesture = false;
      })
      .catch(() => {
        this.endingVideoNeedsGesture = true;
        this.renderer.showSystemMessage("点击屏幕播放结尾声音");
      });
  }

  handleCanvasPointerDown(event) {
    if (!this.rhythm?.isPlaying || this.videoReveal.active || this.finalReveal.active) return;
    const lane = this.renderer.getLaneFromPoint(event.clientX, event.clientY);
    if (lane == null) return;
    event.preventDefault();
    this.hitLane(lane);
  }

  handleNoteResult(result, starState) {
    const targets = this.starField.getTargetsByIndex(result.note.index);
    const target = targets[0];
    if (!target) return;
    if (starState === "missed") {
      this.state.applyJudgement("miss");
      this.renderer.showJudgement(result, result.note.lane, this.rhythm.calibrationOffset);
    }
    this.starField.setTargetsState(targets, starState);
    this.state.recordOrb(result.judgement, target.id);
    this.renderer.spawnOrb({
      fromLane: result.note.lane,
      targetStar: target,
      state: starState,
      accent: result.note.accent
    });
  }

  frame(time) {
    if (!this.isRunning) return;
    const delta = Math.min(40, time - this.lastFrame);
    this.lastFrame = time;

    this.updateDemoAutoplay();
    this.rhythm?.update();
    this.updateEndingVideo(time);
    this.renderer.render({
      delta,
      starField: this.starField,
      rhythm: this.rhythm,
      state: this.state,
      portraitImage: this.portraitImage,
      contourData: this.contourData,
      finalReveal: this.getFinalRevealState(time),
      startCeremony: this.getStartCeremonyState(time),
      endingVideo: this.endingVideo,
      endingVideoState: this.getEndingVideoState(time)
    });

    requestAnimationFrame((nextTime) => this.frame(nextTime));
  }

  getFinalRevealState(time) {
    if (!this.finalReveal.active) {
      return { active: false, progress: 0 };
    }
    return {
      active: true,
      progress: Math.min(1, (time - this.finalReveal.startedAt) / FINAL_REVEAL_DURATION_MS)
    };
  }

  getStartCeremonyState(time) {
    if (!this.startCeremony.active) {
      return { active: false, progress: 0 };
    }
    const progress = Math.min(1, (time - this.startCeremony.startedAt) / this.startCeremony.duration);
    if (progress >= 1) {
      this.startCeremony.active = false;
    }
    return {
      active: progress < 1,
      progress,
      origin: this.startCeremony.origin
    };
  }

  updateDemoAutoplay() {
    if (!this.demoAutoplay || !this.rhythm?.isPlaying) return;
    const time = this.rhythm.getTime();
    for (const note of this.rhythm.notes) {
      if (note.state !== "pending" || note.time > time) continue;
      note.state = "hit";
      const result = { note, judgement: "perfect", consumed: true, delta: 0 };
      this.renderer.pressLane(note.lane);
      this.renderer.showJudgement(result, note.lane, this.rhythm.calibrationOffset);
      this.handleNoteResult(result, "lit");
      this.state.applyJudgement("perfect");
    }
  }

  resolveDemoStart(options) {
    if (options.section) {
      const section = this.rhythm?.beatmap?.sections?.find((item) => item.id === options.section);
      if (section) return Math.max(0, section.start - 1200);
    }
    const rawStart = Number(options.start ?? 0);
    if (!Number.isFinite(rawStart) || rawStart <= 0) return 0;
    return rawStart < 1000 ? rawStart * 1000 : rawStart;
  }

  seedDemoProgress(startAt) {
    if (!startAt || startAt <= 0) return;
    const previousNotes = this.rhythm.notes.filter((note) => note.time < startAt);
    for (const note of previousNotes) {
      note.state = "hit";
      const targets = this.starField.getTargetsByIndex(note.index);
      this.starField.setTargetsState(targets, "lit");
    }
    const seededHits = previousNotes.length;
    this.state.hitCount = seededHits;
    this.state.combo = seededHits;
    this.state.maxCombo = seededHits;
    this.state.score = seededHits * 1000;
  }

  updateEndingVideo(time) {
    if (!this.finalReveal.active || this.videoReveal.active) return;
    if (this.endingVideoDisabled) return;
    const revealElapsed = time - this.finalReveal.startedAt;
    if (revealElapsed < FINAL_REVEAL_DURATION_MS + ENDING_VIDEO_DELAY_MS) return;
    if (!this.endingVideo) {
      if (!this.endingVideoUnavailableNotified) {
        this.renderer.showSystemMessage("结尾视频加载失败");
        this.endingVideoUnavailableNotified = true;
        this.notifyEndingComplete();
      }
      return;
    }
    this.startEndingVideo(time);
  }

  startEndingVideo(time) {
    this.videoReveal.active = true;
    this.videoReveal.startedAt = time;
    this.videoReveal.ended = false;
    this.endingCompleteNotified = false;
    this.endingVideoNeedsGesture = false;
    this.endingVideo.muted = this.endingVideoMuted;
    try {
      this.endingVideo.currentTime = 0;
    } catch {
      // Keep the browser's current frame if seeking is temporarily unavailable.
    }
    const playAttempt = this.endingVideo.play();
    playAttempt
      ?.then(() => {
        this.endingVideoNeedsGesture = false;
      })
      .catch(() => {
        this.endingVideoNeedsGesture = true;
        this.renderer.showSystemMessage("点击屏幕播放结尾声音");
      });
  }

  notifyEndingComplete() {
    if (this.endingCompleteNotified) return;
    this.endingCompleteNotified = true;
    this.onEndingComplete?.(this.getResultSummary());
  }

  getEndingVideoState(time) {
    if (!this.videoReveal.active) {
      return { active: false, progress: 0, ended: false };
    }
    const elapsed = time - this.videoReveal.startedAt;
    const videoTimeMs = Number.isFinite(this.endingVideo?.currentTime)
      ? this.endingVideo.currentTime * 1000
      : elapsed;
    const visualFadeProgress = clamp(
      (videoTimeMs - this.endingVideoVisualDurationMs) / ENDING_VIDEO_FADE_MS,
      0,
      1
    );
    const captionProgress = clamp(
      (videoTimeMs - this.endingVideoVisualDurationMs - ENDING_CAPTION_DELAY_MS) / ENDING_CAPTION_FADE_MS,
      0,
      1
    );
    return {
      active: true,
      progress: Math.min(1, elapsed / ENDING_VIDEO_FADE_MS),
      ended: this.videoReveal.ended,
      videoTimeMs,
      visualDurationMs: this.endingVideoVisualDurationMs,
      visualFadeProgress,
      captionProgress,
      captions: this.endingCaptions,
      needsGesture: this.endingVideoNeedsGesture
    };
  }
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function formatSeconds(ms) {
  return `${Math.round(ms / 1000)}s`;
}

function normalizeContourPointCount(points, targetCount) {
  if (points.length === targetCount) return points;
  const normalized = [];
  for (let i = 0; i < targetCount; i++) {
    const sourceIndex = Math.floor((i / targetCount) * points.length);
    normalized.push({
      ...points[sourceIndex],
      order: i
    });
  }
  return normalized;
}
