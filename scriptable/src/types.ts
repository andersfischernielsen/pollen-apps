export interface DocumentMap<T> {
  mapValue: { fields: T };
}

export interface PollenDocument {
  fields: {
    [id: string]: DocumentMap<{
      date: { stringValue: string };
      data: DocumentMap<{
        [id: string]: DocumentMap<{
          level: { integerValue: string };
          inSeason: { booleanValue: boolean };
        }>;
      }>;
    }>;
  };
}

export interface AllergensDocument {
  fields: {
    allergens: DocumentMap<{
      [id: string]: DocumentMap<{
        name: { stringValue: string };
        latin: { stringValue: string };
      }>;
    }>;
  };
}

export interface HistoricalDocument {
  fields: {
    monthlyData: DocumentMap<{
      [month: string]: DocumentMap<{
        [day: string]: { integerValue: string };
      }>;
    }>;
  };
}

export interface Allergen {
  id: string;
  name: string;
  latin: string;
  level: number;
  inSeason: boolean;
}
