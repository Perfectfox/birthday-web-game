import { GameApp } from "./game/GameApp.js";

const canvas = document.querySelector("#game-canvas");
const overlay = document.querySelector("#overlay");
const endControls = document.querySelector("#end-controls");
const resultCard = document.querySelector("#result-card");
const startButton = document.querySelector("#start-button");
const homeButton = document.querySelector("#home-button");
const revealPreviewButton = document.querySelector("#reveal-preview-button");
const restartButton = document.querySelector("#restart-button");
const endingAgainButton = document.querySelector("#ending-again-button");
const resultKicker = document.querySelector("#result-kicker");
const resultRank = document.querySelector("#result-rank");
const resultScore = document.querySelector("#result-score");
const resultBest = document.querySelector("#result-best");
const resultCombo = document.querySelector("#result-combo");
const resultAccuracy = document.querySelector("#result-accuracy");
const resultCompletion = document.querySelector("#result-completion");
const resultHitMiss = document.querySelector("#result-hit-miss");
const currentOffset = document.querySelector("#current-offset");
const introCopy = document.querySelector("#intro-copy");
const introLine = document.querySelector("#intro-line");
const introSupport = document.querySelector("#intro-support");
const introControls = document.querySelector("#intro-controls");
const advanceHint = document.querySelector("#advance-hint");
const calibrationButton = document.querySelector("#calibration-button");
const calibrationPanel = document.querySelector("#calibration-panel");
const calibrationPulse = document.querySelector("#calibration-pulse");
const calibrationLabel = document.querySelector("#calibration-label");
const calibrationBeatDot = document.querySelector("#calibration-beat-dot");
const calibrationHitLayer = document.querySelector("#calibration-hit-layer");
const calibrationDelta = document.querySelector("#calibration-delta");
const calibrationSamples = document.querySelector("#calibration-samples");
const calibrationDirection = document.querySelector("#calibration-direction");
const calibrationResult = document.querySelector("#calibration-result");
const calibrationStartButton = document.querySelector("#calibration-start-button");
const calibrationApplyButton = document.querySelector("#calibration-apply-button");
const calibrationCloseButton = document.querySelector("#calibration-close-button");
const calibrationLateButton = document.querySelector("#calibration-late-button");
const calibrationEarlyButton = document.querySelector("#calibration-early-button");
const calibrationResetButton = document.querySelector("#calibration-reset-button");

const CALIBRATION_PULSES = 12;
const CALIBRATION_INTERVAL_MS = 650;
const CALIBRATION_LEAD_MS = 850;
const CALIBRATION_MATCH_WINDOW_MS = 480;
const CALIBRATION_HIT_CODES = new Set(["KeyD", "KeyF", "KeyJ", "KeyK", "Space"]);
const INTRO_AUTO_ADVANCE_MS = 8200;
const INTRO_TRANSITION_MS = 280;
const INTRO_ADVANCE_COOLDOWN_MS = 680;
const INTRO_SLIDES = [
  {
    line: "这一刻，墨尔本上空的星河已经展开。",
    support: "天狼星靠向西方，老人星仍在南天发亮；这不是背景，而是此时此地的天球。",
    markerGroup: "anchor"
  },
  {
    line: "向南望去，南十字和半人马座守在夜色里。",
    support: "南门二、哈达尔和南十字座像几枚路标，替这张星图标出真实的方向。",
    markerGroup: "south"
  },
  {
    line: "等旋律响起，节拍会变成飞向星图的光。",
    support: "每一次命中，都会点亮一颗星；那些光会慢慢连成今晚要留下的轮廓。",
    markerGroup: "memory"
  },
  {
    line: "准备好后，接住落下的星光。",
    support: "星光靠近底部判定线时按下对应按键。可以直接开始，也可以先校准节拍。",
    markerGroup: "controls",
    final: true
  }
];
const calibration = {
  active: false,
  pulseTimes: [],
  usedPulseIndexes: new Set(),
  samples: [],
  sampleRecords: [],
  timers: [],
  markerTimers: [],
  currentPulseIndex: -1,
  recommendedOffset: null,
  audioContext: null
};
let introIndex = 0;
let introTimer = null;
let introTransitionTimer = null;
let introChanging = false;
let lastIntroAdvanceAt = 0;

const app = new GameApp(canvas);
await app.load("public/assets/data/game-assets.json");
app.startPreview();
updateOffsetReadout();
resetCalibrationVisualizer();
resetIntroSequence();

function dismissOverlay() {
  stopIntroSequence();
  app.setIntroScene({ active: false });
  closeCalibrationPanel();
  endControls.classList.add("is-hidden");
  showHomeButton();
  overlay.classList.add("is-leaving");
  window.setTimeout(() => {
    overlay.classList.add("is-hidden");
  }, 680);
}

function showStartOverlay() {
  closeCalibrationPanel();
  hideEndControls();
  hideHomeButton();
  app.returnToStartScreen();
  overlay.classList.remove("is-hidden", "is-leaving");
  updateOffsetReadout();
  resetIntroSequence();
}

function showHomeButton() {
  homeButton.classList.remove("is-hidden");
}

function hideHomeButton() {
  homeButton.classList.add("is-hidden");
}

function hideEndControls() {
  endControls.classList.add("is-hidden");
}

function showEndControls(summary = app.getResultSummary(), options = {}) {
  updateResultCard(summary, options);
  endControls.classList.remove("is-hidden");
}

function updateResultCard(summary, options = {}) {
  if (!summary) return;
  const saveBest = options.saveBest ?? true;
  const previousBest = getStoredBestScore();
  const currentScore = Number(summary.score ?? 0);
  const isNewBest = saveBest && summary.totalJudged > 0 && currentScore > previousBest;
  const bestScore = isNewBest ? currentScore : Math.max(previousBest, currentScore);
  if (isNewBest) {
    localStorage.setItem("birthdayRhythmBestScore", String(currentScore));
  }
  resultKicker.textContent = isNewBest ? "新的星图记录" : "星座已完成";
  setResultRankClass(summary.rank);
  resultRank.textContent = summary.rank;
  resultScore.textContent = formatScore(currentScore);
  resultBest.textContent = formatScore(bestScore);
  resultCombo.textContent = String(summary.maxCombo);
  resultAccuracy.textContent = `${summary.accuracy}%`;
  resultCompletion.textContent = `${summary.completion ?? 0}%`;
  resultHitMiss.textContent = `${summary.hitCount} / ${summary.missCount}`;
}

function setResultRankClass(rank) {
  resultCard.classList.remove("rank-ss", "rank-s", "rank-a", "rank-b", "rank-c", "rank-preview");
  const normalizedRank = String(rank ?? "preview").toLowerCase();
  resultCard.classList.add(`rank-${normalizedRank}`);
}

function getStoredBestScore() {
  const stored = Number(localStorage.getItem("birthdayRhythmBestScore") ?? 0);
  return Number.isFinite(stored) ? stored : 0;
}

function formatScore(value) {
  return String(Math.max(0, Math.round(value))).padStart(6, "0");
}

function updateOffsetReadout(options = {}) {
  const updateResult = options.updateResult ?? true;
  const offset = Math.round(app.getCalibrationOffset());
  const label = `延迟 ${formatSignedMs(offset)}`;
  if (currentOffset) {
    currentOffset.textContent = label;
  }
  if (updateResult && calibrationResult && calibration.recommendedOffset == null) {
    calibrationResult.textContent = `当前延迟：${formatSignedMs(offset)}。点“开始测量”后，光环亮起或听到提示音时按 D/F/J/K/空格。`;
  }
}

function resetIntroSequence() {
  stopIntroSequence();
  introIndex = 0;
  introChanging = false;
  lastIntroAdvanceAt = 0;
  introCopy?.classList.remove("is-changing");
  renderIntroSlide();
  scheduleIntroAdvance();
}

function stopIntroSequence() {
  window.clearTimeout(introTimer);
  window.clearTimeout(introTransitionTimer);
  introTimer = null;
  introTransitionTimer = null;
}

function scheduleIntroAdvance() {
  stopIntroSequence();
  if (isIntroComplete()) return;
  introTimer = window.setTimeout(() => {
    advanceIntroSlide();
  }, INTRO_AUTO_ADVANCE_MS);
}

function advanceIntroSlide() {
  if (introChanging || isIntroComplete() || overlay.classList.contains("is-hidden")) return;
  const now = performance.now();
  if (now - lastIntroAdvanceAt < INTRO_ADVANCE_COOLDOWN_MS) return;
  lastIntroAdvanceAt = now;
  introChanging = true;
  stopIntroSequence();
  introCopy?.classList.add("is-changing");
  introTransitionTimer = window.setTimeout(() => {
    introIndex = Math.min(INTRO_SLIDES.length - 1, introIndex + 1);
    renderIntroSlide();
    introCopy?.classList.remove("is-changing");
    introChanging = false;
    scheduleIntroAdvance();
  }, INTRO_TRANSITION_MS);
}

function renderIntroSlide() {
  const slide = INTRO_SLIDES[introIndex] ?? INTRO_SLIDES.at(-1);
  setAnimatedText(introLine, slide.line, { stepMs: 34 });
  setAnimatedText(introSupport, slide.support, { stepMs: 18, startDelayMs: 220 });
  const finalSlide = Boolean(slide.final);
  introControls?.classList.toggle("is-hidden", !finalSlide);
  advanceHint?.classList.toggle("is-hidden", finalSlide);
  app.setIntroScene({
    active: !overlay.classList.contains("is-hidden"),
    step: introIndex,
    markerGroup: slide.markerGroup,
    final: finalSlide
  });
  if (advanceHint) {
    advanceHint.textContent = finalSlide ? "" : "按空格或点击继续";
  }
}

function setAnimatedText(element, text, options = {}) {
  if (!element) return;
  const stepMs = options.stepMs ?? 24;
  const startDelayMs = options.startDelayMs ?? 80;
  element.replaceChildren();
  element.setAttribute("aria-label", text);
  for (const [index, char] of [...text].entries()) {
    const span = document.createElement("span");
    span.className = "char";
    span.textContent = char === " " ? "\u00a0" : char;
    span.style.setProperty("--char-delay", `${startDelayMs + index * stepMs}ms`);
    element.append(span);
  }
}

function isIntroComplete() {
  return Boolean(INTRO_SLIDES[introIndex]?.final);
}

function resetCalibrationVisualizer() {
  clearCalibrationMarkerTimers();
  calibration.currentPulseIndex = -1;
  calibrationHitLayer?.replaceChildren();
  calibrationBeatDot?.classList.remove("is-beat");
  setCalibrationDeltaText("等待第一次节拍", "neutral");
  if (calibrationDirection) {
    calibrationDirection.textContent = "中线是节拍；按键落在左边是提前，右边是滞后。";
  }
  renderCalibrationSamples();
}

function renderCalibrationSamples() {
  if (!calibrationSamples) return;
  calibrationSamples.replaceChildren();
  for (let index = 0; index < CALIBRATION_PULSES; index++) {
    const record = calibration.sampleRecords.find((sample) => sample.index === index);
    const dot = document.createElement("span");
    dot.className = "calibration-sample-dot";
    if (index === calibration.currentPulseIndex && calibration.active) {
      dot.classList.add("is-current");
    }
    if (record) {
      dot.classList.add("is-hit", `is-${getDeltaTone(record.delta)}`);
      dot.title = `第 ${index + 1} 次：${formatTapDelta(record.delta)}`;
    } else {
      dot.title = `第 ${index + 1} 次`;
    }
    calibrationSamples.append(dot);
  }
}

function showCalibrationDelta(delta, options = {}) {
  const rounded = Math.round(delta);
  const absolute = Math.abs(rounded);
  const tone = getDeltaTone(delta);
  const prefix = options.summary ? "整体" : "这次";
  if (absolute < 6) {
    setCalibrationDeltaText(`${prefix}几乎正好`, "perfect");
  } else {
    setCalibrationDeltaText(`${prefix}${rounded > 0 ? "慢了" : "快了"} ${absolute}ms`, tone);
  }
  if (!calibrationDirection) return;
  if (absolute < 6) {
    calibrationDirection.textContent = "按键几乎落在中线上，保持这个手感。";
  } else if (rounded > 0) {
    calibrationDirection.textContent = "按键落在中线右侧，表示你按在节拍之后。";
  } else {
    calibrationDirection.textContent = "按键落在中线左侧，表示你按在节拍之前。";
  }
}

function setCalibrationDeltaText(text, tone) {
  if (!calibrationDelta) return;
  calibrationDelta.classList.remove("is-early", "is-late", "is-perfect");
  if (tone && tone !== "neutral") {
    calibrationDelta.classList.add(`is-${tone}`);
  }
  calibrationDelta.textContent = text;
}

function addCalibrationHitMarker(delta) {
  if (!calibrationHitLayer) return;
  const boundedDelta = clamp(delta, -CALIBRATION_MATCH_WINDOW_MS, CALIBRATION_MATCH_WINDOW_MS);
  const marker = document.createElement("span");
  const left = 50 + (boundedDelta / CALIBRATION_MATCH_WINDOW_MS) * 44;
  marker.className = `calibration-hit-marker is-${getDeltaTone(delta)}`;
  marker.style.left = `${left}%`;
  marker.textContent = formatSignedMs(Math.round(delta));
  marker.title = formatTapDelta(delta);
  calibrationHitLayer.append(marker);
  const timer = window.setTimeout(() => marker.classList.add("is-old"), 900);
  calibration.markerTimers.push(timer);
}

function clearCalibrationMarkerTimers() {
  for (const timer of calibration.markerTimers) {
    window.clearTimeout(timer);
  }
  calibration.markerTimers = [];
}

function getDeltaTone(delta) {
  if (Math.abs(delta) < 18) return "perfect";
  return delta > 0 ? "late" : "early";
}

function getCalibrationSummaryText(medianDelta, recommendedOffset) {
  const roundedDelta = Math.round(medianDelta);
  const absolute = Math.abs(roundedDelta);
  if (absolute < 6) {
    return `你的按键整体已经贴近节拍，推荐补偿为 ${formatSignedMs(recommendedOffset)}。`;
  }
  const direction = roundedDelta > 0 ? "偏晚" : "偏早";
  return `你的按键整体${direction} ${absolute}ms，推荐补偿为 ${formatSignedMs(recommendedOffset)}。`;
}

function openCalibrationPanel() {
  calibrationPanel.classList.remove("is-hidden");
  calibrationLabel.textContent = "延迟校准";
  calibration.recommendedOffset = null;
  calibrationApplyButton.disabled = true;
  calibrationStartButton.textContent = "开始测量";
  calibration.samples = [];
  calibration.sampleRecords = [];
  resetCalibrationVisualizer();
  updateOffsetReadout();
}

function closeCalibrationPanel() {
  if (!calibrationPanel || calibrationPanel.classList.contains("is-hidden")) return;
  stopCalibration();
  calibrationPanel.classList.add("is-hidden");
}

function stopCalibration() {
  calibration.active = false;
  for (const timer of calibration.timers) {
    window.clearTimeout(timer);
  }
  calibration.timers = [];
  calibration.currentPulseIndex = -1;
  calibrationBeatDot?.classList.remove("is-beat");
  renderCalibrationSamples();
}

function startCalibration() {
  stopCalibration();
  calibration.active = true;
  calibration.pulseTimes = [];
  calibration.usedPulseIndexes = new Set();
  calibration.samples = [];
  calibration.sampleRecords = [];
  resetCalibrationVisualizer();
  calibration.recommendedOffset = null;
  calibrationApplyButton.disabled = true;
  calibrationStartButton.textContent = "重新测量";
  calibrationLabel.textContent = "准备开始";
  calibrationResult.textContent = "看到中线星点亮起或听到提示音时，马上按 D/F/J/K/空格。每次脉冲只按一次。";
  calibrationDirection.textContent = "准备好后看中线：按得越接近中线，校准越准。";

  const firstPulseAt = performance.now() + CALIBRATION_LEAD_MS;
  for (let index = 0; index < CALIBRATION_PULSES; index++) {
    const pulseAt = firstPulseAt + index * CALIBRATION_INTERVAL_MS;
    calibration.pulseTimes.push(pulseAt);
    calibration.timers.push(window.setTimeout(
      () => fireCalibrationPulse(index),
      Math.max(0, pulseAt - performance.now())
    ));
  }
  calibration.timers.push(window.setTimeout(
    finishCalibration,
    CALIBRATION_LEAD_MS + CALIBRATION_PULSES * CALIBRATION_INTERVAL_MS + 360
  ));
}

function fireCalibrationPulse(index) {
  if (!calibration.active) return;
  calibration.currentPulseIndex = index;
  calibrationLabel.textContent = `第 ${index + 1} / ${CALIBRATION_PULSES} 次`;
  retriggerAnimation(calibrationPulse, "is-beat");
  retriggerAnimation(calibrationBeatDot, "is-beat");
  renderCalibrationSamples();
  playCalibrationClick(880, 0.055, 0.055);
}

function recordCalibrationHit() {
  if (!calibration.active) return;
  const now = performance.now();
  let bestIndex = -1;
  let bestAbsDelta = Infinity;
  let bestDelta = 0;

  for (let index = 0; index < calibration.pulseTimes.length; index++) {
    if (calibration.usedPulseIndexes.has(index)) continue;
    const delta = now - calibration.pulseTimes[index];
    const absDelta = Math.abs(delta);
    if (absDelta < bestAbsDelta) {
      bestIndex = index;
      bestAbsDelta = absDelta;
      bestDelta = delta;
    }
  }

  if (bestIndex === -1 || bestAbsDelta > CALIBRATION_MATCH_WINDOW_MS) {
    calibrationResult.textContent = "这次离脉冲太远，等下一次光环亮起再按。";
    setCalibrationDeltaText("离节拍太远", "neutral");
    calibrationDirection.textContent = "等中线星点亮起时再按，这样才会被计入样本。";
    return;
  }

  calibration.usedPulseIndexes.add(bestIndex);
  calibration.samples.push(bestDelta);
  calibration.sampleRecords.push({ index: bestIndex, delta: bestDelta });
  retriggerAnimation(calibrationPulse, "is-hit");
  playCalibrationClick(1180, 0.032, 0.035);
  addCalibrationHitMarker(bestDelta);
  showCalibrationDelta(bestDelta);
  renderCalibrationSamples();
  calibrationResult.textContent = `已记录 ${calibration.samples.length} / ${CALIBRATION_PULSES} 次。刚才${formatTapDelta(bestDelta)}。`;
}

function finishCalibration() {
  if (!calibration.active) return;
  calibration.active = false;
  calibration.currentPulseIndex = -1;
  calibrationBeatDot?.classList.remove("is-beat");
  renderCalibrationSamples();
  if (calibration.samples.length < 4) {
    calibrationLabel.textContent = "记录次数不够";
    calibrationResult.textContent = `只记录到 ${calibration.samples.length} / ${CALIBRATION_PULSES} 次。再测一次，尽量每次光环亮起都按一下。`;
    setCalibrationDeltaText("样本太少", "neutral");
    calibrationDirection.textContent = "至少记录 4 次，才能判断你整体是提前还是滞后。";
    calibrationApplyButton.disabled = true;
    return;
  }

  const medianDelta = getMedian(calibration.samples);
  const recommendedOffset = clamp(Math.round(-medianDelta), -180, 180);
  calibration.recommendedOffset = recommendedOffset;
  calibrationLabel.textContent = "推荐值已生成";
  showCalibrationDelta(medianDelta, { summary: true });
  calibrationDirection.textContent = getCalibrationSummaryText(medianDelta, recommendedOffset);
  calibrationResult.textContent = `已记录 ${calibration.samples.length} 次。推荐延迟：${formatSignedMs(recommendedOffset)}，直接点“应用推荐值”即可。`;
  calibrationApplyButton.disabled = false;
}

function applyCalibration() {
  if (calibration.recommendedOffset == null) return;
  app.setCalibrationOffset(calibration.recommendedOffset);
  calibration.recommendedOffset = null;
  calibrationApplyButton.disabled = true;
  updateOffsetReadout({ updateResult: false });
  calibrationResult.textContent = `已应用延迟：${formatSignedMs(app.getCalibrationOffset())}。可以关闭后试玩，也可以重新测量。`;
  setCalibrationDeltaText(`已应用 ${formatSignedMs(app.getCalibrationOffset())}`, "neutral");
  calibrationDirection.textContent = "这个补偿值已保存到本机，之后进入游戏会自动使用。";
}

function adjustCalibrationFromPanel(deltaMs) {
  app.setCalibrationOffset(app.getCalibrationOffset() + deltaMs);
  calibration.recommendedOffset = null;
  calibrationApplyButton.disabled = true;
  updateOffsetReadout({ updateResult: false });
  calibrationResult.textContent = `手动微调后：${formatSignedMs(app.getCalibrationOffset())}。${getManualOffsetHint(deltaMs)}`;
  setCalibrationDeltaText(`当前延迟 ${formatSignedMs(app.getCalibrationOffset())}`, "neutral");
  calibrationDirection.textContent = getManualOffsetHint(deltaMs);
}

function resetCalibrationFromPanel() {
  app.setCalibrationOffset(0);
  calibration.recommendedOffset = null;
  calibrationApplyButton.disabled = true;
  updateOffsetReadout({ updateResult: false });
  calibrationResult.textContent = "已重置为 0ms。";
  setCalibrationDeltaText("当前延迟 0ms", "neutral");
  calibrationDirection.textContent = "重置后可以重新测量，或直接关闭面板进入游戏。";
}

function retriggerAnimation(element, className) {
  if (!element) return;
  element.classList.remove(className);
  void element.offsetWidth;
  element.classList.add(className);
  window.setTimeout(() => element.classList.remove(className), 380);
}

function playCalibrationClick(frequency, duration, gainValue) {
  const AudioContextClass = window.AudioContext ?? window.webkitAudioContext;
  if (!AudioContextClass) return;
  if (!calibration.audioContext) {
    calibration.audioContext = new AudioContextClass();
  }
  const audioContext = calibration.audioContext;
  audioContext.resume?.();
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  const now = audioContext.currentTime;
  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(frequency, now);
  gain.gain.setValueAtTime(0.001, now);
  gain.gain.exponentialRampToValueAtTime(gainValue, now + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
  oscillator.connect(gain);
  gain.connect(audioContext.destination);
  oscillator.start(now);
  oscillator.stop(now + duration + 0.02);
}

function getMedian(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2) return sorted[middle];
  return (sorted[middle - 1] + sorted[middle]) / 2;
}

function formatSignedMs(value) {
  return `${value > 0 ? "+" : ""}${value}ms`;
}

function formatTapDelta(value) {
  const rounded = Math.round(value);
  if (Math.abs(rounded) < 6) return "几乎正好踩在脉冲上";
  return rounded > 0 ? `慢了 ${Math.abs(rounded)}ms` : `快了 ${Math.abs(rounded)}ms`;
}

function getManualOffsetHint(deltaMs) {
  return deltaMs < 0 ? "适合游戏里经常显示“过晚”的情况。" : "适合游戏里经常显示“过早”的情况。";
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

startButton.addEventListener("click", async () => {
  const buttonRect = startButton.getBoundingClientRect();
  dismissOverlay();
  await app.startRhythm({
    origin: {
      x: buttonRect.left + buttonRect.width / 2,
      y: buttonRect.top + buttonRect.height / 2
    }
  });
});

revealPreviewButton?.addEventListener("click", () => {
  dismissOverlay();
  app.previewFinalReveal();
});

homeButton.addEventListener("click", () => {
  showStartOverlay();
});

restartButton.addEventListener("click", async () => {
  const buttonRect = restartButton.getBoundingClientRect();
  hideEndControls();
  showHomeButton();
  await app.startRhythm({
    origin: {
      x: buttonRect.left + buttonRect.width / 2,
      y: buttonRect.top + buttonRect.height / 2
    }
  });
});

endingAgainButton.addEventListener("click", () => {
  hideEndControls();
  app.previewFinalReveal();
});

calibrationButton.addEventListener("click", () => {
  openCalibrationPanel();
});

calibrationStartButton.addEventListener("click", () => {
  startCalibration();
});

calibrationApplyButton.addEventListener("click", () => {
  applyCalibration();
});

calibrationCloseButton.addEventListener("click", () => {
  closeCalibrationPanel();
});

calibrationLateButton.addEventListener("click", () => {
  adjustCalibrationFromPanel(-25);
});

calibrationEarlyButton.addEventListener("click", () => {
  adjustCalibrationFromPanel(25);
});

calibrationResetButton.addEventListener("click", () => {
  resetCalibrationFromPanel();
});

calibrationPanel.addEventListener("pointerdown", (event) => {
  if (event.target.closest("button")) return;
  event.preventDefault();
  recordCalibrationHit();
});

overlay.addEventListener("pointerdown", (event) => {
  if (event.button !== 0 || event.target.closest("button")) return;
  if (!calibrationPanel.classList.contains("is-hidden")) return;
  if (isIntroComplete()) return;
  event.preventDefault();
  advanceIntroSlide();
});

app.onEndingComplete = (summary) => {
  showEndControls(summary);
};

window.addEventListener("keydown", (event) => {
  if (calibrationPanel.classList.contains("is-hidden")) return;
  event.preventDefault();
  event.stopPropagation();
  if (event.repeat) return;
  if (event.code === "Escape") {
    closeCalibrationPanel();
    return;
  }
  if (event.code === "BracketLeft") {
    adjustCalibrationFromPanel(-25);
    return;
  }
  if (event.code === "BracketRight") {
    adjustCalibrationFromPanel(25);
    return;
  }
  if (event.code === "Backslash") {
    resetCalibrationFromPanel();
    return;
  }
  if (CALIBRATION_HIT_CODES.has(event.code)) {
    recordCalibrationHit();
  }
}, { capture: true });

window.addEventListener("keydown", (event) => {
  if (event.code === "Space" && !event.repeat && !overlay.classList.contains("is-hidden") && calibrationPanel.classList.contains("is-hidden") && !isIntroComplete()) {
    event.preventDefault();
    advanceIntroSlide();
    return;
  }
  if (event.code === "Escape" && overlay.classList.contains("is-hidden")) {
    event.preventDefault();
    showStartOverlay();
    return;
  }
  if (event.code === "KeyR") {
    hideEndControls();
  }
});

const searchParams = new URLSearchParams(window.location.search);
if (searchParams.has("previewResults")) {
  stopIntroSequence();
  app.setIntroScene({ active: false });
  overlay.classList.add("is-hidden");
  showHomeButton();
  app.previewFinalReveal({ mutedEndingVideo: true, disableEndingVideo: true });
  showEndControls({
    rank: "S",
    score: 464000,
    maxCombo: 464,
    accuracy: 100,
    completion: 100,
    totalJudged: 464,
    hitCount: 464,
    missCount: 0
  }, { saveBest: false });
} else if (searchParams.has("previewReveal")) {
  stopIntroSequence();
  app.setIntroScene({ active: false });
  overlay.classList.add("is-hidden");
  showHomeButton();
  app.previewFinalReveal({
    mutedEndingVideo: true,
    skipToVideo: searchParams.has("previewVideo")
  });
} else if (searchParams.has("demo")) {
  stopIntroSequence();
  app.setIntroScene({ active: false });
  overlay.classList.add("is-hidden");
  showHomeButton();
  app.startDemo({
    speed: searchParams.get("demoSpeed") ?? 4,
    start: searchParams.get("demoStart") ?? 0,
    section: searchParams.get("demoSection")
  });
}
