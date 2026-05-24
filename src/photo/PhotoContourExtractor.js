export class PhotoContourExtractor {
  static extract(image, targetCount) {
    const size = 256;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    const scale = Math.min(size / image.width, size / image.height);
    const width = image.width * scale;
    const height = image.height * scale;
    const x = (size - width) / 2;
    const y = (size - height) / 2;
    ctx.drawImage(image, x, y, width, height);

    const data = ctx.getImageData(0, 0, size, size).data;
    const edges = [];
    for (let py = 2; py < size - 2; py += 2) {
      for (let px = 2; px < size - 2; px += 2) {
        const c = luminance(data, size, px, py);
        const dx = Math.abs(c - luminance(data, size, px + 2, py));
        const dy = Math.abs(c - luminance(data, size, px, py + 2));
        const strength = dx + dy;
        if (strength > 54) {
          edges.push({ x: px / size, y: py / size, strength });
        }
      }
    }

    if (edges.length < targetCount) {
      return fallbackPortraitContour(targetCount);
    }

    edges.sort((a, b) => b.strength - a.strength);
    return resamplePoints(edges.slice(0, Math.max(targetCount * 5, 120)), targetCount);
  }
}

function luminance(data, size, x, y) {
  const index = (y * size + x) * 4;
  return data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114;
}

function resamplePoints(points, count) {
  const sorted = [...points].sort((a, b) => {
    const aa = Math.atan2(a.y - 0.5, a.x - 0.5);
    const bb = Math.atan2(b.y - 0.5, b.x - 0.5);
    return aa - bb;
  });
  const sampled = [];
  for (let i = 0; i < count; i++) {
    const index = Math.floor((i / count) * sorted.length);
    sampled.push({ x: sorted[index].x, y: sorted[index].y, order: i });
  }
  return sampled;
}

function fallbackPortraitContour(count) {
  const points = [];
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    points.push({
      x: 0.5 + Math.cos(angle) * 0.23,
      y: 0.48 + Math.sin(angle) * 0.34,
      order: i
    });
  }
  return points;
}
