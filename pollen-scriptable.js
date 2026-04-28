const selectedCity = "København";
const cities = {
  København: "48",
  Viborg: "49",
};

const pollenLevels = {
  1: [0, 10, 50, 200],
  2: [0, 5, 15, 40],
  4: [0, 10, 50, 80],
  7: [0, 30, 100, 550],
  28: [0, 10, 50, 150],
  31: [0, 10, 50, 60],
  44: [0, 20, 100, 500],
  45: [0, 2000, 6000, 7000],
};

const fm = FileManager.local();
const cacheDir = fm.documentsDirectory();
const cachePath = fm.joinPath(cacheDir, "scriptable-pollen-cache.json");

const saveCache = async (data) => {
  fm.writeString(cachePath, JSON.stringify(data));
};

const loadCache = () => {
  if (!fm.fileExists(cachePath)) {
    return undefined;
  }
  const contents = fm.readString(cachePath);
  return JSON.parse(contents);
};

const fetchData = async () => {
  try {
    const pollenReq = new Request(
      "https://www.astma-allergi.dk/umbraco/api/pollenapi/getpollenfeed",
    );
    pollenReq.timeoutInterval = 2;

    const allergensReq = new Request(
      "https://www.astma-allergi.dk/umbraco/api/pollenapi/getallergens",
    );
    allergensReq.timeoutInterval = 2;

    const [pollenText, allergensText] = await Promise.all([
      pollenReq.loadString(),
      allergensReq.loadString(),
    ]);

    const pollen = JSON.parse(JSON.parse(pollenText));
    const allergens = JSON.parse(JSON.parse(allergensText));

    await saveCache({ pollenText, allergensText });

    return [pollen, allergens];
  } catch (error) {
    const cached = loadCache();
    if (!cached) {
      throw new Error("API and cache unavailable");
    }
    const { pollenText, allergensText } = cached;
    const pollen = JSON.parse(JSON.parse(pollenText));
    const allergens = JSON.parse(JSON.parse(allergensText));
    return [pollen, allergens];
  }
};

const buildAllergenInformation = (allergens) => {
  const info = {};
  const allergensFields = allergens.fields.allergens.mapValue.fields;

  for (const [id, val] of Object.entries(allergensFields)) {
    const field = val.mapValue.fields;
    info[id] = {
      name: field.name.stringValue,
      latin: "stringValue" in field.latin ? field.latin.stringValue : "",
    };
  }

  return info;
};

const buildAllergens = (pollen, information) => {
  const feedId = cities[selectedCity];
  if (!feedId) {
    return [[], undefined];
  }

  const feedData = pollen.fields[feedId];
  if (!feedData) {
    return [[], undefined];
  }

  const feedDate = feedData.mapValue.fields.date.stringValue;
  const feed = feedData.mapValue.fields.data.mapValue.fields;

  const active = Object.entries(feed)
    .map(([id, value]) => {
      const f = value.mapValue.fields;
      return {
        id,
        name: information[id]?.name ?? id,
        latin: information[id]?.latin ?? "",
        level: parseInt(f.level.integerValue),
        inSeason: f.inSeason.booleanValue,
        predictions: f.predictions.mapValue.fields,
      };
    })
    .filter((a) => a.inSeason)
    .sort((a, b) => b.level - a.level);

  return [active, feedDate];
};

const getWidgetDimensions = () => {
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

const severityHex = (id, level) => {
  const intervals = pollenLevels[id];
  if (!intervals || level <= 0) return null;
  if (level < intervals[1]) return "#72B743";
  if (level < intervals[2]) return "#FED05D";
  return "#C01448";
};

const makeCellBackground = (
  baseHex,
  isZero,
  history,
  cellWidth,
  cellHeight,
) => {
  const a1 = isZero ? 0.4 : 1.0;
  const a2 = isZero ? 0.08 : 0.55;

  const ctx = new DrawContext();
  ctx.size = new Size(cellWidth, cellHeight);
  ctx.opaque = false;
  ctx.respectScreenScale = true;

  for (let y = 0; y < cellHeight; y++) {
    const t = y / Math.max(cellHeight - 1, 1);
    ctx.setFillColor(new Color(baseHex, a2 + (a1 - a2) * t));
    ctx.fill(new Rect(0, y, cellWidth, 1));
  }

  let trimmed = [];
  if (history && history.length > 0) {
    let startIndex = 0;
    while (startIndex < history.length && history[startIndex].value === 0) {
      startIndex++;
    }
    trimmed = history.slice(startIndex);
  }

  if (trimmed.length >= 2) {
    const maxVal = Math.max(...trimmed.map((d) => d.value), 1);
    const maxX = Math.max(...trimmed.map((d) => d.x), 1);
    const chartWidth = Math.floor(cellWidth * 0.65);
    const chartX = cellWidth - chartWidth;

    const isYellow = String(baseHex).toUpperCase() === "#FED05D";
    const chartColorHex = isYellow ? "#1C1C1E" : "#FFFFFF";

    const chartPadding = 6;
    const chartDrawWidth = chartWidth - chartPadding * 2;
    const chartDrawHeight = cellHeight - chartPadding * 2;
    const baseline = cellHeight - chartPadding;
    const toX = (x) => chartX + chartPadding + (x / maxX) * chartDrawWidth;
    const toY = (v) =>
      chartPadding + chartDrawHeight - (v / maxVal) * chartDrawHeight;

    const fillPath = new Path();
    fillPath.move(new Point(toX(trimmed[0].x), baseline));
    for (const p of trimmed) {
      fillPath.addLine(new Point(toX(p.x), toY(p.value)));
    }
    fillPath.addLine(new Point(toX(trimmed[trimmed.length - 1].x), baseline));
    fillPath.closeSubpath();
    ctx.addPath(fillPath);
    ctx.setFillColor(new Color(chartColorHex, 0.2));
    ctx.fillPath();

    const linePath = new Path();
    linePath.move(new Point(toX(trimmed[0].x), toY(trimmed[0].value)));
    for (let i = 1; i < trimmed.length; i++) {
      linePath.addLine(new Point(toX(trimmed[i].x), toY(trimmed[i].value)));
    }
    ctx.addPath(linePath);
    ctx.setStrokeColor(new Color(chartColorHex, 0.45));
    ctx.setLineWidth(1.5);
    ctx.strokePath();
  }

  return ctx.getImage();
};

const getOnGradientTextStyle = (baseHex, isZero) => {
  if (isZero) {
    return {
      textColor: Color.dynamic(new Color("#1C1C1E"), new Color("#F2F2F7")),
      shadowColor: Color.dynamic(
        new Color("#FFFFFF", 0.2),
        new Color("#000000", 0.35),
      ),
    };
  }

  const isYellow = String(baseHex).toUpperCase() === "#FED05D";
  return {
    textColor: isYellow ? new Color("#1C1C1E") : new Color("#FFFFFF"),
    shadowColor: isYellow
      ? new Color("#FFFFFF", 0.2)
      : new Color("#000000", 0.35),
  };
};

const fetchHistorical = async (stationId, allergenId, year) => {
  const url = `https://www.astma-allergi.dk/umbraco/api/PollenApi/GetHistoricalData?stationId=${stationId}&allergenId=${allergenId}&year=${year}`;
  const req = new Request(url);
  req.timeoutInterval = 5;
  const text = await req.loadString();
  const data = JSON.parse(JSON.parse(text));
  const monthly = data.fields?.monthlyData?.mapValue?.fields || {};
  const points = [];
  const daysBefore = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  for (const monthStr of Object.keys(monthly).sort(
    (a, b) => parseInt(a) - parseInt(b),
  )) {
    const month = parseInt(monthStr);
    const days = monthly[monthStr].mapValue?.fields || {};
    for (const dayStr of Object.keys(days).sort(
      (a, b) => parseInt(a) - parseInt(b),
    )) {
      const day = parseInt(dayStr);
      const dayVal = days[dayStr];
      let val = dayVal?.integerValue;
      if (val === undefined) {
        val = dayVal?.mapValue?.fields?.level?.integerValue;
      }
      if (val !== undefined && val !== null) {
        const doy = daysBefore[month - 1] + day;
        points.push({ x: doy, value: parseInt(val) });
      }
    }
  }
  return points;
};

const renderWidget = async () => {
  const widget = new ListWidget();
  const padding = 16;
  widget.setPadding(padding, padding, padding, padding);
  widget.spacing = 0;
  widget.backgroundColor = Color.dynamic(
    new Color("#FFFFFF"),
    new Color("#111111"),
  );

  const title = widget.addText("Pollen");
  title.font = Font.boldSystemFont(16);
  title.textColor = Color.dynamic(new Color("#1C1C1E"), new Color("#F2F2F7"));
  title.leftAlignText();

  const titleGap = 8;
  widget.addSpacer(titleGap);

  try {
    const [pollen, allergens] = await fetchData();
    const allergenInfo = buildAllergenInformation(allergens);
    const [active] = buildAllergens(pollen, allergenInfo);

    const gridAllergens = active.slice(0, 9);

    const stationId = cities[selectedCity];
    const currentYear = new Date().getFullYear();
    let historicalData = {};
    if (stationId) {
      const histEntries = await Promise.all(
        gridAllergens.map(async (a) => {
          try {
            return [a.id, await fetchHistorical(stationId, a.id, currentYear)];
          } catch (e) {
            return [a.id, []];
          }
        }),
      );
      historicalData = Object.fromEntries(histEntries);
    }

    if (active.length === 0) {
      const noneText = widget.addText("Ingen pollen");
      noneText.font = Font.boldSystemFont(18);
      noneText.textColor = new Color("#72B743");
    } else {
      const { width: widgetWidth, height: widgetHeight } =
        getWidgetDimensions();
      const maxPerRow = 3;
      const rows = Math.max(1, Math.ceil(gridAllergens.length / maxPerRow));

      const gap = 8;
      const cellHeight = Math.floor(
        (widgetHeight - padding * 2 - 28 - gap * (rows - 1)) / rows,
      );
      const gridWidth = widgetWidth - padding * 2;

      let index = 0;
      for (let r = 0; r < rows; r++) {
        const remaining = gridAllergens.length - index;
        if (remaining <= 0) break;
        const itemsInRow = Math.min(maxPerRow, remaining);

        const cellWidth = Math.floor(
          (gridWidth - gap * (itemsInRow - 1)) / itemsInRow,
        );

        const rowStack = widget.addStack();
        rowStack.spacing = 0;
        rowStack.addSpacer();

        for (let c = 0; c < itemsInRow; c++) {
          const cellPadding = Math.max(
            6,
            Math.min(12, Math.round(cellWidth * 0.085)),
          );

          const cell = rowStack.addStack();
          cell.size = new Size(cellWidth, cellHeight);
          cell.layoutVertically();
          cell.topAlignContent();
          cell.setPadding(cellPadding, cellPadding, cellPadding, cellPadding);
          cell.cornerRadius = 12;

          const a = gridAllergens[index++];

          const severity = severityHex(a.id, a.level);
          const isZero = a.level === 0 || !severity;

          const baseHex = isZero ? "#8E8E93" : severity;
          cell.backgroundImage = makeCellBackground(
            baseHex,
            isZero,
            historicalData[a.id] || [],
            cellWidth,
            cellHeight,
          );

          const { textColor, shadowColor } = getOnGradientTextStyle(
            baseHex,
            isZero,
          );

          const name = cell.addText(a.name);
          name.font = Font.semiboldSystemFont(10);
          name.textColor = textColor;
          name.textOpacity = 1;
          name.shadowColor = shadowColor;
          name.shadowRadius = 2;
          name.shadowOffset = new Point(0, 1);
          name.lineLimit = 1;
          name.minimumScaleFactor = 0.7;
          name.leftAlignText();

          cell.addSpacer(6);

          const count = cell.addText(String(a.level));
          count.font = Font.boldSystemFont(22);
          count.textColor = textColor;
          count.textOpacity = isZero ? 0.78 : 1;
          count.shadowColor = shadowColor;
          count.shadowRadius = 3;
          count.shadowOffset = new Point(0, 1);
          count.lineLimit = 1;
          count.minimumScaleFactor = 0.6;
          count.leftAlignText();

          cell.addSpacer();

          if (c < itemsInRow - 1) {
            rowStack.addSpacer(gap);
          }
        }

        rowStack.addSpacer();

        if (r < rows - 1) {
          widget.addSpacer(gap);
        }
      }
    }

    widget.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);
  } catch (error) {
    const errorTitle = widget.addText("⚠️ Fejl");
    errorTitle.font = Font.boldSystemFont(16);
    errorTitle.textColor = new Color("#e74c3c");

    widget.addSpacer(4);

    const errorMsg = widget.addText(error.message);
    errorMsg.font = Font.systemFont(12);
    errorMsg.textColor = new Color("#e74c3c");
  }

  Script.setWidget(widget);
  Script.complete();
};

renderWidget().catch((error) => {
  const widget = new ListWidget();
  widget.setPadding(16, 16, 16, 16);

  const errorTitle = widget.addText("⚠️ Widget Error");
  errorTitle.font = Font.boldSystemFont(16);
  errorTitle.textColor = new Color("#e74c3c");

  widget.addSpacer(4);

  const errorMsg = widget.addText(error.message);
  errorMsg.font = Font.systemFont(12);
  errorMsg.textColor = new Color("#e74c3c");

  Script.setWidget(widget);
  Script.complete();
});
