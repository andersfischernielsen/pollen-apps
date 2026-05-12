export const getWidgetDimensions = () => {
  const family = config.widgetFamily;
  switch (family) {
    case "small":
      return { width: 155, height: 155 };
    case "medium":
      return { width: 329, height: 155 };
    case "large":
      return { width: 329, height: 345 };
    case "extraLarge":
      return { width: 329, height: 720 };
    default:
      return { width: 329, height: 155 };
  }
};

const trimLeadingZeros = (
  data: { x: number; value: number }[],
): { x: number; value: number }[] => {
  if (data.length === 0) return [];
  let start = 0;
  while (start < data.length && data[start]!.value === 0) start++;
  return data.slice(start);
};

export const drawSparkline = (
  ctx: DrawContext,
  baseHex: string,
  history: { x: number; value: number }[],
  cellWidth: number,
  cellHeight: number,
) => {
  const trimmed = trimLeadingZeros(history);
  if (trimmed.length < 2) return;

  const maxVal = Math.max(...trimmed.map((d) => d.value), 1);
  const maxX = Math.max(...trimmed.map((d) => d.x), 1);
  const chartWidth = Math.floor(cellWidth * 0.65);
  const chartX = cellWidth - chartWidth;

  const isYellow = baseHex.toUpperCase() === "#FED05D";
  const chartColorHex = isYellow ? "#1C1C1E" : "#FFFFFF";

  const chartPadding = 6;
  const chartDrawWidth = chartWidth - chartPadding * 2;
  const chartDrawHeight = cellHeight - chartPadding * 2;
  const baseline = cellHeight - chartPadding;
  const toX = (x: number) =>
    chartX + chartPadding + (x / maxX) * chartDrawWidth;
  const toY = (v: number) =>
    chartPadding + chartDrawHeight - (v / maxVal) * chartDrawHeight;

  const fillPath = new Path();
  fillPath.move(new Point(toX(trimmed[0]!.x), baseline));
  for (const p of trimmed) {
    fillPath.addLine(new Point(toX(p.x), toY(p.value)));
  }
  fillPath.addLine(new Point(toX(trimmed[trimmed.length - 1]!.x), baseline));
  fillPath.closeSubpath();
  ctx.addPath(fillPath);
  ctx.setFillColor(new Color(chartColorHex, 0.2));
  ctx.fillPath();

  const linePath = new Path();
  linePath.move(new Point(toX(trimmed[0]!.x), toY(trimmed[0]!.value)));
  for (let i = 1; i < trimmed.length; i++) {
    linePath.addLine(new Point(toX(trimmed[i]!.x), toY(trimmed[i]!.value)));
  }
  ctx.addPath(linePath);
  ctx.setStrokeColor(new Color(chartColorHex, 0.45));
  ctx.setLineWidth(1.5);
  ctx.strokePath();
};
