export class ContourMapper {
  static mapContourToStars(contourPoints, stars, projection) {
    const usableStars = stars
      .filter((star) => Number.isFinite(star.x) && Number.isFinite(star.y))
      .map((star) => ({ ...star, used: false }));
    const snapToStars = projection?.snapToStars !== false;

    return contourPoints.map((point, index) => {
      const target = normalizeToStarMap(point, projection);
      if (!snapToStars) {
        return {
          ...target,
          id: `contour_${index}`,
          contourIndex: index,
          activationIndex: point.activationIndex ?? index,
          region: point.region ?? "contour",
          state: "hidden"
        };
      }

      let best = null;
      let bestDistance = Infinity;

      for (const star of usableStars) {
        if (star.used) continue;
        const distance = squaredDistance(target, star);
        if (distance < bestDistance) {
          best = star;
          bestDistance = distance;
        }
      }

      if (best) best.used = true;
      return {
        ...(best ?? target),
        id: best?.id ?? `virtual_${index}`,
        contourIndex: index,
        activationIndex: point.activationIndex ?? index,
        region: point.region ?? "contour",
        state: "hidden"
      };
    });
  }
}

function normalizeToStarMap(point, projection = {}) {
  const centerX = projection.centerX ?? 0.5;
  const centerY = projection.centerY ?? 0.53;
  const scaleX = projection.scaleX ?? 0.52;
  const scaleY = projection.scaleY ?? 0.68;
  return {
    x: centerX + (point.x - 0.5) * scaleX,
    y: centerY + (point.y - 0.5) * scaleY
  };
}

function squaredDistance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}
