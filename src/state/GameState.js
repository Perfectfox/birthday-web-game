export class GameState {
  constructor() {
    this.reset();
  }

  reset() {
    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.hitCount = 0;
    this.missCount = 0;
    this.orbs = [];
  }

  applyJudgement(judgement) {
    if (judgement === "miss") {
      this.combo = 0;
      this.missCount += 1;
      return;
    }

    if (judgement === "bad") {
      this.hitCount += 1;
      this.combo = 0;
      this.score += 120;
      return;
    }

    this.hitCount += 1;
    this.combo += 1;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    this.score += judgement === "perfect" ? 1000 : 650;
  }

  recordOrb(judgement, targetStarId) {
    this.orbs.push({
      judgement,
      targetStarId,
      createdAt: performance.now()
    });
  }

  getSummary(totalNotes = 0) {
    const totalJudged = this.hitCount + this.missCount;
    const accuracy = totalJudged ? Math.round((this.hitCount / totalJudged) * 100) : 100;
    const completion = totalNotes ? Math.round((totalJudged / totalNotes) * 100) : 0;
    return {
      score: this.score,
      combo: this.combo,
      maxCombo: this.maxCombo,
      hitCount: this.hitCount,
      missCount: this.missCount,
      totalJudged,
      totalNotes,
      accuracy,
      completion,
      rank: getRank(accuracy, this.missCount, totalJudged)
    };
  }
}

function getRank(accuracy, missCount, totalJudged) {
  if (!totalJudged) return "PREVIEW";
  if (accuracy >= 99 && missCount === 0) return "SS";
  if (accuracy >= 95) return "S";
  if (accuracy >= 90) return "A";
  if (accuracy >= 80) return "B";
  return "C";
}
