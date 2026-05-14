#!/usr/bin/env node
"use strict";

// pollen.5m.ts
var import_os = require("os");
var import_path = require("path");
var import_promises = require("fs/promises");
var import_fs = require("fs");
var cities = {
  København: "48",
  Viborg: "49",
};
var selectedCity = "K\xF8benhavn";
var pollenLevels = {
  1: [0, 10, 50, 200],
  2: [0, 5, 15, 40],
  4: [0, 10, 50, 80],
  7: [0, 30, 100, 550],
  28: [0, 10, 50, 150],
  31: [0, 10, 50, 60],
  44: [0, 20, 100, 500],
  45: [0, 2e3, 6e3, 7e3],
};
var predictionLabels = {
  1: "Lavt",
  2: "Moderat",
  3: "H\xF8jt",
};
var cacheDir = (0, import_path.join)((0, import_os.homedir)(), ".cache");
var cachePath = (0, import_path.join)(cacheDir, "xbar-pollen-cache.json");
var saveCache = async (data) => {
  await (0, import_promises.mkdir)(cacheDir, { recursive: true });
  const stringified = JSON.stringify(data);
  await (0, import_promises.writeFile)(cachePath, stringified, "utf-8");
};
var loadCache = async () => {
  if (!(0, import_fs.existsSync)(cachePath)) return void 0;
  const content = await (0, import_promises.readFile)(cachePath, "utf-8");
  return JSON.parse(content);
};
var fetchWithTimeout = async (url, ms = 2e3) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
};
var levelColor = (id, level) => {
  const intervals = pollenLevels[id];
  if (!intervals || level < 0) return "#DDDDDD";
  if (level < intervals[1]) return "#72B743";
  if (level < intervals[2]) return "#FED05D";
  return "#C01448";
};
var predictionColor = (pred) => {
  if (pred === "1") return "#72B743";
  if (pred === "2") return "#FED05D";
  if (pred === "3") return "#C01448";
  return "#DDDDDD";
};
var fetchData = async () => {
  try {
    const [pollenResponse, allergensResponse] = await Promise.all([
      fetchWithTimeout(
        "https://www.astma-allergi.dk/umbraco/api/pollenapi/getpollenfeed",
      ),
      fetchWithTimeout(
        "https://www.astma-allergi.dk/umbraco/api/pollenapi/getallergens",
      ),
    ]);
    const pollenText = await pollenResponse.text();
    const allergensText = await allergensResponse.text();
    await saveCache({ pollenText, allergensText });
    const pollen = JSON.parse(JSON.parse(pollenText));
    const allergens = JSON.parse(JSON.parse(allergensText));
    return [pollen, allergens];
  } catch {
    const cached = await loadCache();
    if (!cached) throw new Error("API og cache utilg\xE6ngelig");
    const { pollenText, allergensText } = cached;
    const pollen = JSON.parse(JSON.parse(pollenText));
    const allergens = JSON.parse(JSON.parse(allergensText));
    return [pollen, allergens];
  }
};
var buildAllergenInformation = (allergens) =>
  Object.entries(allergens.fields.allergens.mapValue.fields).reduce(
    (acc, [id, val]) => {
      const field = val.mapValue.fields;
      acc[id] = {
        name: field.name.stringValue,
        latin: "stringValue" in field.latin ? field.latin.stringValue : "",
      };
      return acc;
    },
    {},
  );
var buildAllergens = (pollen, information) => {
  const feedId = cities[selectedCity];
  if (!feedId) return [[], void 0];
  const feedDate = pollen.fields[feedId]?.mapValue.fields.date.stringValue;
  const feed = pollen.fields[feedId]?.mapValue.fields.data.mapValue.fields;
  const active = Object.entries(feed ?? {})
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
var sort = (active) => {
  const parse = (d) => {
    const [dd, mm, yy] = d.split("-");
    return /* @__PURE__ */ new Date(`${yy}-${mm}-${dd}`).getTime();
  };
  return [
    ...active.reduce((dates, a) => {
      Object.keys(a.predictions).forEach((date) => dates.add(date));
      return dates;
    }, /* @__PURE__ */ new Set()),
  ].sort((a, b) => parse(a) - parse(b));
};
var renderTitle = (active) => {
  if (active.length < 1) {
    console.log("Ingen pollen");
  } else {
    const parts = active.map((a) => `${a.name}: ${a.level}`).join(" ");
    console.log(parts);
  }
};
var renderMeasurements = (active, feedDate) => {
  console.log(`${selectedCity} \u2014 ${feedDate} | color=#888888`);
  for (const a of active) {
    console.log(`${a.name}: ${a.level} | color=${levelColor(a.id, a.level)}`);
  }
};
var renderPredictions = (active, dates) => {
  for (const date of dates) {
    const hasAny = active.some((a) => {
      const pred = a.predictions[date]?.mapValue.fields.prediction.stringValue;
      return pred !== void 0 && pred !== "";
    });
    if (!hasAny) continue;
    console.log("---");
    console.log(`${selectedCity} \u2014 ${date} | color=#888888`);
    for (const a of active) {
      const entry = a.predictions[date]?.mapValue.fields;
      if (!entry) continue;
      const pred = entry.prediction.stringValue;
      if (!pred) continue;
      console.log(
        `${a.name}: ${predictionLabels[pred] ?? pred} | color=${predictionColor(pred)}`,
      );
    }
  }
};
var render = async () => {
  const [pollen, allergens] = await fetchData();
  const allergenInfo = buildAllergenInformation(allergens);
  const [active, feedDate] = buildAllergens(pollen, allergenInfo);
  renderTitle(active);
  console.log("---");
  if (active.length === 0) {
    console.log("Ingen allergener | color=#888888");
    return;
  }
  renderMeasurements(active, feedDate);
  renderPredictions(active, sort(active));
};
render().catch((error) => {
  console.log("\u26A0\uFE0F");
  console.log("---");
  console.log(`Fejl: ${error.message} | color=#e74c3c`);
  console.log("Opdat\xE9r | refresh=true");
});
