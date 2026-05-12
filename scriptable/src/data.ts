import {
  type PollenDocument,
  type AllergensDocument,
  type HistoricalDocument,
  type Allergen,
} from "./types";
import { loadCache, saveCache } from "./cache";

const parseDocument = <T>(text: string): T => JSON.parse(JSON.parse(text));

export const fetchCurrent = async () => {
  try {
    const pollenReq = new Request(
      "https://www.astma-allergi.dk/umbraco/api/pollenapi/getpollenfeed",
    );
    const allergensReq = new Request(
      "https://www.astma-allergi.dk/umbraco/api/pollenapi/getallergens",
    );

    pollenReq.timeoutInterval = 2;
    allergensReq.timeoutInterval = 2;

    const [pollenText, allergensText] = await Promise.all([
      pollenReq.loadString(),
      allergensReq.loadString(),
    ]);

    const pollen = parseDocument<PollenDocument>(pollenText);
    const allergens = parseDocument<AllergensDocument>(allergensText);

    await saveCache({ pollenText, allergensText });

    return [pollen, allergens] as const;
  } catch {
    const cached = loadCache();
    if (!cached) {
      throw new Error("API and cache unavailable");
    }
    const pollen = parseDocument<PollenDocument>(cached.pollenText);
    const allergens = parseDocument<AllergensDocument>(cached.allergensText);
    return [pollen, allergens] as const;
  }
};

export const buildAllergenInformation = (
  allergens: AllergensDocument,
): Record<string, { name: string; latin: string }> =>
  Object.fromEntries(
    Object.entries(allergens.fields.allergens.mapValue.fields).map(
      ([id, val]) => {
        const f = val.mapValue.fields;
        return [id, { name: f.name.stringValue, latin: f.latin.stringValue }];
      },
    ),
  );

export const buildAllergens = (
  stationId: string,
  pollen: PollenDocument,
  info: Record<string, { name: string; latin: string }>,
) => {
  const cityField = pollen.fields[stationId]?.mapValue.fields;
  if (!cityField)
    return {
      allergens: [] as Allergen[],
      date: undefined as string | undefined,
    };

  const date = cityField.date.stringValue;
  const feed = cityField.data.mapValue.fields;

  const allergens = Object.entries(feed)
    .map(([id, value]) => {
      const f = value.mapValue.fields;
      return {
        id,
        name: info[id]?.name ?? id,
        latin: info[id]?.latin ?? "",
        level: parseInt(f.level.integerValue),
        inSeason: f.inSeason.booleanValue,
      };
    })
    .filter((a): a is Allergen => a.inSeason)
    .sort((a, b) => b.level - a.level);

  return { allergens, date };
};

const isLeapYear = (year: number) =>
  (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

const cumulativeDaysBefore = (year: number) => {
  const february = isLeapYear(year) ? 29 : 28;
  const lengths = [0, 31, february, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const cumulative = [0];
  for (let i = 0; i < 11; i++) cumulative.push(cumulative[i]! + lengths[i]!);
  return cumulative;
};

export const fetchHistorical = async (
  stationId: string,
  allergenId: string,
  year: number,
) => {
  const url = `https://www.astma-allergi.dk/umbraco/api/PollenApi/GetHistoricalData?stationId=${stationId}&allergenId=${allergenId}&year=${year}`;
  const req = new Request(url);
  req.timeoutInterval = 5;

  const text = await req.loadString();
  const data = parseDocument<HistoricalDocument>(text);
  const monthly = data.fields.monthlyData.mapValue.fields;
  const daysBefore = cumulativeDaysBefore(year);

  return Object.entries(monthly)
    .sort(([a], [b]) => parseInt(a) - parseInt(b))
    .flatMap(([monthStr, monthVal]) => {
      const month = parseInt(monthStr);
      const days = monthVal.mapValue.fields;
      return Object.entries(days)
        .sort(([a], [b]) => parseInt(a) - parseInt(b))
        .map(([dayStr, dayVal]) => {
          const day = parseInt(dayStr);
          const offset = daysBefore[month - 1];
          const value = parseInt(dayVal.integerValue);
          return offset !== undefined ? { x: offset + day, value } : null;
        })
        .filter((p): p is { x: number; value: number } => p !== null);
    });
};
