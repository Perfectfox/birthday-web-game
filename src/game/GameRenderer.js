export class GameRenderer {
  constructor(canvas, ctx) {
    this.canvas = canvas;
    this.ctx = ctx;
    this.orbs = [];
    this.laneFlashes = [0, 0, 0, 0];
    this.laneColdFlashes = [0, 0, 0, 0];
    this.judgements = [];
    this.systemMessages = [];
    this.revealBuffer = null;
    this.stageDust = [];
    this.burstParticles = [];
    this.starImpacts = [];
    this.comboBanners = [];
    this.trackDissolveParticles = [];
    this.downbeatRings = [];
    this.stageClock = 0;
    this.stagePulse = 0;
    this.lastComboMilestone = 0;
    this.activeSectionId = null;
    this.lastDownbeatTime = -Infinity;
    this.width = canvas.width;
    this.height = canvas.height;
    this.introScene = {
      active: false,
      step: 0,
      markerGroup: null,
      final: false
    };
    this.introBrightness = 0;
    this.introSceneChangedAt = 0;
    this.introMarkerCache = new WeakMap();
  }

  setIntroScene(scene = {}) {
    const nextScene = {
      active: Boolean(scene?.active),
      step: scene?.step ?? 0,
      markerGroup: scene?.markerGroup ?? null,
      final: Boolean(scene?.final)
    };
    if (
      nextScene.active !== this.introScene.active
      || nextScene.markerGroup !== this.introScene.markerGroup
      || nextScene.step !== this.introScene.step
    ) {
      this.introSceneChangedAt = this.stageClock;
    }
    this.introScene = nextScene;
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.floor(rect.width * ratio);
    this.canvas.height = Math.floor(rect.height * ratio);
    this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.width = rect.width;
    this.height = rect.height;
    this.stageDust = createStageDust(this.width, this.height, Math.round(clamp(this.width / 14, 54, 130)));
  }

  spawnOrb({ fromLane, targetStar, state, accent }) {
    const lane = this.getLaneGeometry(fromLane);
    this.orbs.push({
      x0: lane.center,
      y0: this.height * 0.82,
      x1: targetStar.screenX ?? this.width * targetStar.x,
      y1: targetStar.screenY ?? this.height * targetStar.y,
      state,
      accent,
      age: 0,
      duration: 760,
      seed: Math.random() * Math.PI * 2,
      impactTriggered: false
    });
  }

  pressLane(lane) {
    this.laneFlashes[lane] = 160;
    this.stagePulse = Math.min(1, this.stagePulse + 0.16);
  }

  showJudgement(result, lane, calibrationOffset = 0) {
    const judgement = result?.judgement ?? "empty";
    const delta = result?.delta;
    const text = formatJudgement(judgement, delta);
    if (!text) return;
    const laneGeometry = this.getLaneGeometry(lane);
    this.judgements.push({
      text,
      judgement,
      x: laneGeometry.center,
      y: this.height * 0.74,
      age: 0,
      duration: judgement === "perfect" || judgement === "good" ? 520 : 720,
      calibrationOffset
    });
    if (judgement === "miss" || judgement === "bad") {
      this.laneColdFlashes[lane] = 190;
    }
    this.spawnJudgementBurst(judgement, laneGeometry.center, this.height * 0.84);
  }

  showSystemMessage(text) {
    this.systemMessages.push({
      text,
      age: 0,
      duration: 900
    });
  }

  clearTransientEffects() {
    this.orbs = [];
    this.judgements = [];
    this.systemMessages = [];
    this.burstParticles = [];
    this.starImpacts = [];
    this.comboBanners = [];
    this.trackDissolveParticles = [];
    this.downbeatRings = [];
    this.laneFlashes = [0, 0, 0, 0];
    this.laneColdFlashes = [0, 0, 0, 0];
    this.stagePulse = 0;
    this.lastComboMilestone = 0;
    this.activeSectionId = null;
    this.lastDownbeatTime = -Infinity;
  }

  render({ delta, starField, rhythm, state, portraitImage, contourData, finalReveal, startCeremony, endingVideo, endingVideoState }) {
    this.updateTransientEffects(delta);
    this.updateIntroBrightness(delta, rhythm);
    this.syncComboMilestone(state);
    const songContext = this.getSongContext(rhythm, state);
    this.syncSongSection(songContext);
    this.syncDownbeatPulse(rhythm, songContext);
    this.ctx.clearRect(0, 0, this.width, this.height);
    this.drawStarMap(starField, rhythm, state, songContext);
    const gameplayAlpha = finalReveal?.active ? clamp(1 - finalReveal.progress * 5, 0, 1) : 1;
    this.drawSectionLightCurtain(songContext, gameplayAlpha);
    const portraitReveal = endingVideoState?.active
      ? {
        ...finalReveal,
        alphaScale: 1 - smoothstep(endingVideoState.visualFadeProgress ?? 0)
      }
      : finalReveal;
    this.drawFinalPortraitReveal(portraitImage, contourData, portraitReveal);
    const lateConstellationPreview = songContext.active
      ? 0.045 * smoothstep((songContext.endingBoost - 0.28) / 0.72)
      : 0;
    this.drawContourStars(starField, this.getContourStarAlpha(finalReveal), {
      showGhost: !finalReveal?.active && !endingVideoState?.active && (!rhythm?.isPlaying || lateConstellationPreview > 0.001),
      ghostAlpha: rhythm?.isPlaying ? lateConstellationPreview : startCeremony?.active ? 0 : 0.1
    });
    this.drawIntroStarMarkers(starField);
    const showRhythmTrack = Boolean(rhythm?.isPlaying || startCeremony?.active);
    if (showRhythmTrack) {
      this.drawRhythmLanes(rhythm, gameplayAlpha, songContext);
    }
    this.drawDownbeatRings(gameplayAlpha);
    this.drawTrackDissolve();
    if (showRhythmTrack) {
      this.drawNotes(rhythm, gameplayAlpha, songContext);
    }
    this.drawOrbs(delta, songContext);
    this.drawStarImpacts();
    this.drawBurstParticles();
    this.drawJudgements();
    if (rhythm?.isPlaying) {
      this.drawHud(state, rhythm, gameplayAlpha, songContext);
    }
    this.drawComboBanners(gameplayAlpha);
    this.drawStartCeremony(startCeremony);
    this.drawEndingVideo(endingVideo, endingVideoState, portraitImage, contourData);
    this.drawSystemMessages();
  }

  updateTransientEffects(delta) {
    this.stageClock += delta;
    this.stagePulse = Math.max(0, this.stagePulse - delta / 520);
    this.laneFlashes = this.laneFlashes.map((value) => Math.max(0, value - delta));
    this.laneColdFlashes = this.laneColdFlashes.map((value) => Math.max(0, value - delta));
    for (const item of this.judgements) item.age += delta;
    for (const item of this.systemMessages) item.age += delta;
    for (const item of this.burstParticles) item.age += delta;
    for (const item of this.starImpacts) item.age += delta;
    for (const item of this.comboBanners) item.age += delta;
    for (const item of this.trackDissolveParticles) item.age += delta;
    for (const item of this.downbeatRings) item.age += delta;
    this.judgements = this.judgements.filter((item) => item.age < item.duration);
    this.systemMessages = this.systemMessages.filter((item) => item.age < item.duration);
    this.burstParticles = this.burstParticles.filter((item) => item.age < item.duration);
    this.starImpacts = this.starImpacts.filter((item) => item.age < item.duration);
    this.comboBanners = this.comboBanners.filter((item) => item.age < item.duration);
    this.trackDissolveParticles = this.trackDissolveParticles.filter((item) => item.age < item.duration);
    this.downbeatRings = this.downbeatRings.filter((item) => item.age < item.duration);
    this.burstParticles = limitTransientArray(this.burstParticles, 420);
    this.starImpacts = limitTransientArray(this.starImpacts, 80);
    this.comboBanners = limitTransientArray(this.comboBanners, 6);
    this.trackDissolveParticles = limitTransientArray(this.trackDissolveParticles, 180);
    this.downbeatRings = limitTransientArray(this.downbeatRings, 10);
  }

  updateIntroBrightness(delta, rhythm) {
    const target = this.introScene.active && !rhythm?.isPlaying ? 1 : 0;
    const duration = target > this.introBrightness ? 420 : 1900;
    const step = delta / duration;
    if (target > this.introBrightness) {
      this.introBrightness = Math.min(target, this.introBrightness + step);
    } else {
      this.introBrightness = Math.max(target, this.introBrightness - step);
    }
  }

  triggerTrackDissolve() {
    const layout = this.getLaneLayout();
    const count = Math.round(clamp(this.width / 12, 72, 140));
    for (let i = 0; i < count; i++) {
      const lane = Math.floor(Math.random() * 4);
      const laneY = lerp(layout.top, layout.bottom, Math.random());
      const laneGeometry = this.getLaneGeometryAt(lane, laneY);
      const x = lerp(laneGeometry.x + 6, laneGeometry.x + laneGeometry.width - 6, Math.random());
      const outward = x < this.width / 2 ? -1 : 1;
      this.trackDissolveParticles.push({
        x,
        y: laneY,
        vx: outward * lerp(18, 92, Math.random()) + lerp(-16, 16, Math.random()),
        vy: lerp(-110, -24, Math.random()),
        age: 0,
        duration: lerp(980, 1680, Math.random()),
        radius: lerp(0.9, 2.8, Math.random()),
        warm: Math.random() > 0.28
      });
    }
    this.stagePulse = Math.min(1.6, this.stagePulse + 1.1);
    this.comboBanners.push({
      text: "CONSTELLATION FORMED",
      tier: "large",
      age: 0,
      duration: 1900
    });
  }

  syncComboMilestone(state) {
    const combo = state?.combo ?? 0;
    if (combo <= 0) {
      this.lastComboMilestone = 0;
      return;
    }

    const milestone = Math.floor(combo / 25) * 25;
    if (milestone < 25 || milestone <= this.lastComboMilestone) return;
    this.lastComboMilestone = milestone;
    const tier = milestone % 100 === 0 ? "large" : milestone % 50 === 0 ? "medium" : "small";
    this.stagePulse = Math.min(1.4, this.stagePulse + (tier === "large" ? 0.95 : tier === "medium" ? 0.7 : 0.48));
    this.comboBanners.push({
      text: `${milestone} 连击`,
      tier,
      age: 0,
      duration: tier === "large" ? 1500 : 1150
    });
    this.spawnComboSweep(tier);
  }

  getSongContext(rhythm, state) {
    const songEnd = rhythm?.notes?.at(-1)?.time
      ?? Math.round((rhythm?.beatmap?.analysis?.durationSeconds ?? 1) * 1000);
    const time = rhythm?.isPlaying ? rhythm.getTime() : 0;
    const progress = rhythm?.isPlaying ? clamp(time / songEnd, 0, 1) : 0;
    const sections = rhythm?.beatmap?.sections ?? [];
    const section = sections.find((item) => time >= item.start && time < item.end) ?? sections.at(-1) ?? null;
    const comboBoost = clamp((state?.combo ?? 0) / 120, 0, 1);
    const sectionEnergy = section?.energy ?? (rhythm?.isPlaying ? 0.55 : 0.32);
    const endingBoost = smoothstep((progress - 0.82) / 0.18);
    return {
      active: Boolean(rhythm?.isPlaying),
      time,
      songEnd,
      progress,
      sections,
      section,
      sectionId: section?.id ?? "idle",
      label: section?.label ?? "星图待机",
      mood: section?.mood ?? "quiet",
      energy: clamp(sectionEnergy + comboBoost * 0.12 + endingBoost * 0.18, 0, 1.25),
      comboBoost,
      endingBoost
    };
  }

  syncSongSection(songContext) {
    if (!songContext.active) {
      this.activeSectionId = null;
      return;
    }
    if (songContext.sectionId === this.activeSectionId) return;
    this.activeSectionId = songContext.sectionId;
    const tier = songContext.energy > 0.92 ? "large" : songContext.energy > 0.68 ? "medium" : "small";
    this.stagePulse = Math.min(1.4, this.stagePulse + songContext.energy * 0.58);
    this.comboBanners.push({
      text: songContext.label,
      tier,
      age: 0,
      duration: tier === "large" ? 1450 : 1050
    });
    this.spawnSectionSweep(songContext);
  }

  syncDownbeatPulse(rhythm, songContext) {
    if (!songContext.active || !rhythm?.notes?.length) {
      this.lastDownbeatTime = -Infinity;
      return;
    }
    const time = songContext.time;
    let downbeatTime = null;
    for (const note of rhythm.notes) {
      if (note.accent !== "downbeat") continue;
      if (note.time <= this.lastDownbeatTime || note.time > time) continue;
      if (time - note.time > 190) continue;
      downbeatTime = Math.max(downbeatTime ?? note.time, note.time);
    }
    if (downbeatTime == null) return;
    this.lastDownbeatTime = downbeatTime;
    const energy = clamp(songContext.energy, 0.2, 1.2);
    this.stagePulse = Math.min(1.6, this.stagePulse + 0.2 + energy * 0.22);
    this.downbeatRings.push({
      age: 0,
      duration: 660,
      energy,
      warm: songContext.mood !== "quiet" && songContext.mood !== "suspend"
    });
    this.spawnDownbeatSweep(songContext);
  }

  spawnDownbeatSweep(songContext) {
    const layout = this.getLaneLayout();
    const count = Math.round(lerp(8, 18, clamp(songContext.energy, 0, 1)));
    for (let i = 0; i < count; i++) {
      const lane = i % 4;
      const laneGeometry = this.getLaneGeometryAt(lane, layout.bottom);
      const direction = lane < 2 ? -1 : 1;
      this.burstParticles.push({
        x: laneGeometry.center + lerp(-14, 14, Math.random()),
        y: layout.bottom + lerp(-6, 10, Math.random()),
        vx: direction * lerp(24, 98, Math.random()),
        vy: lerp(-58, -16, Math.random()),
        age: 0,
        duration: lerp(440, 720, Math.random()),
        radius: lerp(0.9, 2.2, Math.random()),
        warm: Math.random() > (songContext.mood === "quiet" ? 0.56 : 0.18)
      });
    }
  }

  spawnSectionSweep(songContext) {
    const count = Math.round(lerp(12, 40, clamp(songContext.energy, 0, 1)));
    const warm = songContext.mood !== "quiet" && songContext.mood !== "suspend";
    for (let i = 0; i < count; i++) {
      const x = Math.random() * this.width;
      const y = lerp(this.height * 0.14, this.height * 0.58, Math.random());
      const drift = x < this.width / 2 ? 1 : -1;
      this.burstParticles.push({
        x,
        y,
        vx: drift * lerp(12, 72, Math.random()),
        vy: lerp(-26, 38, Math.random()),
        age: 0,
        duration: lerp(760, 1380, Math.random()),
        radius: lerp(0.8, 2.6, Math.random()),
        warm: warm ? Math.random() > 0.12 : Math.random() > 0.62
      });
    }
  }

  spawnComboSweep(tier) {
    const count = tier === "large" ? 54 : tier === "medium" ? 36 : 24;
    const centerX = this.width / 2;
    const centerY = this.height * 0.52;
    const baseSpeed = tier === "large" ? 180 : tier === "medium" ? 132 : 96;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.min(this.width, this.height) * lerp(0.08, 0.28, Math.random());
      this.burstParticles.push({
        x: centerX + Math.cos(angle) * radius,
        y: centerY + Math.sin(angle) * radius * 0.58,
        vx: Math.cos(angle) * lerp(baseSpeed * 0.35, baseSpeed, Math.random()),
        vy: Math.sin(angle) * lerp(baseSpeed * 0.18, baseSpeed * 0.46, Math.random()),
        age: 0,
        duration: tier === "large" ? 1200 : 860,
        radius: lerp(1.1, tier === "large" ? 3.5 : 2.8, Math.random()),
        warm: Math.random() > 0.18
      });
    }
  }

  drawStarMap(starField, rhythm, state, songContext) {
    const image = starField.backgroundImage;
    const introBright = smoothstep(this.introBrightness);
    const gameplayDark = 1 - introBright;
    const fitScale = Math.min(this.width / image.width, this.height / image.height);
    const stageBreath = 1 + Math.sin(this.stageClock * 0.00075) * 0.003 + (songContext?.endingBoost ?? 0) * 0.006;
    const scale = fitScale * (this.width > this.height ? 1.32 : 1.05) * stageBreath;
    const drawWidth = image.width * scale;
    const drawHeight = image.height * scale;
    const driftRange = Math.min(this.width, this.height) * 0.007;
    const driftX = Math.sin(this.stageClock * 0.00013) * driftRange;
    const driftY = Math.cos(this.stageClock * 0.00011) * driftRange * 0.62;
    const x = (this.width - drawWidth) / 2 + driftX;
    const y = (this.height - drawHeight) / 2 + driftY;
    this.starMapRect = { x, y, width: drawWidth, height: drawHeight };
    this.ctx.globalAlpha = lerp(0.76, 1, introBright);
    this.ctx.drawImage(image, x, y, drawWidth, drawHeight);
    this.ctx.globalAlpha = 1;

    const gradient = this.ctx.createLinearGradient(0, 0, 0, this.height);
    gradient.addColorStop(0, `rgba(2, 4, 10, ${lerp(0.18, 0.01, introBright)})`);
    gradient.addColorStop(0.58, `rgba(2, 4, 10, ${lerp(0.32, 0.05, introBright)})`);
    gradient.addColorStop(1, `rgba(2, 4, 10, ${lerp(0.82, 0.44, introBright)})`);
    this.ctx.fillStyle = gradient;
    this.ctx.fillRect(0, 0, this.width, this.height);
    if (gameplayDark > 0.001) {
      this.ctx.fillStyle = `rgba(2, 4, 10, ${0.16 * gameplayDark})`;
      this.ctx.fillRect(0, 0, this.width, this.height);
    }
    this.drawStageAtmosphere(rhythm, state, songContext);
  }

  drawStageAtmosphere(rhythm, state, songContext) {
    const comboBoost = clamp((state?.combo ?? 0) / 80, 0, 1);
    const playingBoost = rhythm?.isPlaying ? 1 : this.introScene.active ? 0.72 : 0.35;
    const songEnd = rhythm?.notes?.at(-1)?.time ?? 1;
    const songProgress = rhythm?.isPlaying ? clamp(rhythm.getTime() / songEnd, 0, 1) : 0;
    const endingBoost = songContext?.endingBoost ?? smoothstep((songProgress - 0.82) / 0.18);
    const sectionEnergy = songContext?.energy ?? 0.42;
    const chorusBoost = songContext?.mood === "chorus" || songContext?.mood === "finale" ? 1 : 0;
    const pulse = this.stagePulse + comboBoost * 0.3 + endingBoost * 0.38 + sectionEnergy * 0.12;
    const centerX = this.width / 2;
    const centerY = this.height * 0.52;
    const baseRadius = Math.min(this.width, this.height) * 0.42;

    this.ctx.save();
    this.drawObservatoryGrid(centerX, centerY, baseRadius, pulse, sectionEnergy, rhythm?.isPlaying);
    this.ctx.globalCompositeOperation = "screen";
    for (const dust of this.stageDust) {
      const twinkle = 0.5 + 0.5 * Math.sin(this.stageClock * dust.speed + dust.phase);
      const alpha = (0.06 + twinkle * (0.12 + sectionEnergy * 0.08) + pulse * 0.08 + endingBoost * 0.08) * playingBoost;
      this.ctx.beginPath();
      this.ctx.arc(dust.x, dust.y, dust.radius + comboBoost * 0.4, 0, Math.PI * 2);
      this.ctx.fillStyle = dust.warm
        ? `rgba(248, 212, 119, ${alpha})`
        : `rgba(134, 220, 255, ${alpha * 0.82})`;
      this.ctx.fill();
    }

    this.ctx.globalCompositeOperation = "source-over";
    this.ctx.strokeStyle = `rgba(134, 220, 255, ${0.07 + pulse * 0.15 + chorusBoost * 0.06})`;
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.arc(centerX, centerY, baseRadius * (1 + pulse * 0.012), 0, Math.PI * 2);
    this.ctx.stroke();
    this.ctx.strokeStyle = `rgba(248, 212, 119, ${0.05 + comboBoost * 0.1 + sectionEnergy * 0.08})`;
    this.ctx.beginPath();
    this.ctx.ellipse(centerX, centerY, baseRadius * 1.26, baseRadius * 0.72, -0.16, 0, Math.PI * 2);
    this.ctx.stroke();
    if (endingBoost > 0.01) {
      this.ctx.globalCompositeOperation = "screen";
      const glow = this.ctx.createRadialGradient(centerX, centerY, baseRadius * 0.12, centerX, centerY, baseRadius * 1.08);
      glow.addColorStop(0, `rgba(248, 212, 119, ${0.08 * endingBoost})`);
      glow.addColorStop(0.52, `rgba(134, 220, 255, ${0.05 * endingBoost})`);
      glow.addColorStop(1, "rgba(2, 4, 10, 0)");
      this.ctx.fillStyle = glow;
      this.ctx.fillRect(0, 0, this.width, this.height);
    }
    this.ctx.restore();
  }

  drawObservatoryGrid(centerX, centerY, baseRadius, pulse, sectionEnergy, isPlaying) {
    const alphaScale = (isPlaying ? 0.78 : 0.52) + sectionEnergy * 0.16;
    const rotation = Math.sin(this.stageClock * 0.00018) * 0.045;
    this.ctx.save();
    this.ctx.globalCompositeOperation = "source-over";
    this.ctx.translate(centerX, centerY);
    this.ctx.rotate(rotation);
    this.ctx.lineWidth = 1;

    for (let ring = 1; ring <= 3; ring++) {
      const radius = baseRadius * (0.42 + ring * 0.19) * (1 + pulse * 0.006);
      this.ctx.strokeStyle = `rgba(134, 220, 255, ${0.028 * alphaScale})`;
      this.ctx.beginPath();
      this.ctx.ellipse(0, 0, radius * 1.28, radius * 0.64, -0.1, 0, Math.PI * 2);
      this.ctx.stroke();
    }

    const spokeCount = this.width < 720 ? 8 : 12;
    for (let index = 0; index < spokeCount; index++) {
      const angle = (Math.PI * 2 * index) / spokeCount - Math.PI / 2;
      const inner = baseRadius * 0.22;
      const outer = baseRadius * 0.84;
      const x0 = Math.cos(angle) * inner;
      const y0 = Math.sin(angle) * inner * 0.62;
      const x1 = Math.cos(angle) * outer;
      const y1 = Math.sin(angle) * outer * 0.62;
      this.ctx.strokeStyle = `rgba(247, 251, 255, ${index % 3 === 0 ? 0.04 * alphaScale : 0.022 * alphaScale})`;
      this.ctx.beginPath();
      this.ctx.moveTo(x0, y0);
      this.ctx.lineTo(x1, y1);
      this.ctx.stroke();
    }

    if (this.width >= 760) {
      this.ctx.rotate(-rotation);
      this.ctx.textAlign = "center";
      this.ctx.textBaseline = "middle";
      this.ctx.font = "700 10px Microsoft YaHei, sans-serif";
      const labels = [
        ["N", 0, -baseRadius * 0.55],
        ["E", baseRadius * 0.72, 0],
        ["S", 0, baseRadius * 0.55],
        ["W", -baseRadius * 0.72, 0]
      ];
      for (const [label, x, y] of labels) {
        this.ctx.fillStyle = `rgba(247, 251, 255, ${0.16 * alphaScale})`;
        this.ctx.fillText(label, x, y);
      }
    }

    this.ctx.restore();
  }

  drawSectionLightCurtain(songContext, alpha = 1) {
    if (!songContext?.active || alpha <= 0.01) return;
    const energy = clamp(songContext.energy, 0, 1.25);
    const mood = songContext.mood ?? "quiet";
    const isFinale = mood === "finale";
    const isChorus = mood === "chorus" || isFinale;
    const isSuspended = mood === "suspend";
    const color = isSuspended ? "134, 220, 255" : isChorus ? "248, 212, 119" : "247, 251, 255";
    const alternateColor = isSuspended ? "248, 212, 119" : "134, 220, 255";
    const beamCount = isFinale ? 7 : isChorus ? 5 : isSuspended ? 4 : 3;
    const topY = this.height * 0.05;
    const bottomY = this.getLaneLayout().bottom + this.height * 0.06;
    const sway = Math.sin(this.stageClock * 0.0008) * this.width * 0.012;

    this.ctx.save();
    this.ctx.globalAlpha *= alpha;
    this.ctx.globalCompositeOperation = "screen";
    for (let index = 0; index < beamCount; index++) {
      const ratio = beamCount === 1 ? 0.5 : index / (beamCount - 1);
      const sideBias = (ratio - 0.5) * 2;
      const beamCenter = this.width * (0.18 + ratio * 0.64) + sway * sideBias;
      const beamTopWidth = this.width * (0.012 + energy * 0.006);
      const beamBottomWidth = this.width * (0.052 + energy * 0.018);
      const bottomCenter = this.width / 2 + sideBias * this.width * (0.12 + energy * 0.02);
      const beamAlpha = (0.035 + energy * 0.03) * (isChorus ? 1.22 : 0.82);
      const gradient = this.ctx.createLinearGradient(0, topY, 0, bottomY);
      gradient.addColorStop(0, `rgba(${color}, ${beamAlpha})`);
      gradient.addColorStop(0.45, `rgba(${alternateColor}, ${beamAlpha * 0.42})`);
      gradient.addColorStop(1, "rgba(2, 4, 10, 0)");
      this.ctx.beginPath();
      this.ctx.moveTo(beamCenter - beamTopWidth, topY);
      this.ctx.lineTo(beamCenter + beamTopWidth, topY);
      this.ctx.lineTo(bottomCenter + beamBottomWidth, bottomY);
      this.ctx.lineTo(bottomCenter - beamBottomWidth, bottomY);
      this.ctx.closePath();
      this.ctx.fillStyle = gradient;
      this.ctx.fill();
    }

    const scanPhase = 0.5 + 0.5 * Math.sin(this.stageClock * (isFinale ? 0.0046 : 0.0032));
    const scanY = lerp(this.height * 0.24, this.height * 0.66, scanPhase);
    const scanWidth = Math.min(this.width * 0.62, 820);
    const scanX = (this.width - scanWidth) / 2;
    const scan = this.ctx.createLinearGradient(scanX, scanY, scanX + scanWidth, scanY);
    scan.addColorStop(0, "rgba(2, 4, 10, 0)");
    scan.addColorStop(0.5, `rgba(${color}, ${(0.07 + energy * 0.06) * (isChorus || isSuspended ? 1 : 0.46)})`);
    scan.addColorStop(1, "rgba(2, 4, 10, 0)");
    this.ctx.strokeStyle = scan;
    this.ctx.lineWidth = isFinale ? 2.2 : 1.4;
    this.ctx.beginPath();
    this.ctx.moveTo(scanX, scanY);
    this.ctx.lineTo(scanX + scanWidth, scanY);
    this.ctx.stroke();

    if (isFinale) {
      const centerX = this.width / 2;
      const centerY = this.height * 0.5;
      const radius = Math.min(this.width, this.height) * 0.42;
      this.ctx.strokeStyle = `rgba(248, 212, 119, ${0.11 + energy * 0.05})`;
      this.ctx.lineWidth = 1;
      this.ctx.beginPath();
      this.ctx.ellipse(centerX, centerY, radius * 1.18, radius * 0.64, Math.sin(this.stageClock * 0.00025) * 0.08, 0, Math.PI * 2);
      this.ctx.stroke();
    }
    this.ctx.restore();
  }

  drawTrackDissolve() {
    if (!this.trackDissolveParticles.length) return;
    this.ctx.save();
    this.ctx.globalCompositeOperation = "screen";
    for (const item of this.trackDissolveParticles) {
      const t = item.age / item.duration;
      const alpha = 1 - smoothstep(t);
      const x = item.x + item.vx * t;
      const y = item.y + item.vy * t + 32 * t * t;
      this.ctx.beginPath();
      this.ctx.arc(x, y, item.radius * (1 - t * 0.32), 0, Math.PI * 2);
      this.ctx.fillStyle = item.warm
        ? `rgba(248, 212, 119, ${0.56 * alpha})`
        : `rgba(134, 220, 255, ${0.44 * alpha})`;
      this.ctx.fill();
    }
    this.ctx.restore();
  }

  drawDownbeatRings(alpha = 1) {
    if (!this.downbeatRings.length || alpha <= 0.01) return;
    const layout = this.getLaneLayout();
    const leftLane = this.getLaneGeometryAt(0, layout.bottom);
    const rightLane = this.getLaneGeometryAt(3, layout.bottom);
    const centerX = (leftLane.center + rightLane.center) / 2;
    const totalWidth = rightLane.x + rightLane.width - leftLane.x;
    const centerY = layout.bottom;
    this.ctx.save();
    this.ctx.globalAlpha *= alpha;
    this.ctx.globalCompositeOperation = "screen";
    for (const ring of this.downbeatRings) {
      const t = ring.age / ring.duration;
      const fade = 1 - smoothstep(t);
      const rx = lerp(totalWidth * 0.38, totalWidth * (0.84 + ring.energy * 0.12), t);
      const ry = lerp(8, 44 + ring.energy * 18, t);
      const color = ring.warm ? "248, 212, 119" : "134, 220, 255";
      this.ctx.strokeStyle = `rgba(${color}, ${0.34 * fade})`;
      this.ctx.lineWidth = 1.2 + ring.energy * 0.6;
      this.ctx.beginPath();
      this.ctx.ellipse(centerX, centerY, rx, ry, 0, 0, Math.PI * 2);
      this.ctx.stroke();

      this.ctx.strokeStyle = `rgba(247, 251, 255, ${0.18 * fade})`;
      this.ctx.lineWidth = 1;
      this.ctx.beginPath();
      this.ctx.moveTo(centerX - rx * 0.72, centerY);
      this.ctx.lineTo(centerX + rx * 0.72, centerY);
      this.ctx.stroke();
    }
    this.ctx.restore();
  }

  getContourStarAlpha(finalReveal) {
    if (!finalReveal?.active) return 1;
    return 1 - smoothstep((finalReveal.progress - 0.78) / 0.22);
  }

  drawContourStars(starField, alpha = 1, options = {}) {
    if (alpha <= 0.01) return;
    this.ctx.save();
    this.ctx.globalAlpha *= alpha;
    const rect = this.starMapRect;
    const showGhost = Boolean(options.showGhost);
    const ghostAlpha = options.ghostAlpha ?? 0.1;
    for (const star of starField.contourTargets) {
      star.screenX = rect.x + star.x * rect.width;
      star.screenY = rect.y + star.y * rect.height;
    }

    this.drawContourConnections(starField.contourTargets, showGhost, ghostAlpha);

    for (const star of starField.contourTargets) {
      if (star.state === "hidden") {
        if (!showGhost) continue;
        const shimmer = 0.72 + 0.28 * Math.sin(this.stageClock * 0.002 + star.contourIndex * 0.17);
        this.ctx.beginPath();
        this.ctx.arc(star.screenX, star.screenY, 1.05, 0, Math.PI * 2);
        this.ctx.fillStyle = `rgba(248, 212, 119, ${ghostAlpha * shimmer})`;
        this.ctx.shadowColor = `rgba(134, 220, 255, ${ghostAlpha * 0.7})`;
        this.ctx.shadowBlur = 3;
        this.ctx.fill();
        this.ctx.shadowBlur = 0;
        continue;
      }

      const lit = star.state === "lit";
      this.ctx.beginPath();
      this.ctx.arc(star.screenX, star.screenY, lit ? 2.2 : 1.5, 0, Math.PI * 2);
      this.ctx.fillStyle = lit ? "rgba(255, 234, 170, 0.96)" : "rgba(132, 158, 198, 0.45)";
      this.ctx.shadowColor = lit ? "rgba(255, 218, 130, 0.8)" : "rgba(120, 150, 190, 0.45)";
      this.ctx.shadowBlur = lit ? 7 : 4;
      this.ctx.fill();
      this.ctx.shadowBlur = 0;
    }
    this.ctx.restore();
  }

  drawIntroStarMarkers(starField) {
    if (!this.introScene.active || !this.starMapRect || !starField?.stars?.length) return;
    const group = this.introScene.markerGroup;
    const visibleMarkers = INTRO_STAR_MARKERS.filter((marker) => marker.groups.includes(group));
    if (!visibleMarkers.length) return;

    const age = Math.max(0, this.stageClock - this.introSceneChangedAt);
    const baseAlpha = smoothstep(age / 760) * (this.introScene.final ? 0.62 : 1);
    if (baseAlpha <= 0.01) return;

    const narrow = this.width < 720;
    const markers = narrow ? visibleMarkers.slice(0, 2) : visibleMarkers;

    this.drawIntroConstellationLines(starField, group, baseAlpha);

    this.ctx.save();
    for (let index = 0; index < markers.length; index++) {
      const marker = markers[index];
      const star = this.getIntroStar(starField, marker.hip);
      if (!star) continue;
      const staggerAlpha = smoothstep((age - index * 120) / 620) * baseAlpha;
      if (staggerAlpha <= 0.01) continue;
      const point = this.projectStar(star);
      if (!this.isPointNearViewport(point.x, point.y, 80)) continue;
      this.drawIntroStarCallout(marker, point, staggerAlpha, narrow);
    }
    this.ctx.restore();
  }

  drawIntroConstellationLines(starField, group, alpha) {
    if (group !== "south" && group !== "ready") return;
    const segments = [
      [60877, 60514],
      [62223, 59605],
      [60877, 62223],
      [60514, 62223]
    ];
    this.ctx.save();
    this.ctx.globalCompositeOperation = "screen";
    this.ctx.lineCap = "round";
    for (const [fromHip, toHip] of segments) {
      const from = this.getIntroStar(starField, fromHip);
      const to = this.getIntroStar(starField, toHip);
      if (!from || !to) continue;
      const a = this.projectStar(from);
      const b = this.projectStar(to);
      this.ctx.strokeStyle = `rgba(134, 220, 255, ${0.16 * alpha})`;
      this.ctx.lineWidth = 1;
      this.ctx.beginPath();
      this.ctx.moveTo(a.x, a.y);
      this.ctx.lineTo(b.x, b.y);
      this.ctx.stroke();
    }
    this.ctx.restore();
  }

  drawIntroStarCallout(marker, point, alpha, narrow) {
    const pulse = 0.64 + 0.36 * Math.sin(this.stageClock * 0.004 + marker.hip * 0.01);
    const markerColor = marker.warm ? "248, 212, 119" : "134, 220, 255";
    const radius = marker.radius ?? 4.2;
    this.ctx.save();
    this.ctx.globalCompositeOperation = "screen";
    this.ctx.shadowColor = `rgba(${markerColor}, ${0.62 * alpha})`;
    this.ctx.shadowBlur = 16 + pulse * 12;
    this.ctx.fillStyle = `rgba(${markerColor}, ${0.8 * alpha})`;
    this.ctx.beginPath();
    this.ctx.arc(point.x, point.y, radius + pulse * 1.2, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.shadowBlur = 0;

    this.ctx.strokeStyle = `rgba(${markerColor}, ${0.32 * alpha})`;
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.arc(point.x, point.y, radius + 8 + pulse * 5, 0, Math.PI * 2);
    this.ctx.stroke();
    this.ctx.restore();

    if (narrow && marker.optionalOnNarrow) return;

    const label = this.getIntroLabelPlacement(marker, point, narrow);
    this.ctx.save();
    this.ctx.globalAlpha *= alpha;
    this.ctx.strokeStyle = `rgba(${markerColor}, 0.34)`;
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.moveTo(point.x, point.y);
    this.ctx.lineTo(label.leaderX, label.leaderY);
    this.ctx.stroke();

    this.ctx.fillStyle = "rgba(4, 8, 18, 0.58)";
    this.ctx.strokeStyle = "rgba(247, 251, 255, 0.16)";
    this.roundRect(label.x, label.y, label.width, label.height, 8);
    this.ctx.fill();
    this.ctx.stroke();

    this.ctx.textAlign = "left";
    this.ctx.textBaseline = "alphabetic";
    this.ctx.fillStyle = marker.warm ? "rgba(255, 233, 172, 0.96)" : "rgba(184, 232, 255, 0.96)";
    this.ctx.font = `${narrow ? 12 : 13}px Microsoft YaHei, sans-serif`;
    this.ctx.fillText(marker.name, label.x + 11, label.y + 18);
    if (!narrow) {
      this.ctx.fillStyle = "rgba(219, 230, 244, 0.62)";
      this.ctx.font = "10px Microsoft YaHei, sans-serif";
      this.ctx.fillText(marker.note, label.x + 11, label.y + 34);
    }
    this.ctx.restore();
  }

  getIntroLabelPlacement(marker, point, narrow) {
    const labelWidth = narrow ? 106 : 148;
    const labelHeight = narrow ? 30 : 42;
    const offsetScale = narrow ? 0.72 : 1;
    let x = point.x + marker.dx * offsetScale;
    let y = point.y + marker.dy * offsetScale;
    x = clamp(x, 14, this.width - labelWidth - 14);
    y = clamp(y, 14, this.height - labelHeight - 14);
    const leaderX = x > point.x ? x : x + labelWidth;
    const leaderY = clamp(y + labelHeight * 0.5, y + 8, y + labelHeight - 8);
    return { x, y, width: labelWidth, height: labelHeight, leaderX, leaderY };
  }

  getIntroStar(starField, hip) {
    let cache = this.introMarkerCache.get(starField);
    if (!cache) {
      cache = new Map(starField.stars.map((star) => [star.hip, star]));
      this.introMarkerCache.set(starField, cache);
    }
    return cache.get(hip);
  }

  projectStar(star) {
    const rect = this.starMapRect;
    return {
      x: rect.x + star.x * rect.width,
      y: rect.y + star.y * rect.height
    };
  }

  isPointNearViewport(x, y, margin) {
    return x >= -margin && x <= this.width + margin && y >= -margin && y <= this.height + margin;
  }

  drawContourConnections(targets, showGhost, ghostAlpha) {
    if (!targets.length) return;
    const maxDistance = Math.min(this.width, this.height) * 0.035;
    this.ctx.save();
    this.ctx.lineCap = "round";
    this.ctx.lineJoin = "round";
    for (let index = 1; index < targets.length; index++) {
      const previous = targets[index - 1];
      const current = targets[index];
      const previousVisible = previous.state !== "hidden" || showGhost;
      const currentVisible = current.state !== "hidden" || showGhost;
      if (!previousVisible || !currentVisible) continue;
      const dx = current.screenX - previous.screenX;
      const dy = current.screenY - previous.screenY;
      const distance = Math.hypot(dx, dy);
      if (distance > maxDistance) continue;
      const bothHidden = previous.state === "hidden" && current.state === "hidden";
      const bothLit = previous.state === "lit" && current.state === "lit";
      const alpha = bothHidden
        ? ghostAlpha * 0.24
        : bothLit
          ? 0.18
          : 0.09;
      this.ctx.strokeStyle = bothLit
        ? `rgba(255, 234, 170, ${alpha})`
        : `rgba(134, 220, 255, ${alpha})`;
      this.ctx.lineWidth = bothLit ? 0.85 : 0.55;
      this.ctx.beginPath();
      this.ctx.moveTo(previous.screenX, previous.screenY);
      this.ctx.lineTo(current.screenX, current.screenY);
      this.ctx.stroke();
    }
    this.ctx.restore();
  }

  drawFinalPortraitReveal(image, contourData, finalReveal) {
    if (!image || !this.starMapRect || !finalReveal?.active) return;
    const alpha = smoothstep(finalReveal.progress) * 0.68 * (finalReveal.alphaScale ?? 1);
    if (alpha <= 0.01) return;

    const placement = this.getPortraitRevealPlacement(image, contourData);
    if (!placement) return;
    const { sx, sy, sw, sh, drawX, drawY, drawWidth, drawHeight } = placement;

    const buffer = this.getRevealBuffer(Math.ceil(drawWidth), Math.ceil(drawHeight));
    const bufferCtx = buffer.getContext("2d");
    bufferCtx.clearRect(0, 0, buffer.width, buffer.height);
    bufferCtx.filter = "brightness(1.12) contrast(1.03) saturate(1.04)";
    bufferCtx.drawImage(image, sx, sy, sw, sh, 0, 0, buffer.width, buffer.height);
    bufferCtx.filter = "none";

    bufferCtx.globalCompositeOperation = "destination-in";
    const mask = bufferCtx.createRadialGradient(
      buffer.width * 0.5,
      buffer.height * 0.48,
      Math.min(buffer.width, buffer.height) * 0.2,
      buffer.width * 0.5,
      buffer.height * 0.52,
      Math.max(buffer.width, buffer.height) * 0.7
    );
    mask.addColorStop(0, "rgba(0, 0, 0, 1)");
    mask.addColorStop(0.54, "rgba(0, 0, 0, 1)");
    mask.addColorStop(0.8, "rgba(0, 0, 0, 0.62)");
    mask.addColorStop(1, "rgba(0, 0, 0, 0.06)");
    bufferCtx.fillStyle = mask;
    bufferCtx.fillRect(0, 0, buffer.width, buffer.height);
    this.applyRevealEdgeFeather(bufferCtx, buffer.width, buffer.height);
    bufferCtx.globalCompositeOperation = "source-over";

    this.ctx.save();
    this.ctx.globalAlpha = alpha * 0.98;
    this.ctx.globalCompositeOperation = "screen";
    this.ctx.drawImage(buffer, drawX, drawY, drawWidth, drawHeight);

    this.ctx.globalAlpha = alpha * 0.22;
    this.ctx.globalCompositeOperation = "source-over";
    this.ctx.drawImage(buffer, drawX, drawY, drawWidth, drawHeight);

    const vignette = this.ctx.createRadialGradient(
      drawX + drawWidth / 2,
      drawY + drawHeight * 0.48,
      Math.min(drawWidth, drawHeight) * 0.12,
      drawX + drawWidth / 2,
      drawY + drawHeight * 0.52,
      Math.max(drawWidth, drawHeight) * 0.62
    );
    vignette.addColorStop(0, `rgba(2, 4, 10, 0)`);
    vignette.addColorStop(0.78, `rgba(2, 4, 10, ${0.03 * alpha})`);
    vignette.addColorStop(1, `rgba(2, 4, 10, ${0.18 * alpha})`);
    this.ctx.fillStyle = vignette;
    this.ctx.fillRect(drawX, drawY, drawWidth, drawHeight);
    this.ctx.restore();
  }

  drawEndingVideo(video, videoState, portraitImage, contourData) {
    if (!video || !videoState?.active) return;
    const alpha = smoothstep(videoState.progress);
    const fadeOut = smoothstep(videoState.visualFadeProgress ?? 0);
    const videoAlpha = alpha * (1 - fadeOut);
    if (alpha <= 0.01) return;
    const placement = this.getPortraitRevealPlacement(portraitImage, contourData);
    if (!placement) {
      this.drawEndingCaptions(videoState);
      this.drawEndingAudioPrompt(videoState);
      return;
    }
    const { drawX, drawY, drawWidth, drawHeight } = placement;

    this.ctx.save();
    this.ctx.globalAlpha = alpha * lerp(0.18, 0.03, fadeOut);
    this.ctx.fillStyle = "#02040a";
    this.ctx.fillRect(0, 0, this.width, this.height);

    if (videoAlpha > 0.01 && video.readyState >= 2 && video.videoWidth && video.videoHeight) {
      const source = getCoverSourceRect(video.videoWidth, video.videoHeight, drawWidth, drawHeight);
      const buffer = this.getRevealBuffer(Math.ceil(drawWidth), Math.ceil(drawHeight));
      const bufferCtx = buffer.getContext("2d");
      bufferCtx.clearRect(0, 0, buffer.width, buffer.height);
      bufferCtx.drawImage(
        video,
        source.x,
        source.y,
        source.width,
        source.height,
        0,
        0,
        buffer.width,
        buffer.height
      );
      bufferCtx.globalCompositeOperation = "destination-in";
      this.applyRevealEdgeFeather(bufferCtx, buffer.width, buffer.height);
      bufferCtx.globalCompositeOperation = "source-over";
      this.ctx.globalAlpha = videoAlpha;
      this.ctx.drawImage(buffer, drawX, drawY, drawWidth, drawHeight);

      const gradient = this.ctx.createLinearGradient(0, drawY, 0, drawY + drawHeight);
      gradient.addColorStop(0, `rgba(2, 4, 10, ${0.18 * videoAlpha})`);
      gradient.addColorStop(0.45, "rgba(2, 4, 10, 0)");
      gradient.addColorStop(1, `rgba(2, 4, 10, ${0.32 * videoAlpha})`);
      this.ctx.fillStyle = gradient;
      this.ctx.fillRect(drawX, drawY, drawWidth, drawHeight);
    }
    this.ctx.restore();
    this.drawEndingCaptions(videoState);
    this.drawEndingAudioPrompt(videoState);
  }

  drawEndingAudioPrompt(videoState) {
    if (!videoState?.needsGesture) return;
    const pulse = 0.72 + Math.sin(this.stageClock * 0.004) * 0.18;
    const width = this.width < 720 ? Math.min(300, this.width - 48) : 330;
    const height = 44;
    const x = (this.width - width) / 2;
    const y = this.height - (this.width < 720 ? 118 : 142);
    this.ctx.save();
    this.ctx.globalAlpha = pulse;
    this.ctx.fillStyle = "rgba(5, 10, 22, 0.66)";
    this.ctx.strokeStyle = "rgba(248, 212, 119, 0.42)";
    this.ctx.lineWidth = 1;
    this.roundRect(x, y, width, height, 999);
    this.ctx.fill();
    this.ctx.stroke();
    this.ctx.shadowColor = "rgba(248, 212, 119, 0.4)";
    this.ctx.shadowBlur = 18;
    this.ctx.fillStyle = "rgba(255, 239, 184, 0.96)";
    this.ctx.textAlign = "center";
    this.ctx.font = `800 ${this.width < 720 ? 14 : 16}px Microsoft YaHei, sans-serif`;
    this.ctx.fillText("点击屏幕播放结尾声音", this.width / 2, y + 28);
    this.ctx.restore();
  }

  drawEndingCaptions(videoState) {
    const captions = videoState?.captions ?? [];
    if (!captions.length) return;
    const progress = smoothstep(videoState.captionProgress ?? 0);
    if (progress <= 0.01) return;

    const centerX = this.width / 2;
    const baseY = this.height < 720 ? this.height * 0.37 : this.height * 0.34;
    const firstProgress = smoothstep(clamp(progress * 1.28, 0, 1));
    const secondProgress = smoothstep(clamp((progress - 0.34) / 0.66, 0, 1));

    this.ctx.save();
    this.ctx.textAlign = "center";
    this.ctx.globalCompositeOperation = "source-over";

    const veilHeight = this.height < 720 ? 190 : 226;
    const veil = this.ctx.createRadialGradient(
      centerX,
      baseY + 28,
      12,
      centerX,
      baseY + 28,
      Math.min(this.width, this.height) * 0.48
    );
    veil.addColorStop(0, `rgba(2, 4, 10, ${0.32 * progress})`);
    veil.addColorStop(0.56, `rgba(2, 4, 10, ${0.16 * progress})`);
    veil.addColorStop(1, "rgba(2, 4, 10, 0)");
    this.ctx.fillStyle = veil;
    this.ctx.fillRect(0, baseY - veilHeight / 2, this.width, veilHeight);

    this.drawEndingCaptionLine({
      text: captions[0],
      y: baseY,
      progress: firstProgress,
      size: this.width < 720 ? 48 : 70,
      color: "255, 239, 184",
      shadow: "248, 212, 119"
    });
    if (captions[1]) {
      this.drawEndingCaptionLine({
        text: captions[1],
        y: baseY + (this.width < 720 ? 76 : 96),
        progress: secondProgress,
        size: this.width < 720 ? 30 : 40,
        color: "225, 240, 255",
        shadow: "134, 220, 255"
      });
    }
    this.ctx.restore();
  }

  drawEndingCaptionLine({ text, y, progress, size, color, shadow }) {
    if (!text || progress <= 0.01) return;
    const rise = (1 - progress) * 16;
    const scale = 0.94 + smoothstep(progress) * 0.06;
    const shimmer = 0.72 + Math.sin(this.stageClock * 0.0032) * 0.28;
    this.ctx.save();
    this.ctx.globalAlpha = progress;
    this.ctx.translate(this.width / 2, y + rise);
    this.ctx.scale(scale, scale);
    this.ctx.shadowColor = `rgba(${shadow}, ${(0.42 + shimmer * 0.16) * progress})`;
    this.ctx.shadowBlur = (26 + shimmer * 12) * progress;
    this.ctx.fillStyle = `rgba(${color}, ${0.96 * progress})`;
    this.ctx.font = `700 ${size}px STKaiti, KaiTi, Songti SC, PingFang SC, Microsoft YaHei, sans-serif`;
    this.ctx.fillText(text, 0, 0);
    this.ctx.shadowBlur = 0;

    const lineWidth = Math.min(this.width * 0.58, size * text.length * 0.86) * progress;
    const lineY = size * 0.5;
    const gradient = this.ctx.createLinearGradient(-lineWidth / 2, lineY, lineWidth / 2, lineY);
    gradient.addColorStop(0, "rgba(134, 220, 255, 0)");
    gradient.addColorStop(0.5, `rgba(${shadow}, ${0.32 * progress})`);
    gradient.addColorStop(1, "rgba(248, 212, 119, 0)");
    this.ctx.fillStyle = gradient;
    this.ctx.fillRect(-lineWidth / 2, lineY, lineWidth, 1);

    this.ctx.globalCompositeOperation = "screen";
    this.ctx.fillStyle = `rgba(255, 255, 255, ${0.18 * progress * shimmer})`;
    this.ctx.beginPath();
    this.ctx.arc(lineWidth * 0.36 * Math.sin(this.stageClock * 0.0018), lineY, Math.max(1.6, size * 0.055), 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.restore();
  }

  getPortraitRevealPlacement(image, contourData) {
    if (!image || !this.starMapRect) return null;
    const projection = contourData?.projection ?? {
      centerX: 0.5,
      centerY: 0.53,
      scaleX: 0.52,
      scaleY: 0.68
    };
    const bounds = contourData?.contentBounds ?? {
      x: 0,
      y: 0,
      width: 1,
      height: 1
    };
    const rect = this.starMapRect;
    const sx = image.width * bounds.x;
    const sy = image.height * bounds.y;
    const sw = image.width * bounds.width;
    const sh = image.height * bounds.height;
    const drawHeight = rect.height * projection.scaleY;
    const drawWidth = drawHeight * (sw / sh);
    const drawX = rect.x + rect.width * projection.centerX - drawWidth / 2;
    const drawY = rect.y + rect.height * projection.centerY - drawHeight / 2;
    return { sx, sy, sw, sh, drawX, drawY, drawWidth, drawHeight };
  }

  getRevealBuffer(width, height) {
    if (!this.revealBuffer) {
      this.revealBuffer = document.createElement("canvas");
    }
    if (this.revealBuffer.width !== width || this.revealBuffer.height !== height) {
      this.revealBuffer.width = width;
      this.revealBuffer.height = height;
    }
    return this.revealBuffer;
  }

  applyRevealEdgeFeather(ctx, width, height) {
    const left = width * 0.22;
    const right = width * 0.22;
    const top = height * 0.16;
    const bottom = height * 0.24;

    multiplyMask(ctx, width, height, [
      [0, 0.04],
      [left * 0.45, 0.48],
      [left, 1],
      [width, 1]
    ], "horizontal");
    multiplyMask(ctx, width, height, [
      [0, 1],
      [width - right, 1],
      [width - right * 0.45, 0.48],
      [width, 0.04]
    ], "horizontal");
    multiplyMask(ctx, width, height, [
      [0, 0.06],
      [top * 0.5, 0.52],
      [top, 1],
      [height, 1]
    ], "vertical");
    multiplyMask(ctx, width, height, [
      [0, 1],
      [height - bottom, 1],
      [height - bottom * 0.45, 0.48],
      [height, 0.04]
    ], "vertical");
  }

  drawRhythmLanes(rhythm, alpha = 1, songContext = null) {
    if (alpha <= 0.01) return;
    this.ctx.save();
    this.ctx.globalAlpha *= alpha;
    const sectionEnergy = songContext?.energy ?? 0.45;
    const chorusBoost = songContext?.mood === "chorus" || songContext?.mood === "finale" ? 1 : 0;
    const layout = this.getLaneLayout();
    const laneTop = layout.top;
    const laneBottom = layout.bottom;

    const shellTop = this.getLaneGeometryAt(0, laneTop);
    const shellTopEnd = this.getLaneGeometryAt(3, laneTop);
    const shellBottom = this.getLaneGeometryAt(0, laneBottom);
    const shellBottomEnd = this.getLaneGeometryAt(3, laneBottom);
    const shellGlow = this.ctx.createLinearGradient(0, laneTop, 0, laneBottom);
    shellGlow.addColorStop(0, `rgba(5, 10, 22, ${0.06 + sectionEnergy * 0.03})`);
    shellGlow.addColorStop(0.55, `rgba(5, 10, 22, ${0.28 + sectionEnergy * 0.08})`);
    shellGlow.addColorStop(1, `rgba(5, 10, 22, ${0.52 + sectionEnergy * 0.12})`);
    this.ctx.beginPath();
    this.ctx.moveTo(shellTop.x - 16, laneTop - 10);
    this.ctx.lineTo(shellTopEnd.x + shellTopEnd.width + 16, laneTop - 10);
    this.ctx.lineTo(shellBottomEnd.x + shellBottomEnd.width + 22, laneBottom + 58);
    this.ctx.lineTo(shellBottom.x - 22, laneBottom + 58);
    this.ctx.closePath();
    this.ctx.fillStyle = shellGlow;
    this.ctx.fill();

    for (let lane = 0; lane < 4; lane++) {
      const top = this.getLaneGeometryAt(lane, laneTop);
      const bottom = this.getLaneGeometryAt(lane, laneBottom);
      const flash = this.laneFlashes[lane] / 160;
      const coldFlash = this.laneColdFlashes[lane] / 190;
      const laneGradient = this.ctx.createLinearGradient(0, laneTop, 0, laneBottom);
      laneGradient.addColorStop(0, `rgba(134, 220, 255, ${0.014 + sectionEnergy * 0.018})`);
      laneGradient.addColorStop(0.72, `rgba(247, 251, 255, ${0.032 + sectionEnergy * 0.028})`);
      laneGradient.addColorStop(1, `rgba(248, 212, 119, ${0.07 + sectionEnergy * 0.06 + chorusBoost * 0.03})`);
      this.ctx.beginPath();
      this.ctx.moveTo(top.x + 2, laneTop);
      this.ctx.lineTo(top.x + top.width - 2, laneTop);
      this.ctx.lineTo(bottom.x + bottom.width - 3, laneBottom);
      this.ctx.lineTo(bottom.x + 3, laneBottom);
      this.ctx.closePath();
      this.ctx.fillStyle = laneGradient;
      this.ctx.fill();

      if (flash > 0) {
        const flashGradient = this.ctx.createLinearGradient(0, laneTop, 0, laneBottom);
        flashGradient.addColorStop(0, `rgba(134, 220, 255, ${0.04 * flash})`);
        flashGradient.addColorStop(1, `rgba(248, 212, 119, ${0.24 * flash})`);
        this.ctx.fillStyle = flashGradient;
        this.ctx.fill();
      }
      if (coldFlash > 0) {
        const coldGradient = this.ctx.createLinearGradient(0, laneTop, 0, laneBottom);
        coldGradient.addColorStop(0, `rgba(134, 220, 255, ${0.06 * coldFlash})`);
        coldGradient.addColorStop(1, `rgba(255, 159, 141, ${0.2 * coldFlash})`);
        this.ctx.fillStyle = coldGradient;
        this.ctx.fill();
      }

      this.ctx.strokeStyle = lane === 1 || lane === 2
        ? `rgba(248, 212, 119, ${0.14 + sectionEnergy * 0.08})`
        : `rgba(134, 220, 255, ${0.12 + sectionEnergy * 0.08})`;
      this.ctx.lineWidth = 1;
      this.ctx.stroke();

      this.ctx.shadowColor = coldFlash > 0
        ? "rgba(255, 159, 141, 0.58)"
        : flash > 0
          ? "rgba(248, 212, 119, 0.72)"
          : "rgba(134, 220, 255, 0.18)";
      this.ctx.shadowBlur = coldFlash > 0 ? 16 : flash > 0 ? 18 : 8;
      this.ctx.beginPath();
      this.ctx.moveTo(bottom.x + 7, laneBottom);
      this.ctx.lineTo(bottom.x + bottom.width - 7, laneBottom);
      this.ctx.strokeStyle = `rgba(247, 251, 255, ${0.22 + flash * 0.32})`;
      this.ctx.lineWidth = 2;
      this.ctx.stroke();
      this.ctx.shadowBlur = 0;

      this.drawLaneKeycap(rhythm?.beatmap?.lanes?.[lane] ?? "", bottom.center, laneBottom + 34, flash, coldFlash, sectionEnergy);
    }
    if (this.width < 720) {
      this.ctx.textAlign = "center";
      this.ctx.fillStyle = "rgba(247, 251, 255, 0.42)";
      this.ctx.font = "700 10px Microsoft YaHei, sans-serif";
      this.ctx.fillText("TAP LANES", this.width / 2, Math.min(this.height - 14, laneBottom + 58));
    }
    this.drawJudgementLine(layout);
    this.ctx.restore();
  }

  drawLaneKeycap(label, centerX, centerY, flash, coldFlash, sectionEnergy) {
    const width = Math.max(34, Math.min(44, this.width * 0.034));
    const height = 28;
    const x = centerX - width / 2;
    const y = centerY - height / 2;
    this.ctx.save();
    const glow = flash > 0 ? 0.24 + flash * 0.28 : 0.08 + sectionEnergy * 0.04;
    const fill = coldFlash > 0
      ? `rgba(255, 159, 141, ${0.12 + coldFlash * 0.14})`
      : `rgba(5, 10, 22, ${0.42 + flash * 0.16})`;
    this.ctx.fillStyle = fill;
    this.ctx.strokeStyle = coldFlash > 0
      ? `rgba(255, 159, 141, ${0.42 + coldFlash * 0.32})`
      : `rgba(248, 212, 119, ${0.2 + glow})`;
    this.ctx.lineWidth = 1;
    this.ctx.shadowColor = coldFlash > 0 ? "rgba(255, 159, 141, 0.46)" : "rgba(248, 212, 119, 0.42)";
    this.ctx.shadowBlur = flash > 0 || coldFlash > 0 ? 18 : 8;
    this.roundRect(x, y, width, height, 7);
    this.ctx.fill();
    this.ctx.stroke();
    this.ctx.shadowBlur = 0;

    this.ctx.fillStyle = "rgba(247, 251, 255, 0.94)";
    this.ctx.font = "800 16px Microsoft YaHei, sans-serif";
    this.ctx.textAlign = "center";
    this.ctx.textBaseline = "middle";
    this.ctx.fillText(label, centerX, centerY + 1);
    this.ctx.restore();
  }

  drawJudgementLine(layout) {
    const y = layout.bottom;
    const start = this.getLaneGeometryAt(0, y);
    const end = this.getLaneGeometryAt(3, y);
    const x0 = start.x - 18;
    const x1 = end.x + end.width + 18;
    const pulse = 0.55 + 0.45 * Math.sin(this.stageClock * 0.008);

    this.ctx.save();
    this.ctx.shadowColor = "rgba(248, 212, 119, 0.72)";
    this.ctx.shadowBlur = 18 + pulse * 10;
    this.ctx.strokeStyle = `rgba(248, 212, 119, ${0.62 + pulse * 0.2})`;
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.moveTo(x0, y);
    this.ctx.lineTo(x1, y);
    this.ctx.stroke();
    this.ctx.shadowBlur = 0;

    this.ctx.strokeStyle = "rgba(247, 251, 255, 0.2)";
    this.ctx.lineWidth = 1;
    for (let i = 0; i <= 16; i++) {
      const x = lerp(x0, x1, i / 16);
      const tick = i % 4 === 0 ? 11 : 6;
      this.ctx.beginPath();
      this.ctx.moveTo(x, y - tick);
      this.ctx.lineTo(x, y + tick);
      this.ctx.stroke();
    }
    this.ctx.restore();
  }

  drawNotes(rhythm, alpha = 1, songContext = null) {
    if (!rhythm || alpha <= 0.01) return;
    this.ctx.save();
    this.ctx.globalAlpha *= alpha;
    const sectionEnergy = songContext?.energy ?? 0.45;
    const time = rhythm.getTime();
    const visibleNotes = rhythm.getVisibleNotes();
    const preparedNotes = visibleNotes.map((note) => {
      const approachTime = rhythm.getNoteApproachTime?.(note) ?? rhythm.approachTime;
      const progress = 1 - (note.time - time) / approachTime;
      const y = lerp(this.getLaneLayout().top, this.getLaneLayout().bottom, progress);
      const lane = this.getLaneGeometryAt(note.lane, y);
      const isDouble = note.accent === "double";
      const isDownbeat = note.accent === "downbeat";
      const noteHeight = isDownbeat ? 30 : 23;
      const noteWidth = lane.width * (isDownbeat ? 0.72 : 0.64);
      const noteX = lane.center - noteWidth / 2;
      return { note, progress, y, lane, isDouble, isDownbeat, noteHeight, noteWidth, noteX };
    });

    this.drawDoubleNoteLinks(preparedNotes, sectionEnergy);

    for (const prepared of preparedNotes) {
      this.drawFallingStarNote(prepared, sectionEnergy);
    }
    this.ctx.restore();
  }

  drawFallingStarNote(prepared, sectionEnergy) {
    const { y, lane, isDouble, isDownbeat, noteWidth } = prepared;
    const x = lane.center;
    const color = isDouble ? "134, 220, 255" : "248, 212, 119";
    const coreColor = isDouble ? "214, 246, 255" : "255, 239, 184";
    const arrivalBoost = smoothstep(prepared.progress);
    const coreRadius = (isDownbeat ? 10.5 : 7.8) * (1 + sectionEnergy * 0.08 + arrivalBoost * 0.08);
    const outerRadius = coreRadius * (isDownbeat ? 2.15 : 1.82);
    const tailLength = (isDouble ? 112 : 86) * (1 + sectionEnergy * 0.34);
    const tailTop = y - tailLength;
    const tailHalfWidth = noteWidth * (isDownbeat ? 0.28 : 0.22);
    const headHalfWidth = noteWidth * (isDownbeat ? 0.46 : 0.36);

    this.ctx.save();
    this.ctx.globalCompositeOperation = "screen";

    const tail = this.ctx.createLinearGradient(0, tailTop, 0, y + coreRadius);
    tail.addColorStop(0, `rgba(${color}, 0)`);
    tail.addColorStop(0.58, `rgba(${color}, ${0.09 + sectionEnergy * 0.04})`);
    tail.addColorStop(1, `rgba(${color}, ${0.34 + arrivalBoost * 0.1})`);
    this.ctx.fillStyle = tail;
    this.ctx.beginPath();
    this.ctx.moveTo(x, tailTop);
    this.ctx.quadraticCurveTo(x - tailHalfWidth, y - tailLength * 0.38, x - headHalfWidth, y - coreRadius * 0.35);
    this.ctx.quadraticCurveTo(x, y + coreRadius * 0.45, x + headHalfWidth, y - coreRadius * 0.35);
    this.ctx.quadraticCurveTo(x + tailHalfWidth, y - tailLength * 0.38, x, tailTop);
    this.ctx.closePath();
    this.ctx.fill();

    this.ctx.strokeStyle = `rgba(${coreColor}, ${0.16 + arrivalBoost * 0.12})`;
    this.ctx.lineWidth = isDownbeat ? 1.4 : 1;
    this.ctx.beginPath();
    this.ctx.moveTo(x, y - outerRadius * 1.9);
    this.ctx.lineTo(x, y + outerRadius * 1.55);
    this.ctx.moveTo(x - outerRadius * 1.35, y);
    this.ctx.lineTo(x + outerRadius * 1.35, y);
    this.ctx.stroke();

    const halo = this.ctx.createRadialGradient(x, y, 1, x, y, outerRadius * 2.45);
    halo.addColorStop(0, `rgba(${coreColor}, 0.94)`);
    halo.addColorStop(0.28, `rgba(${color}, ${0.42 + arrivalBoost * 0.16})`);
    halo.addColorStop(1, `rgba(${color}, 0)`);
    this.ctx.fillStyle = halo;
    this.ctx.beginPath();
    this.ctx.arc(x, y, outerRadius * 2.45, 0, Math.PI * 2);
    this.ctx.fill();

    this.ctx.shadowColor = `rgba(${color}, 0.9)`;
    this.ctx.shadowBlur = (isDownbeat ? 25 : 18) + sectionEnergy * 10;
    this.ctx.fillStyle = `rgba(${coreColor}, 0.98)`;
    drawStarPath(this.ctx, x, y, outerRadius, coreRadius * 0.56, 4);
    this.ctx.fill();
    this.ctx.shadowBlur = 0;

    this.ctx.strokeStyle = `rgba(255, 255, 255, ${0.42 + arrivalBoost * 0.14})`;
    this.ctx.lineWidth = 1;
    drawStarPath(this.ctx, x, y, outerRadius, coreRadius * 0.56, 4);
    this.ctx.stroke();

    this.ctx.fillStyle = "rgba(255, 255, 255, 0.96)";
    this.ctx.beginPath();
    this.ctx.arc(x - coreRadius * 0.18, y - coreRadius * 0.2, Math.max(1.8, coreRadius * 0.24), 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.restore();
  }

  drawDoubleNoteLinks(preparedNotes, sectionEnergy) {
    const groups = new Map();
    for (const item of preparedNotes) {
      const key = Math.round(item.note.time);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    }

    this.ctx.save();
    this.ctx.globalCompositeOperation = "screen";
    for (const group of groups.values()) {
      if (group.length < 2 && !group[0]?.isDouble) continue;
      const linked = group.length >= 2 ? group : preparedNotes.filter((item) => Math.abs(item.note.time - group[0].note.time) <= 18);
      if (linked.length < 2) continue;
      linked.sort((a, b) => a.lane.center - b.lane.center);
      const first = linked[0];
      const last = linked[linked.length - 1];
      const y = linked.reduce((sum, item) => sum + item.y, 0) / linked.length;
      const progress = linked.reduce((sum, item) => sum + item.progress, 0) / linked.length;
      const arrivalBoost = smoothstep(progress);
      const alpha = clamp((0.16 + sectionEnergy * 0.08 + arrivalBoost * 0.12) * (1 - Math.max(0, progress - 1) * 0.4), 0, 0.38);
      const gradient = this.ctx.createLinearGradient(first.lane.center, y, last.lane.center, y);
      gradient.addColorStop(0, "rgba(134, 220, 255, 0.04)");
      gradient.addColorStop(0.5, `rgba(248, 212, 119, ${alpha})`);
      gradient.addColorStop(1, "rgba(134, 220, 255, 0.04)");
      this.ctx.strokeStyle = gradient;
      this.ctx.lineWidth = 2 + sectionEnergy * 0.8;
      this.ctx.shadowColor = "rgba(248, 212, 119, 0.38)";
      this.ctx.shadowBlur = 14;
      this.ctx.beginPath();
      this.ctx.moveTo(first.lane.center, y);
      this.ctx.lineTo(last.lane.center, y);
      this.ctx.stroke();
      this.ctx.shadowBlur = 0;
    }
    this.ctx.restore();
  }

  drawOrbs(delta, songContext = null) {
    const sectionEnergy = songContext?.energy ?? 0.45;
    const comboBoost = songContext?.comboBoost ?? 0;
    const endingBoost = songContext?.endingBoost ?? 0;
    const stageBoost = clamp(sectionEnergy * 0.65 + comboBoost * 0.42 + endingBoost * 0.46, 0, 1.5);
    for (const orb of this.orbs) {
      orb.age += delta;
      const t = clamp(orb.age / orb.duration, 0, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      const cx = (orb.x0 + orb.x1) / 2;
      const cy = Math.min(orb.y0, orb.y1) - this.height * 0.14;
      const x = quadratic(orb.x0, cx, orb.x1, ease);
      const y = quadratic(orb.y0, cy, orb.y1, ease);
      const lit = orb.state === "lit";
      const isDouble = orb.accent === "double";
      const color = lit ? "248, 212, 119" : "134, 220, 255";
      const alternateColor = lit ? "134, 220, 255" : "140, 165, 210";
      const tailAlpha = (lit ? 0.3 : 0.16) + stageBoost * (lit ? 0.15 : 0.08);
      const fade = 1 - smoothstep(t);
      this.ctx.save();
      this.ctx.globalCompositeOperation = "screen";

      this.ctx.beginPath();
      this.ctx.moveTo(orb.x0, orb.y0);
      this.ctx.quadraticCurveTo(cx, cy, x, y);
      this.ctx.strokeStyle = `rgba(${alternateColor}, ${tailAlpha * 0.34 * fade})`;
      this.ctx.lineWidth = (isDouble ? 6.5 : 5) + stageBoost * 2.2;
      this.ctx.shadowColor = `rgba(${color}, ${0.22 * fade})`;
      this.ctx.shadowBlur = 16 + stageBoost * 12;
      this.ctx.stroke();

      this.ctx.beginPath();
      this.ctx.moveTo(orb.x0, orb.y0);
      this.ctx.quadraticCurveTo(cx, cy, x, y);
      this.ctx.strokeStyle = `rgba(${color}, ${tailAlpha * fade})`;
      this.ctx.lineWidth = (isDouble ? 2.4 : 1.5) + stageBoost * 0.9;
      this.ctx.shadowBlur = 0;
      this.ctx.stroke();

      this.drawOrbTrailSparks(orb, { cx, cy, ease, lit, color, stageBoost, fade });

      this.ctx.beginPath();
      const radius = isDouble ? 7.2 : lit ? 5.7 : 4.2;
      this.ctx.arc(x, y, radius + stageBoost * 2.4, 0, Math.PI * 2);
      this.ctx.fillStyle = `rgba(${color}, ${0.08 + stageBoost * 0.04})`;
      this.ctx.fill();

      this.ctx.beginPath();
      this.ctx.arc(x, y, radius, 0, Math.PI * 2);
      this.ctx.fillStyle = lit ? "rgba(255, 235, 176, 0.95)" : "rgba(140, 165, 210, 0.62)";
      this.ctx.shadowColor = this.ctx.fillStyle;
      this.ctx.shadowBlur = lit ? 26 + stageBoost * 12 : 12;
      this.ctx.fill();
      this.ctx.shadowBlur = 0;

      if (isDouble || comboBoost > 0.38) {
        this.ctx.strokeStyle = `rgba(${color}, ${0.28 * fade})`;
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        this.ctx.arc(x, y, radius + 5 + stageBoost * 4, orb.seed, orb.seed + Math.PI * 1.35);
        this.ctx.stroke();
      }

      this.ctx.restore();
      if (!orb.impactTriggered && t >= 0.92) {
        orb.impactTriggered = true;
        this.spawnStarImpact(orb.x1, orb.y1, orb.state, orb.accent);
      }
    }
    this.orbs = this.orbs.filter((orb) => orb.age < orb.duration);
  }

  drawOrbTrailSparks(orb, { cx, cy, ease, lit, color, stageBoost, fade }) {
    if (!lit && stageBoost < 0.58) return;
    const count = Math.round(lerp(2, 6, clamp(stageBoost, 0, 1)));
    for (let index = 0; index < count; index++) {
      const sample = ease - 0.055 * (index + 1);
      if (sample <= 0 || sample >= 1) continue;
      const px = quadratic(orb.x0, cx, orb.x1, sample);
      const py = quadratic(orb.y0, cy, orb.y1, sample);
      const angle = orb.seed + index * 1.37 + this.stageClock * 0.002;
      const offset = (index % 2 === 0 ? 1 : -1) * (4 + stageBoost * 5);
      const alpha = (0.11 + stageBoost * 0.08) * fade * (1 - index / (count + 1));
      this.ctx.beginPath();
      this.ctx.arc(px + Math.cos(angle) * offset, py + Math.sin(angle) * offset * 0.62, 0.9 + stageBoost * 0.8, 0, Math.PI * 2);
      this.ctx.fillStyle = `rgba(${color}, ${alpha})`;
      this.ctx.fill();
    }
  }

  spawnStarImpact(x, y, state, accent) {
    const lit = state === "lit";
    const isDouble = accent === "double";
    this.starImpacts.push({
      x,
      y,
      lit,
      isDouble,
      age: 0,
      duration: lit ? 880 : 620,
      seed: Math.random() * Math.PI * 2
    });

    const count = lit ? (isDouble ? 18 : 12) : 8;
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.38;
      const speed = lit ? lerp(34, isDouble ? 96 : 72, Math.random()) : lerp(18, 42, Math.random());
      this.burstParticles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        age: 0,
        duration: lit ? 720 : 520,
        radius: lit ? lerp(1, 2.2, Math.random()) : lerp(0.8, 1.7, Math.random()),
        warm: lit
      });
    }
  }

  drawStarImpacts() {
    if (!this.starImpacts.length) return;
    this.ctx.save();
    this.ctx.globalCompositeOperation = "screen";
    for (const impact of this.starImpacts) {
      const t = impact.age / impact.duration;
      const alpha = 1 - smoothstep(t);
      const ringRadius = lerp(4, impact.lit ? (impact.isDouble ? 54 : 42) : 26, t);
      const coreRadius = lerp(7, 1.5, t);
      const color = impact.lit ? "248, 212, 119" : "134, 220, 255";

      this.ctx.strokeStyle = `rgba(${color}, ${0.48 * alpha})`;
      this.ctx.lineWidth = impact.isDouble ? 2.4 : 1.6;
      this.ctx.beginPath();
      this.ctx.arc(impact.x, impact.y, ringRadius, 0, Math.PI * 2);
      this.ctx.stroke();

      this.ctx.fillStyle = `rgba(${color}, ${0.42 * alpha})`;
      this.ctx.shadowColor = `rgba(${color}, ${0.72 * alpha})`;
      this.ctx.shadowBlur = impact.lit ? 22 : 12;
      this.ctx.beginPath();
      this.ctx.arc(impact.x, impact.y, coreRadius, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.shadowBlur = 0;

      if (impact.lit) {
        this.ctx.strokeStyle = `rgba(247, 251, 255, ${0.18 * alpha})`;
        this.ctx.beginPath();
        this.ctx.arc(impact.x, impact.y, ringRadius * 0.58, impact.seed, impact.seed + Math.PI * 1.2);
        this.ctx.stroke();
      }
    }
    this.ctx.restore();
  }

  spawnJudgementBurst(judgement, x, y) {
    if (judgement === "empty" || judgement === "early" || judgement === "late") return;
    const count = judgement === "perfect" ? 18 : judgement === "good" ? 12 : judgement === "miss" ? 10 : 7;
    const warm = judgement === "perfect" || judgement === "good";
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.32;
      const speed = lerp(34, judgement === "perfect" ? 96 : 64, Math.random());
      this.burstParticles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed * 0.46 - 18,
        age: 0,
        duration: judgement === "perfect" ? 520 : judgement === "miss" ? 620 : 420,
        radius: lerp(1.2, 2.7, Math.random()),
        warm
      });
    }
    this.stagePulse = Math.min(1, this.stagePulse + (judgement === "perfect" ? 0.28 : 0.16));
  }

  drawBurstParticles() {
    if (!this.burstParticles.length) return;
    this.ctx.save();
    this.ctx.globalCompositeOperation = "screen";
    for (const item of this.burstParticles) {
      const t = item.age / item.duration;
      const x = item.x + item.vx * t;
      const y = item.y + item.vy * t + 26 * t * t;
      const alpha = 1 - smoothstep(t);
      this.ctx.beginPath();
      this.ctx.arc(x, y, item.radius * (1 - t * 0.35), 0, Math.PI * 2);
      this.ctx.fillStyle = item.warm
        ? `rgba(248, 212, 119, ${0.68 * alpha})`
        : `rgba(134, 220, 255, ${0.42 * alpha})`;
      this.ctx.fill();
    }
    this.ctx.restore();
  }

  drawJudgements() {
    this.ctx.textAlign = "center";
    for (const item of this.judgements) {
      const t = item.age / item.duration;
      const alpha = 1 - t;
      const y = item.y - t * 42;
      const scale = 1 + (1 - smoothstep(t)) * 0.16;
      this.ctx.fillStyle = judgementColor(item.judgement, alpha);
      this.ctx.shadowColor = judgementColor(item.judgement, alpha * 0.55);
      this.ctx.shadowBlur = 18 * alpha;
      this.ctx.font = `${Math.round(18 * scale)}px Microsoft YaHei, sans-serif`;
      this.ctx.fillText(item.text, item.x, y);
      this.ctx.shadowBlur = 0;
    }
  }

  drawHud(state, rhythm, alpha = 1, songContext = null) {
    if (alpha <= 0.01) return;
    this.ctx.save();
    this.ctx.globalAlpha *= alpha;
    const hitCount = state.hitCount ?? 0;
    const missCount = state.missCount ?? 0;
    const totalJudged = hitCount + missCount;
    const accuracy = totalJudged ? Math.round((hitCount / totalJudged) * 100) : 100;
    const songEnd = rhythm?.notes?.at(-1)?.time ?? 1;
    const progress = rhythm?.isPlaying ? clamp(rhythm.getTime() / songEnd, 0, 1) : 0;

    if (this.width < 720) {
      this.drawCompactHud(state, accuracy, progress, songContext);
      this.ctx.restore();
      return;
    }

    this.drawHudPill(22, 20, 184, 66, "得分", String(state.score).padStart(6, "0"), "#f8d477");
    this.drawHudPill(22, 94, 184, 54, "命中 / 漏击", `${hitCount} / ${missCount}`, "#86dcff");
    this.drawHudPill(this.width - 206, 20, 184, 54, "延迟", `${rhythm?.calibrationOffset ?? 0} ms`, "#f7fbff");
    this.drawHudPill(this.width - 206, 82, 184, 54, "准度", `${accuracy}%`, "#f8d477");
    if (this.width >= 760) {
      this.drawHudPill(this.width - 206, 144, 184, 48, "段落", songContext?.label ?? "待机", "#86dcff");
    }

    const comboAlpha = clamp((state.combo ?? 0) / 18, 0.22, 1);
    this.ctx.globalAlpha *= comboAlpha;
    this.ctx.textAlign = "center";
    this.ctx.fillStyle = "rgba(248, 212, 119, 0.92)";
    this.ctx.shadowColor = "rgba(248, 212, 119, 0.44)";
    this.ctx.shadowBlur = 18;
    this.ctx.font = "800 46px Microsoft YaHei, sans-serif";
    this.ctx.fillText(`${state.combo ?? 0}`, this.width / 2, 62);
    this.ctx.shadowBlur = 0;
    this.ctx.font = "700 12px Microsoft YaHei, sans-serif";
    this.ctx.fillStyle = "rgba(247, 251, 255, 0.62)";
    this.ctx.fillText("连击", this.width / 2, 82);
    this.ctx.globalAlpha /= comboAlpha;

    this.drawSongProgress(progress, 104, songContext);
    this.ctx.restore();
  }

  drawCompactHud(state, accuracy, progress, songContext = null) {
    const margin = 12;
    const pillWidth = Math.min(138, (this.width - margin * 3) / 2);
    this.drawHudPill(margin, 14, pillWidth, 46, "得分", formatCompactNumber(state.score), "#f8d477");
    this.drawHudPill(this.width - margin - pillWidth, 14, pillWidth, 46, "连击", `${state.combo ?? 0}`, "#86dcff");
    this.ctx.textAlign = "center";
    this.ctx.fillStyle = "rgba(247, 251, 255, 0.58)";
    this.ctx.font = "700 10px Microsoft YaHei, sans-serif";
    this.ctx.fillText(`准度 ${accuracy}%`, this.width / 2, 56);
    this.drawSongProgress(progress, 74, songContext);
  }

  drawComboBanners(alpha = 1) {
    if (!this.comboBanners.length || alpha <= 0.01) return;
    this.ctx.save();
    this.ctx.globalAlpha *= alpha;
    this.ctx.textAlign = "center";
    for (const banner of this.comboBanners) {
      const t = banner.age / banner.duration;
      const reveal = 1 - smoothstep(Math.abs(t - 0.32) / 0.68);
      if (reveal <= 0.01) continue;
      const scale = banner.tier === "large" ? 1.18 : banner.tier === "medium" ? 1.04 : 0.94;
      const y = this.height * 0.21 - smoothstep(t) * 18;
      const width = banner.tier === "large" ? 280 : 230;
      const height = 38;
      const x = this.width / 2 - width / 2;

      this.ctx.save();
      this.ctx.globalAlpha *= reveal;
      const glow = banner.tier === "large" ? 0.42 : 0.28;
      this.ctx.fillStyle = `rgba(3, 8, 18, ${0.32 * reveal})`;
      this.roundRect(x, y - height / 2, width, height, 8);
      this.ctx.fill();
      this.ctx.strokeStyle = `rgba(248, 212, 119, ${0.38 * reveal})`;
      this.ctx.lineWidth = 1;
      this.ctx.stroke();
      this.ctx.shadowColor = `rgba(248, 212, 119, ${glow * reveal})`;
      this.ctx.shadowBlur = banner.tier === "large" ? 30 : 18;
      this.ctx.fillStyle = `rgba(248, 212, 119, ${0.94 * reveal})`;
      this.ctx.font = `${Math.round(20 * scale)}px Microsoft YaHei, sans-serif`;
      this.ctx.fillText(banner.text, this.width / 2, y + 7);
      this.ctx.shadowBlur = 0;
      this.ctx.restore();
    }
    this.ctx.restore();
  }

  drawStartCeremony(ceremony) {
    if (!ceremony?.active) return;
    const t = clamp(ceremony.progress, 0, 1);
    const fadeOut = 1 - smoothstep((t - 0.72) / 0.28);
    if (fadeOut <= 0.01) return;

    const layout = this.getLaneLayout();
    const origin = ceremony.origin ?? { x: this.width / 2, y: this.height * 0.46 };
    const target = { x: this.width / 2, y: layout.bottom };
    const control = {
      x: (origin.x + target.x) / 2,
      y: Math.min(origin.y, target.y) - this.height * 0.18
    };
    const flyT = smoothstep(clamp(t / 0.72, 0, 1));
    const orbX = quadratic(origin.x, control.x, target.x, flyT);
    const orbY = quadratic(origin.y, control.y, target.y, flyT);
    const phase = getStartCeremonyPhase(t);
    const label = phase.label;
    const phaseProgress = (t - phase.start) / (phase.end - phase.start);
    const labelScale = phase.numeric
      ? 1.15 + (1 - smoothstep(phaseProgress)) * 0.22
      : 1 + (1 - smoothstep(phaseProgress)) * 0.12;

    this.ctx.save();
    this.ctx.globalAlpha = fadeOut;
    const veil = this.ctx.createRadialGradient(
      this.width / 2,
      this.height * 0.5,
      Math.min(this.width, this.height) * 0.12,
      this.width / 2,
      this.height * 0.5,
      Math.max(this.width, this.height) * 0.68
    );
    veil.addColorStop(0, "rgba(2, 4, 10, 0)");
    veil.addColorStop(1, "rgba(2, 4, 10, 0.34)");
    this.ctx.fillStyle = veil;
    this.ctx.fillRect(0, 0, this.width, this.height);

    this.ctx.globalCompositeOperation = "screen";
    this.ctx.beginPath();
    this.ctx.moveTo(origin.x, origin.y);
    this.ctx.quadraticCurveTo(control.x, control.y, orbX, orbY);
    this.ctx.strokeStyle = `rgba(248, 212, 119, ${0.42 * (1 - flyT * 0.34)})`;
    this.ctx.lineWidth = 2.2;
    this.ctx.stroke();

    const ringRadius = lerp(18, 74, smoothstep(t));
    this.ctx.strokeStyle = `rgba(134, 220, 255, ${0.18 * fadeOut})`;
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.arc(target.x, target.y, ringRadius, 0, Math.PI * 2);
    this.ctx.stroke();

    this.ctx.shadowColor = "rgba(248, 212, 119, 0.88)";
    this.ctx.shadowBlur = 28;
    this.ctx.fillStyle = "rgba(255, 239, 184, 0.98)";
    this.ctx.beginPath();
    this.ctx.arc(orbX, orbY, lerp(8, 5, flyT), 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.shadowBlur = 0;

    this.ctx.globalCompositeOperation = "source-over";
    this.ctx.textAlign = "center";
    this.ctx.fillStyle = `rgba(247, 251, 255, ${0.82 * fadeOut})`;
    this.ctx.font = `${Math.round((phase.numeric ? 36 : 28) * labelScale)}px Microsoft YaHei, sans-serif`;
    this.ctx.fillText(label, this.width / 2, this.height * 0.36);

    this.ctx.fillStyle = `rgba(248, 212, 119, ${0.62 * fadeOut})`;
    this.ctx.font = "700 12px Microsoft YaHei, sans-serif";
    this.ctx.fillText("OBSERVATORY LINE ONLINE", this.width / 2, this.height * 0.36 + 28);
    this.ctx.restore();
  }

  drawHudPill(x, y, width, height, label, value, accent) {
    this.ctx.save();
    this.ctx.fillStyle = "rgba(3, 8, 18, 0.46)";
    this.ctx.strokeStyle = "rgba(247, 251, 255, 0.14)";
    this.ctx.lineWidth = 1;
    this.roundRect(x, y, width, height, 8);
    this.ctx.fill();
    this.ctx.stroke();

    this.ctx.fillStyle = accent;
    this.ctx.globalAlpha *= 0.82;
    this.ctx.fillRect(x + 12, y + 12, 3, height - 24);
    this.ctx.globalAlpha /= 0.82;

    this.ctx.textAlign = "left";
    this.ctx.fillStyle = "rgba(247, 251, 255, 0.58)";
    this.ctx.font = "700 10px Microsoft YaHei, sans-serif";
    this.ctx.fillText(label, x + 24, y + 22);
    this.ctx.fillStyle = "rgba(247, 251, 255, 0.94)";
    const valueFontSize = fitTextSize(this.ctx, String(value), width - 36, 20, 13);
    this.ctx.font = `800 ${valueFontSize}px Microsoft YaHei, sans-serif`;
    this.ctx.fillText(value, x + 24, y + height - 14);
    this.ctx.restore();
  }

  drawSongProgress(progress, y = 104, songContext = null) {
    const width = this.width < 720 ? Math.min(320, this.width - 48) : Math.min(420, this.width * 0.32);
    const x = (this.width - width) / 2;
    const height = 5;
    this.ctx.fillStyle = "rgba(247, 251, 255, 0.09)";
    this.roundRect(x, y, width, height, 3);
    this.ctx.fill();
    const filled = width * progress;
    if (filled > 1) {
      const fill = this.ctx.createLinearGradient(x, y, x + width, y);
      fill.addColorStop(0, "rgba(134, 220, 255, 0.48)");
      fill.addColorStop(0.62, "rgba(248, 212, 119, 0.78)");
      fill.addColorStop(1, "rgba(255, 239, 184, 0.92)");
      this.ctx.fillStyle = fill;
      this.roundRect(x, y, filled, height, 3);
      this.ctx.fill();
      const playheadX = x + filled;
      this.ctx.beginPath();
      this.ctx.arc(playheadX, y + height / 2, 4.2, 0, Math.PI * 2);
      this.ctx.fillStyle = "rgba(255, 239, 184, 0.95)";
      this.ctx.shadowColor = "rgba(248, 212, 119, 0.72)";
      this.ctx.shadowBlur = 12;
      this.ctx.fill();
      this.ctx.shadowBlur = 0;
    }
    this.drawSongSectionMarkers(x, y, width, songContext);
  }

  drawSongSectionMarkers(x, y, width, songContext) {
    const songEnd = songContext?.songEnd ?? 0;
    const sections = songContext?.sections ?? [];
    if (!songEnd || sections.length < 2) return;
    this.ctx.save();
    for (const section of sections) {
      if (!section.start) continue;
      const markerX = x + width * clamp(section.start / songEnd, 0, 1);
      const active = section.id === songContext.sectionId;
      this.ctx.strokeStyle = active ? "rgba(248, 212, 119, 0.62)" : "rgba(247, 251, 255, 0.24)";
      this.ctx.lineWidth = active ? 1.4 : 1;
      this.ctx.beginPath();
      this.ctx.moveTo(markerX, y - (active ? 6 : 4));
      this.ctx.lineTo(markerX, y + (active ? 11 : 8));
      this.ctx.stroke();
    }
    this.ctx.restore();
  }

  drawSystemMessages() {
    this.ctx.textAlign = "center";
    this.ctx.font = "700 18px Microsoft YaHei, sans-serif";
    for (const message of this.systemMessages) {
      const alpha = 1 - message.age / message.duration;
      this.ctx.fillStyle = `rgba(247, 251, 255, ${alpha})`;
      this.ctx.fillText(message.text, this.width / 2, this.height * 0.12);
    }
  }

  getLaneGeometry(lane) {
    return this.getLaneGeometryAt(lane, this.getLaneLayout().bottom);
  }

  getLaneFromPoint(x, y) {
    const layout = this.getLaneLayout();
    const hitTop = layout.bottom - Math.max(120, this.height * 0.16);
    const hitBottom = Math.min(this.height, layout.bottom + 76);
    if (y < hitTop || y > hitBottom) return null;
    const geometryY = clamp(y, layout.top, layout.bottom);
    for (let lane = 0; lane < 4; lane++) {
      const geometry = this.getLaneGeometryAt(lane, geometryY);
      const padding = Math.max(12, geometry.width * 0.18);
      if (x >= geometry.x - padding && x <= geometry.x + geometry.width + padding) {
        return lane;
      }
    }
    return null;
  }

  getLaneLayout() {
    const bottomWidth = Math.min(96, Math.max(70, this.width * 0.058));
    const topWidth = bottomWidth * 0.56;
    return {
      top: this.height * 0.15,
      bottom: this.height * 0.84,
      topWidth,
      bottomWidth
    };
  }

  getLaneGeometryAt(lane, y) {
    const layout = this.getLaneLayout();
    const t = clamp((y - layout.top) / (layout.bottom - layout.top), 0, 1);
    const width = lerp(layout.topWidth, layout.bottomWidth, t);
    const totalWidth = width * 4;
    const startX = (this.width - totalWidth) / 2;
    const x = startX + lane * width;
    return { x, width, center: x + width / 2 };
  }

  roundRect(x, y, width, height, radius) {
    this.ctx.beginPath();
    this.ctx.moveTo(x + radius, y);
    this.ctx.arcTo(x + width, y, x + width, y + height, radius);
    this.ctx.arcTo(x + width, y + height, x, y + height, radius);
    this.ctx.arcTo(x, y + height, x, y, radius);
    this.ctx.arcTo(x, y, x + width, y, radius);
    this.ctx.closePath();
  }
}

const INTRO_STAR_MARKERS = [
  {
    hip: 32258,
    name: "天狼星",
    note: "西方最亮的星",
    groups: ["anchor"],
    dx: 46,
    dy: -58,
    warm: false,
    radius: 4.8
  },
  {
    hip: 30361,
    name: "老人星",
    note: "南天的明灯",
    groups: ["anchor", "memory"],
    dx: 42,
    dy: 34,
    warm: false,
    radius: 4.6
  },
  {
    hip: 69434,
    name: "大角星",
    note: "东北方升起",
    groups: ["anchor"],
    dx: -154,
    dy: 32,
    warm: false,
    radius: 4.3
  },
  {
    hip: 71440,
    name: "南门二",
    note: "最近的恒星邻居",
    groups: ["south", "ready"],
    dx: 54,
    dy: 50,
    warm: false,
    radius: 4.5
  },
  {
    hip: 68466,
    name: "哈达尔",
    note: "半人马座亮星",
    groups: ["south"],
    dx: 56,
    dy: -56,
    warm: true,
    radius: 4.2
  },
  {
    hip: 60514,
    name: "南十字座",
    note: "Acrux 一带",
    groups: ["south", "ready"],
    dx: -166,
    dy: 44,
    warm: true,
    radius: 4.4
  },
  {
    hip: 80500,
    name: "心宿二",
    note: "天蝎座红星",
    groups: ["memory"],
    dx: -146,
    dy: -48,
    warm: false,
    radius: 4.1
  },
  {
    hip: 7573,
    name: "水委一",
    note: "南天低处",
    groups: ["memory"],
    dx: 42,
    dy: -58,
    warm: false,
    radius: 4,
    optionalOnNarrow: true
  }
];

function lerp(a, b, t) {
  return a + (b - a) * clamp(t, 0, 1);
}

function quadratic(a, b, c, t) {
  return (1 - t) * (1 - t) * a + 2 * (1 - t) * t * b + t * t * c;
}

function drawStarPath(ctx, x, y, outerRadius, innerRadius, points) {
  ctx.beginPath();
  for (let index = 0; index < points * 2; index++) {
    const radius = index % 2 === 0 ? outerRadius : innerRadius;
    const angle = -Math.PI / 2 + (index * Math.PI) / points;
    const px = x + Math.cos(angle) * radius;
    const py = y + Math.sin(angle) * radius;
    if (index === 0) {
      ctx.moveTo(px, py);
    } else {
      ctx.lineTo(px, py);
    }
  }
  ctx.closePath();
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function smoothstep(value) {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

function getStartCeremonyPhase(progress) {
  if (progress < 0.22) return { label: "准备", start: 0, end: 0.22, numeric: false };
  if (progress < 0.38) return { label: "3", start: 0.22, end: 0.38, numeric: true };
  if (progress < 0.54) return { label: "2", start: 0.38, end: 0.54, numeric: true };
  if (progress < 0.7) return { label: "1", start: 0.54, end: 0.7, numeric: true };
  return { label: "开始", start: 0.7, end: 1, numeric: false };
}

function getCoverSourceRect(sourceWidth, sourceHeight, targetWidth, targetHeight) {
  const sourceRatio = sourceWidth / sourceHeight;
  const targetRatio = targetWidth / targetHeight;
  if (sourceRatio > targetRatio) {
    const width = sourceHeight * targetRatio;
    return {
      x: (sourceWidth - width) / 2,
      y: 0,
      width,
      height: sourceHeight
    };
  }
  const height = sourceWidth / targetRatio;
  return {
    x: 0,
    y: (sourceHeight - height) / 2,
    width: sourceWidth,
    height
  };
}

function createStageDust(width, height, count) {
  const dust = [];
  for (let i = 0; i < count; i++) {
    dust.push({
      x: Math.random() * width,
      y: Math.random() * height,
      radius: lerp(0.7, 2.2, Math.random()),
      phase: Math.random() * Math.PI * 2,
      speed: lerp(0.0015, 0.0042, Math.random()),
      warm: Math.random() > 0.58
    });
  }
  return dust;
}

function fitTextSize(ctx, text, maxWidth, preferred, minimum) {
  let size = preferred;
  while (size > minimum) {
    ctx.font = `800 ${size}px Microsoft YaHei, sans-serif`;
    if (ctx.measureText(text).width <= maxWidth) return size;
    size -= 1;
  }
  return minimum;
}

function limitTransientArray(items, maxItems) {
  if (items.length <= maxItems) return items;
  return items.slice(items.length - maxItems);
}

function formatCompactNumber(value) {
  const number = Number(value ?? 0);
  if (number >= 1000000) return `${(number / 1000000).toFixed(1)}M`;
  if (number >= 10000) return `${Math.round(number / 1000)}K`;
  return String(number);
}

function multiplyMask(ctx, width, height, stops, direction) {
  const gradient = direction === "vertical"
    ? ctx.createLinearGradient(0, 0, 0, height)
    : ctx.createLinearGradient(0, 0, width, 0);
  const size = direction === "vertical" ? height : width;
  for (const [position, alpha] of stops) {
    gradient.addColorStop(clamp(position / size, 0, 1), `rgba(0, 0, 0, ${alpha})`);
  }
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

function formatJudgement(judgement, delta) {
  if (judgement === "empty") return "空按";
  if (judgement === "early") return `过早 ${Math.abs(Math.round(delta))}ms`;
  if (judgement === "late") return `过晚 ${Math.abs(Math.round(delta))}ms`;
  if (judgement === "miss") return "漏击";
  if (judgement === "bad") return `偏差 ${Math.abs(Math.round(delta))}ms`;
  if (judgement === "good") return `良好 ${Math.abs(Math.round(delta))}ms`;
  if (judgement === "perfect") return `完美 ${Math.abs(Math.round(delta))}ms`;
  return "";
}

function judgementColor(judgement, alpha) {
  const colors = {
    perfect: [255, 235, 176],
    good: [152, 224, 255],
    bad: [255, 171, 126],
    early: [190, 204, 255],
    late: [255, 164, 188],
    empty: [180, 190, 210]
  };
  const [r, g, b] = colors[judgement] ?? colors.empty;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
