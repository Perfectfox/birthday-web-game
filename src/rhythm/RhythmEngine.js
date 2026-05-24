export class RhythmEngine {
  constructor(beatmap, audio) {
    this.beatmap = beatmap;
    this.originalAudio = audio;
    this.audio = audio;
    this.approachTime = beatmap.approachTime ?? 1600;
    this.perfectWindow = 70;
    this.goodWindow = 145;
    this.badWindow = 210;
    this.missWindow = 250;
    this.openingApproachTime = beatmap.openingApproachTime ?? this.approachTime;
    this.openingLeadIn = beatmap.openingLeadIn ?? 720;
    this.musicStartTime = beatmap.musicStartTime ?? 0;
    this.calibrationOffset = Number(localStorage.getItem("rhythmCalibrationOffset") ?? 0);
    this.timeScale = 1;
    this.audioEnded = false;
    this.originalAudio?.addEventListener("ended", () => {
      if (this.audio === this.originalAudio && this.isPlaying) {
        this.audioEnded = true;
      }
    });
    this.reset();
  }

  reset() {
    const playableFrom = this.musicStartTime > 0
      ? this.musicStartTime + this.openingLeadIn
      : 0;
    const playableNotes = this.beatmap.notes.filter((note) => note.time >= playableFrom);
    this.skippedOpeningNotes = this.beatmap.notes.length - playableNotes.length;
    this.notes = playableNotes.map((note, index) => ({
      ...note,
      index,
      state: "pending"
    }));
    this.firstNoteTime = this.notes[0]?.time ?? 0;
    this.openingVisibilityTime = this.firstNoteTime
      ? this.firstNoteTime - this.getNoteApproachTime(this.notes[0])
      : this.musicStartTime;
    this.startedAt = 0;
    this.isPlaying = false;
    this.hasEnded = false;
    this.audioEnded = false;
    this.timeScale = 1;
    this.audio = this.originalAudio;
    if (this.audio) {
      this.audio.pause();
      this.audio.currentTime = 0;
    }
  }

  async start() {
    this.startedAt = performance.now();
    this.isPlaying = true;
    this.audioEnded = false;
    this.timeScale = 1;
    if (this.audio) {
      try {
        await this.audio.play();
      } catch {
        this.audio = null;
        this.startedAt = performance.now();
      }
    }
  }

  startSilent(timeScale = 1, startAt = 0) {
    if (this.audio) {
      this.audio.pause();
    }
    this.audio = null;
    this.timeScale = timeScale;
    this.startedAt = performance.now() - startAt / timeScale;
    this.isPlaying = true;
    this.audioEnded = false;
  }

  getTime() {
    return this.getPlaybackTime() + this.calibrationOffset;
  }

  getPlaybackTime() {
    if (!this.isPlaying) return 0;
    if (this.audio) {
      return this.audio.currentTime * 1000 - this.beatmap.offset;
    }
    return (performance.now() - this.startedAt) * this.timeScale - this.beatmap.offset;
  }

  adjustCalibration(deltaMs) {
    this.setCalibrationOffset(this.calibrationOffset + deltaMs);
  }

  setCalibrationOffset(valueMs) {
    const value = Number(valueMs);
    this.calibrationOffset = Number.isFinite(value) ? Math.round(value) : 0;
    localStorage.setItem("rhythmCalibrationOffset", String(this.calibrationOffset));
  }

  getVisibleNotes() {
    const time = this.getTime();
    if (time < this.openingVisibilityTime) {
      return [];
    }
    return this.notes.filter((note) => {
      const distance = note.time - time;
      return note.state === "pending" && distance < this.getNoteApproachTime(note) && distance > -this.missWindow;
    });
  }

  getNoteApproachTime(note) {
    if (!note || note.time > this.firstNoteTime + 40) {
      return this.approachTime;
    }
    return this.openingApproachTime;
  }

  hitLane(lane) {
    const time = this.getTime();
    let best = null;
    let bestDelta = Infinity;
    let signedDelta = Infinity;

    for (const note of this.notes) {
      if (note.state !== "pending" || note.lane !== lane) continue;
      const deltaFromNote = time - note.time;
      const delta = Math.abs(deltaFromNote);
      if (delta < bestDelta) {
        best = note;
        bestDelta = delta;
        signedDelta = deltaFromNote;
      }
    }

    if (!best) {
      return { lane, judgement: "empty", consumed: false, delta: null };
    }

    if (bestDelta > this.badWindow) {
      return {
        lane,
        note: best,
        judgement: signedDelta < 0 ? "early" : "late",
        consumed: false,
        delta: signedDelta
      };
    }

    best.state = "hit";
    let judgement = "bad";
    if (bestDelta <= this.perfectWindow) {
      judgement = "perfect";
    } else if (bestDelta <= this.goodWindow) {
      judgement = "good";
    }
    const result = { note: best, judgement, consumed: true, delta: signedDelta };
    this.onHit?.(result);
    return result;
  }

  update() {
    if (!this.isPlaying) return;
    const time = this.getTime();
    const playbackTime = this.getPlaybackTime();
    for (const note of this.notes) {
      if (note.state === "pending" && time - note.time > this.missWindow) {
        note.state = "missed";
        this.onMiss?.({ note, judgement: "miss", delta: time - note.time });
      }
    }

    const lastNoteTime = this.notes.at(-1)?.time ?? 0;
    if (this.audio?.ended) {
      this.audioEnded = true;
    }
    if (this.audioEnded || playbackTime > lastNoteTime + 2200) {
      this.isPlaying = false;
      if (!this.hasEnded) {
        this.hasEnded = true;
        this.onEnd?.();
      }
    }
  }
}
