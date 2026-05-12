import { cities } from "../constants";
import {
  buildAllergenInformation,
  buildAllergens,
  fetchCurrent,
  fetchHistorical,
} from "../data";
import { getWidgetDimensions, drawSparkline } from "./chart";
import { severityColor, getTextStyle, drawGradientBackground } from "./colors";

const chunk = <T>(arr: T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>
    arr.slice(i * size, i * size + size),
  );

interface Allergen {
  id: string;
  name: string;
  level: number;
}

const buildNameLabel = (
  cell: WidgetStack,
  name: string,
  textColor: Color,
  shadowColor: Color,
) => {
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

const buildLevelLabel = (
  cell: WidgetStack,
  level: number,
  textColor: Color,
  shadowColor: Color,
  isZero: boolean,
) => {
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

const buildCellBackground = (
  baseHex: string,
  isZero: boolean,
  history: { x: number; value: number }[],
  cellWidth: number,
  cellHeight: number,
) => {
  const ctx = new DrawContext();
  ctx.size = new Size(cellWidth, cellHeight);
  ctx.opaque = false;
  ctx.respectScreenScale = true;

  drawGradientBackground(ctx, baseHex, isZero, cellWidth, cellHeight);
  drawSparkline(ctx, baseHex, history, cellWidth, cellHeight);

  return ctx.getImage();
};

const buildCell = (
  parent: WidgetStack,
  allergen: Allergen,
  history: { x: number; value: number }[],
  cellWidth: number,
  cellHeight: number,
) => {
  const cellPadding = Math.max(6, Math.min(12, Math.round(cellWidth * 0.085)));

  const cell = parent.addStack();
  cell.size = new Size(cellWidth, cellHeight);
  cell.layoutVertically();
  cell.topAlignContent();
  cell.setPadding(cellPadding, cellPadding, cellPadding, cellPadding);
  cell.cornerRadius = 12;

  const severity = severityColor(allergen.id, allergen.level);
  const isZero = allergen.level === 0 || !severity;
  const baseHex = isZero ? "#8E8E93" : severity!;

  cell.backgroundImage = buildCellBackground(
    baseHex,
    isZero,
    history,
    cellWidth,
    cellHeight,
  );

  const { textColor, shadowColor } = getTextStyle(baseHex, isZero);

  buildNameLabel(cell, allergen.name, textColor, shadowColor);
  cell.addSpacer(6);
  buildLevelLabel(cell, allergen.level, textColor, shadowColor, isZero);
  cell.addSpacer();
};

const buildRow = (
  widget: ListWidget,
  allergens: Allergen[],
  historicalData: Record<string, { x: number; value: number }[]>,
  rowWidth: number,
  cellHeight: number,
  gap: number,
) => {
  const cellWidth = Math.floor(
    (rowWidth - gap * (allergens.length - 1)) / allergens.length,
  );

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

const buildGrid = (
  widget: ListWidget,
  allergens: Allergen[],
  historicalData: Record<string, { x: number; value: number }[]>,
) => {
  const { width: widgetWidth, height: widgetHeight } = getWidgetDimensions();
  const padding = 16;
  const gap = 8;
  const maxPerRow = 3;

  const rows = chunk(allergens, maxPerRow);
  const cellHeight = Math.floor(
    (widgetHeight - padding * 2 - 28 - gap * (rows.length - 1)) / rows.length,
  );
  const gridWidth = widgetWidth - padding * 2;

  for (const [r, row] of rows.entries()) {
    buildRow(widget, row, historicalData, gridWidth, cellHeight, gap);
    if (r < rows.length - 1) {
      widget.addSpacer(gap);
    }
  }
};

const buildError = (widget: ListWidget, error: unknown) => {
  const err = error instanceof Error ? error.message : String(error);
  const errorTitle = widget.addText("⚠️ Fejl");
  errorTitle.font = Font.boldSystemFont(16);
  errorTitle.textColor = new Color("#e74c3c");

  widget.addSpacer(4);

  const errorMsg = widget.addText(err);
  errorMsg.font = Font.systemFont(12);
  errorMsg.textColor = new Color("#e74c3c");
};

const buildNoneText = (widget: ListWidget) => {
  const text = widget.addText("Ingen pollen");
  text.font = Font.boldSystemFont(18);
  text.textColor = new Color("#72B743");
};

export const buildWidget = async (cityName: string) => {
  const widget = new ListWidget();
  widget.setPadding(16, 16, 16, 16);
  widget.spacing = 0;
  widget.backgroundColor = Color.dynamic(
    new Color("#FFFFFF"),
    new Color("#111111"),
  );

  const title = widget.addText("Pollen");
  title.font = Font.boldSystemFont(16);
  title.textColor = Color.dynamic(new Color("#1C1C1E"), new Color("#F2F2F7"));
  title.leftAlignText();

  widget.addSpacer(8);

  try {
    const [pollen, allergens] = await fetchCurrent();
    const allergenInfo = buildAllergenInformation(allergens);
    const stationId = cities[cityName];
    if (!stationId) throw new Error(`Unknown city: ${cityName}`);
    const { allergens: active } = buildAllergens(
      stationId,
      pollen,
      allergenInfo,
    );
    const gridAllergens = active.slice(0, 9);

    const currentYear = new Date().getFullYear();
    const historicalData: Record<string, { x: number; value: number }[]> =
      Object.fromEntries(
        await Promise.all(
          gridAllergens.map(async (a) => {
            try {
              return [
                a.id,
                await fetchHistorical(stationId, a.id, currentYear),
              ] as const;
            } catch {
              return [a.id, []] as const;
            }
          }),
        ),
      );

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
