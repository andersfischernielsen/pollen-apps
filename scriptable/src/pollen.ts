import { buildWidget } from "./widget/widget";
import { defaultCity } from "./constants";

const cityName = (args.widgetParameter ||
  args.shortcutParameter ||
  defaultCity) as string;

await buildWidget(cityName);
