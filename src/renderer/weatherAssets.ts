import type { DayPeriod, WeatherVisualKind } from "../shared/types";
import { createWeatherAssetPath } from "../shared/config/weather";
import sunnyMorningUrl from "../../assets/backgrounds/weather/sunny-morning.png";
import sunnyNoonUrl from "../../assets/backgrounds/weather/sunny-noon.png";
import sunnyEveningUrl from "../../assets/backgrounds/weather/sunny-evening.png";
import cloudyMorningUrl from "../../assets/backgrounds/weather/cloudy-morning.png";
import cloudyNoonUrl from "../../assets/backgrounds/weather/cloudy-noon.png";
import cloudyEveningUrl from "../../assets/backgrounds/weather/cloudy-evening.png";
import rainyMorningUrl from "../../assets/backgrounds/weather/rainy-morning.png";
import rainyNoonUrl from "../../assets/backgrounds/weather/rainy-noon.png";
import rainyEveningUrl from "../../assets/backgrounds/weather/rainy-evening.png";

const weatherAssetUrls = {
  sunny: {
    morning: sunnyMorningUrl,
    noon: sunnyNoonUrl,
    evening: sunnyEveningUrl
  },
  cloudy: {
    morning: cloudyMorningUrl,
    noon: cloudyNoonUrl,
    evening: cloudyEveningUrl
  },
  rainy: {
    morning: rainyMorningUrl,
    noon: rainyNoonUrl,
    evening: rainyEveningUrl
  }
} satisfies Record<WeatherVisualKind, Record<DayPeriod, string>>;

const weatherWindowAssetUrls: Record<string, string> = {
  [createWeatherAssetPath("sunny", "morning")]: weatherAssetUrls.sunny.morning,
  [createWeatherAssetPath("sunny", "noon")]: weatherAssetUrls.sunny.noon,
  [createWeatherAssetPath("sunny", "evening")]: weatherAssetUrls.sunny.evening,
  [createWeatherAssetPath("cloudy", "morning")]: weatherAssetUrls.cloudy.morning,
  [createWeatherAssetPath("cloudy", "noon")]: weatherAssetUrls.cloudy.noon,
  [createWeatherAssetPath("cloudy", "evening")]: weatherAssetUrls.cloudy.evening,
  [createWeatherAssetPath("rainy", "morning")]: weatherAssetUrls.rainy.morning,
  [createWeatherAssetPath("rainy", "noon")]: weatherAssetUrls.rainy.noon,
  [createWeatherAssetPath("rainy", "evening")]: weatherAssetUrls.rainy.evening
};

export function getWeatherWindowAssetUrl(assetPath: string): string | null {
  return weatherWindowAssetUrls[assetPath] ?? null;
}
