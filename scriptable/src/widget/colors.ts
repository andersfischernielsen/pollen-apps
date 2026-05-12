const pollenSeverities: Record<string, [number, number, number, number]> = {
  "1": [0, 10, 50, 200],
  "2": [0, 5, 15, 40],
  "4": [0, 10, 50, 80],
  "7": [0, 30, 100, 550],
  "28": [0, 10, 50, 150],
  "31": [0, 10, 50, 60],
  "44": [0, 20, 100, 500],
  "45": [0, 2000, 6000, 7000],
};

export const severityColor = (id: string, level: number): string | null => {
  const intervals = pollenSeverities[id];
  if (!intervals || level <= 0) return null;
  if (level < intervals[1]) return "#72B743";
  if (level < intervals[2]) return "#FED05D";
  return "#C01448";
};

export const getTextStyle = (baseHex: string, isZero: boolean) => {
  if (isZero) {
    return {
      textColor: Color.dynamic(new Color("#1C1C1E"), new Color("#F2F2F7")),
      shadowColor: Color.dynamic(
        new Color("#FFFFFF", 0.2),
        new Color("#000000", 0.35),
      ),
    };
  }

  const isYellow = baseHex.toUpperCase() === "#FED05D";
  return {
    textColor: isYellow ? new Color("#1C1C1E") : new Color("#FFFFFF"),
    shadowColor: isYellow
      ? new Color("#FFFFFF", 0.2)
      : new Color("#000000", 0.35),
  };
};

export const drawGradientBackground = (
  ctx: DrawContext,
  baseHex: string,
  isZero: boolean,
  cellWidth: number,
  cellHeight: number,
) => {
  const a1 = isZero ? 0.4 : 1.0;
  const a2 = isZero ? 0.08 : 0.55;

  for (let y = 0; y < cellHeight; y++) {
    const t = y / Math.max(cellHeight - 1, 1);
    ctx.setFillColor(new Color(baseHex, a2 + (a1 - a2) * t));
    ctx.fill(new Rect(0, y, cellWidth, 1));
  }
};
