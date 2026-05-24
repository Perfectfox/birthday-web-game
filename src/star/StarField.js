export class StarField {
  constructor(backgroundImage, stars) {
    this.backgroundImage = backgroundImage;
    this.stars = stars;
    this.contourTargets = [];
  }

  setContourTargets(targets) {
    this.contourTargets = targets;
    this.targetsByActivation = new Map();
    for (const target of targets) {
      const key = target.activationIndex ?? target.contourIndex;
      if (!this.targetsByActivation.has(key)) {
        this.targetsByActivation.set(key, []);
      }
      this.targetsByActivation.get(key).push(target);
    }
  }

  reset() {
    for (const target of this.contourTargets) {
      target.state = "hidden";
    }
  }

  getTargetByIndex(index) {
    return this.getTargetsByIndex(index)[0];
  }

  getTargetsByIndex(index) {
    if (this.targetsByActivation?.has(index)) {
      return this.targetsByActivation.get(index);
    }
    const target = this.contourTargets[index % this.contourTargets.length];
    return target ? [target] : [];
  }

  setTargetState(id, state) {
    const target = this.contourTargets.find((star) => star.id === id);
    if (target) target.state = state;
  }

  setTargetsState(targets, state) {
    for (const target of targets) {
      target.state = state;
    }
  }
}
