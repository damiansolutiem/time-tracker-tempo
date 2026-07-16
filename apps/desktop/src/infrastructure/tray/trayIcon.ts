const ICON_SIZE = 32;

function coverage(distance: number, radius: number, width: number) {
  const difference = Math.abs(distance - radius);
  if (difference <= width - 0.75) return 1;
  return Math.max(0, Math.min(1, width + 0.75 - difference));
}

function lineDistance(
  x: number,
  y: number,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
) {
  const deltaX = endX - startX;
  const deltaY = endY - startY;
  const lengthSquared = deltaX * deltaX + deltaY * deltaY;
  const ratio = Math.max(
    0,
    Math.min(1, ((x - startX) * deltaX + (y - startY) * deltaY) / lengthSquared),
  );
  return Math.hypot(x - (startX + ratio * deltaX), y - (startY + ratio * deltaY));
}

export function createTrayIconRgba(size = ICON_SIZE) {
  const pixels = new Uint8Array(size * size * 4);
  const center = (size - 1) / 2;
  const scale = size / ICON_SIZE;
  const radius = 11.5 * scale;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const circle = coverage(Math.hypot(x - center, y - center), radius, 1.55 * scale);
      const hourHand = Math.max(
        0,
        1 - lineDistance(x, y, center, center, center, center - 6 * scale) / (1.55 * scale),
      );
      const minuteHand = Math.max(
        0,
        1 -
          lineDistance(x, y, center, center, center + 5 * scale, center + 3 * scale) /
            (1.55 * scale),
      );
      const alpha = Math.round(Math.max(circle, hourHand, minuteHand) * 255);
      const offset = (y * size + x) * 4;
      pixels[offset] = 0;
      pixels[offset + 1] = 0;
      pixels[offset + 2] = 0;
      pixels[offset + 3] = alpha;
    }
  }
  return pixels;
}
