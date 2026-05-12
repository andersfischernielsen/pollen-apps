// src/constants.ts
var cities = {
  København: "48",
  Viborg: "49"
};
var defaultCity = "København";

// src/cache.ts
var fileManager = FileManager.local();
var cacheDir = fileManager.documentsDirectory();
var cachePath = fileManager.joinPath(cacheDir, "scriptable-pollen-cache.json");
var saveCache = async (data) => {
  fileManager.writeString(cachePath, JSON.stringify(data));
};
var loadCache = () => {
  if (!fileManager.fileExists(cachePath)) {
    return;
  }
  const contents = fileManager.readString(cachePath);
  return JSON.parse(contents);
};

// src/data.ts
var parseDocument = (text) => JSON.parse(JSON.parse(text));
var fetchCurrent = async () => {
  try {
    const pollenReq = new Request("https://www.astma-allergi.dk/umbraco/api/pollenapi/getpollenfeed");
    const allergensReq = new Request("https://www.astma-allergi.dk/umbraco/api/pollenapi/getallergens");
    pollenReq.timeoutInterval = 2;
    allergensReq.timeoutInterval = 2;
    const [pollenText, allergensText] = await Promise.all([
      pollenReq.loadString(),
      allergensReq.loadString()
    ]);
    const pollen = parseDocument(pollenText);
    const allergens = parseDocument(allergensText);
    await saveCache({ pollenText, allergensText });
    return [pollen, allergens];
  } catch {
    const cached = loadCache();
    if (!cached) {
      throw new Error("API and cache unavailable");
    }
    const pollen = parseDocument(cached.pollenText);
    const allergens = parseDocument(cached.allergensText);
    return [pollen, allergens];
  }
};
var buildAllergenInformation = (allergens) => Object.fromEntries(Object.entries(allergens.fields.allergens.mapValue.fields).map(([id, val]) => {
  const f = val.mapValue.fields;
  return [id, { name: f.name.stringValue, latin: f.latin.stringValue }];
}));
var buildAllergens = (stationId, pollen, info) => {
  const cityField = pollen.fields[stationId]?.mapValue.fields;
  if (!cityField)
    return {
      allergens: [],
      date: undefined
    };
  const date = cityField.date.stringValue;
  const feed = cityField.data.mapValue.fields;
  const allergens = Object.entries(feed).map(([id, value]) => {
    const f = value.mapValue.fields;
    return {
      id,
      name: info[id]?.name ?? id,
      latin: info[id]?.latin ?? "",
      level: parseInt(f.level.integerValue),
      inSeason: f.inSeason.booleanValue
    };
  }).filter((a) => a.inSeason).sort((a, b) => b.level - a.level);
  return { allergens, date };
};
var isLeapYear = (year) => year % 4 === 0 && year % 100 !== 0 || year % 400 === 0;
var cumulativeDaysBefore = (year) => {
  const february = isLeapYear(year) ? 29 : 28;
  const lengths = [0, 31, february, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const cumulative = [0];
  for (let i = 0;i < 11; i++)
    cumulative.push(cumulative[i] + lengths[i]);
  return cumulative;
};
var fetchHistorical = async (stationId, allergenId, year) => {
  const url = `https://www.astma-allergi.dk/umbraco/api/PollenApi/GetHistoricalData?stationId=${stationId}&allergenId=${allergenId}&year=${year}`;
  const req = new Request(url);
  req.timeoutInterval = 5;
  const text = await req.loadString();
  const data = parseDocument(text);
  const monthly = data.fields.monthlyData.mapValue.fields;
  const daysBefore = cumulativeDaysBefore(year);
  return Object.entries(monthly).sort(([a], [b]) => parseInt(a) - parseInt(b)).flatMap(([monthStr, monthVal]) => {
    const month = parseInt(monthStr);
    const days = monthVal.mapValue.fields;
    return Object.entries(days).sort(([a], [b]) => parseInt(a) - parseInt(b)).map(([dayStr, dayVal]) => {
      const day = parseInt(dayStr);
      const offset = daysBefore[month - 1];
      const value = parseInt(dayVal.integerValue);
      return offset !== undefined ? { x: offset + day, value } : null;
    }).filter((p) => p !== null);
  });
};

// src/widget/chart.ts
var getWidgetDimensions = () => {
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
var trimLeadingZeros = (data) => {
  if (data.length === 0)
    return [];
  let start = 0;
  while (start < data.length && data[start].value === 0)
    start++;
  return data.slice(start);
};
var drawSparkline = (ctx, baseHex, history, cellWidth, cellHeight) => {
  const trimmed = trimLeadingZeros(history);
  if (trimmed.length < 2)
    return;
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
  const toX = (x) => chartX + chartPadding + x / maxX * chartDrawWidth;
  const toY = (v) => chartPadding + chartDrawHeight - v / maxVal * chartDrawHeight;
  const fillPath = new Path;
  fillPath.move(new Point(toX(trimmed[0].x), baseline));
  for (const p of trimmed) {
    fillPath.addLine(new Point(toX(p.x), toY(p.value)));
  }
  fillPath.addLine(new Point(toX(trimmed[trimmed.length - 1].x), baseline));
  fillPath.closeSubpath();
  ctx.addPath(fillPath);
  ctx.setFillColor(new Color(chartColorHex, 0.2));
  ctx.fillPath();
  const linePath = new Path;
  linePath.move(new Point(toX(trimmed[0].x), toY(trimmed[0].value)));
  for (let i = 1;i < trimmed.length; i++) {
    linePath.addLine(new Point(toX(trimmed[i].x), toY(trimmed[i].value)));
  }
  ctx.addPath(linePath);
  ctx.setStrokeColor(new Color(chartColorHex, 0.45));
  ctx.setLineWidth(1.5);
  ctx.strokePath();
};

// src/widget/colors.ts
var pollenSeverities = {
  "1": [0, 10, 50, 200],
  "2": [0, 5, 15, 40],
  "4": [0, 10, 50, 80],
  "7": [0, 30, 100, 550],
  "28": [0, 10, 50, 150],
  "31": [0, 10, 50, 60],
  "44": [0, 20, 100, 500],
  "45": [0, 2000, 6000, 7000]
};
var severityColor = (id, level) => {
  const intervals = pollenSeverities[id];
  if (!intervals || level <= 0)
    return null;
  if (level < intervals[1])
    return "#72B743";
  if (level < intervals[2])
    return "#FED05D";
  return "#C01448";
};
var getTextStyle = (baseHex, isZero) => {
  if (isZero) {
    return {
      textColor: Color.dynamic(new Color("#1C1C1E"), new Color("#F2F2F7")),
      shadowColor: Color.dynamic(new Color("#FFFFFF", 0.2), new Color("#000000", 0.35))
    };
  }
  const isYellow = baseHex.toUpperCase() === "#FED05D";
  return {
    textColor: isYellow ? new Color("#1C1C1E") : new Color("#FFFFFF"),
    shadowColor: isYellow ? new Color("#FFFFFF", 0.2) : new Color("#000000", 0.35)
  };
};
var drawGradientBackground = (ctx, baseHex, isZero, cellWidth, cellHeight) => {
  const a1 = isZero ? 0.4 : 1;
  const a2 = isZero ? 0.08 : 0.55;
  for (let y = 0;y < cellHeight; y++) {
    const t = y / Math.max(cellHeight - 1, 1);
    ctx.setFillColor(new Color(baseHex, a2 + (a1 - a2) * t));
    ctx.fill(new Rect(0, y, cellWidth, 1));
  }
};

// src/widget/widget.ts
var chunk = (arr, size) => Array.from({ length: Math.ceil(arr.length / size) }, (_, i) => arr.slice(i * size, i * size + size));
var buildNameLabel = (cell, name, textColor, shadowColor) => {
  const label = cell.addText(name);
  label.font = Font.semiboldSystemFont(10);
  label.textColor = textColor;
  label.shadowColor = shadowColor;
  label.shadowRadius = 2;
  label.shadowOffset = new Point(0, 1);
  label.lineLimit = 1;
  label.minimumScaleFactor = 0.7;
  label.leftAlignText();
};
var buildLevelLabel = (cell, level, textColor, shadowColor, isZero) => {
  const label = cell.addText(String(level));
  label.font = Font.boldSystemFont(22);
  label.textColor = textColor;
  label.textOpacity = isZero ? 0.78 : 1;
  label.shadowColor = shadowColor;
  label.shadowRadius = 3;
  label.shadowOffset = new Point(0, 1);
  label.lineLimit = 1;
  label.minimumScaleFactor = 0.6;
  label.leftAlignText();
};
var buildCellBackground = (baseHex, isZero, history, cellWidth, cellHeight) => {
  const ctx = new DrawContext;
  ctx.size = new Size(cellWidth, cellHeight);
  ctx.opaque = false;
  ctx.respectScreenScale = true;
  drawGradientBackground(ctx, baseHex, isZero, cellWidth, cellHeight);
  drawSparkline(ctx, baseHex, history, cellWidth, cellHeight);
  return ctx.getImage();
};
var buildCell = (parent, allergen, history, cellWidth, cellHeight) => {
  const cellPadding = Math.max(6, Math.min(12, Math.round(cellWidth * 0.085)));
  const cell = parent.addStack();
  cell.size = new Size(cellWidth, cellHeight);
  cell.layoutVertically();
  cell.topAlignContent();
  cell.setPadding(cellPadding, cellPadding, cellPadding, cellPadding);
  cell.cornerRadius = 12;
  const severity = severityColor(allergen.id, allergen.level);
  const isZero = allergen.level === 0 || !severity;
  const baseHex = isZero ? "#8E8E93" : severity;
  cell.backgroundImage = buildCellBackground(baseHex, isZero, history, cellWidth, cellHeight);
  const { textColor, shadowColor } = getTextStyle(baseHex, isZero);
  buildNameLabel(cell, allergen.name, textColor, shadowColor);
  cell.addSpacer(6);
  buildLevelLabel(cell, allergen.level, textColor, shadowColor, isZero);
  cell.addSpacer();
};
var buildRow = (widget, allergens, historicalData, rowWidth, cellHeight, gap) => {
  const cellWidth = Math.floor((rowWidth - gap * (allergens.length - 1)) / allergens.length);
  const rowStack = widget.addStack();
  rowStack.addSpacer();
  for (const [i, a] of allergens.entries()) {
    buildCell(rowStack, a, historicalData[a.id] ?? [], cellWidth, cellHeight);
    if (i < allergens.length - 1) {
      rowStack.addSpacer(gap);
    }
  }
  rowStack.addSpacer();
};
var buildGrid = (widget, allergens, historicalData) => {
  const { width: widgetWidth, height: widgetHeight } = getWidgetDimensions();
  const padding = 16;
  const gap = 8;
  const maxPerRow = 3;
  const rows = chunk(allergens, maxPerRow);
  const cellHeight = Math.floor((widgetHeight - padding * 2 - 28 - gap * (rows.length - 1)) / rows.length);
  const gridWidth = widgetWidth - padding * 2;
  for (const [r, row] of rows.entries()) {
    buildRow(widget, row, historicalData, gridWidth, cellHeight, gap);
    if (r < rows.length - 1) {
      widget.addSpacer(gap);
    }
  }
};
var buildError = (widget, error) => {
  const err = error instanceof Error ? error.message : String(error);
  const errorTitle = widget.addText("⚠️ Fejl");
  errorTitle.font = Font.boldSystemFont(16);
  errorTitle.textColor = new Color("#e74c3c");
  widget.addSpacer(4);
  const errorMsg = widget.addText(err);
  errorMsg.font = Font.systemFont(12);
  errorMsg.textColor = new Color("#e74c3c");
};
var buildNoneText = (widget) => {
  const text = widget.addText("Ingen pollen");
  text.font = Font.boldSystemFont(18);
  text.textColor = new Color("#72B743");
};
var buildWidget = async (cityName) => {
  const widget = new ListWidget;
  widget.setPadding(16, 16, 16, 16);
  widget.spacing = 0;
  widget.backgroundColor = Color.dynamic(new Color("#FFFFFF"), new Color("#111111"));
  const title = widget.addText("Pollen");
  title.font = Font.boldSystemFont(16);
  title.textColor = Color.dynamic(new Color("#1C1C1E"), new Color("#F2F2F7"));
  title.leftAlignText();
  widget.addSpacer(8);
  try {
    const [pollen, allergens] = await fetchCurrent();
    const allergenInfo = buildAllergenInformation(allergens);
    const stationId = cities[cityName];
    if (!stationId)
      throw new Error(`Unknown city: ${cityName}`);
    const { allergens: active } = buildAllergens(stationId, pollen, allergenInfo);
    const gridAllergens = active.slice(0, 9);
    const currentYear = new Date().getFullYear();
    const historicalData = Object.fromEntries(await Promise.all(gridAllergens.map(async (a) => {
      try {
        return [
          a.id,
          await fetchHistorical(stationId, a.id, currentYear)
        ];
      } catch {
        return [a.id, []];
      }
    })));
    if (active.length === 0) {
      buildNoneText(widget);
    } else {
      buildGrid(widget, gridAllergens, historicalData);
    }
    widget.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);
  } catch (error) {
    buildError(widget, error);
  }
  Script.setWidget(widget);
  Script.complete();
};

// src/pollen.ts
var cityName = args.widgetParameter || args.shortcutParameter || defaultCity;
await buildWidget(cityName);
