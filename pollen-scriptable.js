const SELECTED_CITY = "København";
const CITIES = {
  København: "48",
  Viborg: "49",
};

const POLLEN_LEVELS = {
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
const cachePath = fm.joinPath(cacheDir, "xbar-pollen-cache.json");

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
  const feedId = CITIES[SELECTED_CITY];
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
  const intervals = POLLEN_LEVELS[id];
  if (!intervals || level <= 0) return null;
  if (level < intervals[1]) return "#72B743";
  if (level < intervals[2]) return "#FED05D";
  return "#C01448";
};

const makeSeverityGradient = (baseHex, isZero) => {
  const a1 = isZero ? 0.4 : 1.0;
  const a2 = isZero ? 0.08 : 0.55;
  const gradient = new LinearGradient();
  gradient.colors = [new Color(baseHex, a2), new Color(baseHex, a1)];
  gradient.locations = [0, 1];
  gradient.startPoint = new Point(0, 0);
  gradient.endPoint = new Point(0, 1);
  return gradient;
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

const renderWidget = async () => {
  const widget = new ListWidget();
  const padding = 24;
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

    if (active.length === 0) {
      const noneText = widget.addText("Ingen pollen");
      noneText.font = Font.boldSystemFont(18);
      noneText.textColor = new Color("#72B743");
    } else {
      const { width: widgetW } = getWidgetDimensions();
      const maxPerRow = 3;
      const rows = Math.max(1, Math.ceil(gridAllergens.length / maxPerRow));

      const colGap = 8;
      const rowGap = 8;
      const gridW = widgetW - padding * 2;

      let idx = 0;
      for (let r = 0; r < rows; r++) {
        const remaining = gridAllergens.length - idx;
        if (remaining <= 0) break;
        const itemsInRow = Math.min(maxPerRow, remaining);

        const baseCellW = Math.floor(
          (gridW - colGap * (itemsInRow - 1)) / itemsInRow,
        );
        const remainder =
          gridW - (baseCellW * itemsInRow + colGap * (itemsInRow - 1));

        const rowStack = widget.addStack();
        rowStack.spacing = colGap;

        for (let c = 0; c < itemsInRow; c++) {
          const cellW = baseCellW + (c < remainder ? 1 : 0);
          const cellPad = Math.max(6, Math.min(12, Math.round(cellW * 0.085)));

          const cell = rowStack.addStack();
          cell.size = new Size(cellW, 0);
          cell.layoutVertically();
          cell.topAlignContent();
          cell.setPadding(cellPad, cellPad, cellPad, cellPad);
          cell.cornerRadius = 12;

          const a = gridAllergens[idx++];

          const sev = severityHex(a.id, a.level);
          const isZero = a.level === 0 || !sev;

          const baseHex = isZero ? "#8E8E93" : sev;
          cell.backgroundGradient = makeSeverityGradient(baseHex, isZero);

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
        }

        if (r < rows - 1) {
          widget.addSpacer(rowGap);
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
  widget.setPadding(24, 24, 24, 24);

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
