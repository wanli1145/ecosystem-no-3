import type { DayPeriod, WeatherKind, WeatherVisualKind, WeatherVisualState } from "../types";

export type WeatherIllustrationConfig = {
  id: string;
  weather: WeatherVisualKind;
  period: DayPeriod;
  label: string;
  assetPath: string;
};

const weatherIllustrations = {
  sunny: {
    morning: illustration("sunny", "morning", "晴天早晨"),
    noon: illustration("sunny", "noon", "晴天中午"),
    evening: illustration("sunny", "evening", "晴天夜晚")
  },
  rainy: {
    morning: illustration("rainy", "morning", "雨天早晨"),
    noon: illustration("rainy", "noon", "雨天中午"),
    evening: illustration("rainy", "evening", "雨天夜晚")
  },
  cloudy: {
    morning: illustration("cloudy", "morning", "阴天早晨"),
    noon: illustration("cloudy", "noon", "阴天中午"),
    evening: illustration("cloudy", "evening", "阴天夜晚")
  },
} satisfies Record<WeatherVisualKind, Record<DayPeriod, WeatherIllustrationConfig>>;

export function createWeatherAssetPath(weather: WeatherVisualKind, period: DayPeriod): string {
  return `assets/backgrounds/weather/${weather}-${period}.png`;
}

export function getWeatherIllustrations(): Record<WeatherVisualKind, Record<DayPeriod, WeatherIllustrationConfig>> {
  return weatherIllustrations;
}

export function resolveDayPeriod(at: number): DayPeriod {
  const hour = new Date(at).getHours();
  if (hour >= 5 && hour < 11) {
    return "morning";
  }
  if (hour >= 11 && hour < 18) {
    return "noon";
  }
  return "evening";
}

export function resolveWeatherVisual(input: {
  weather: WeatherKind;
  at: number;
  reason: string;
  applyToRoom?: boolean;
}): WeatherVisualState {
  const period = resolveDayPeriod(input.at);
  const visualWeather = normalizeWeatherVisualKind(input.weather);
  const illustration = weatherIllustrations[visualWeather][period];
  return {
    weather: visualWeather,
    period,
    illustrationId: illustration.id,
    assetPath: illustration.assetPath,
    reason: input.reason,
    updatedAt: input.at,
    applyToRoom: input.applyToRoom ?? true
  };
}

function normalizeWeatherVisualKind(weather: WeatherKind): WeatherVisualKind {
  if (weather === "rainy") {
    return "rainy";
  }
  if (weather === "cloudy" || weather === "cold") {
    return "cloudy";
  }
  return "sunny";
}

function illustration(weather: WeatherVisualKind, period: DayPeriod, label: string): WeatherIllustrationConfig {
  return {
    id: `${weather}-${period}`,
    weather,
    period,
    label,
    assetPath: createWeatherAssetPath(weather, period)
  };
}
