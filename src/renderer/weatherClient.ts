import type { WeatherKind, WeatherPermissionState, WeatherState } from "../shared/types";

type BrowserWeatherResult =
  | { ok: true; weather: WeatherState; geolocation: WeatherPermissionState["geolocation"]; message: string }
  | { ok: false; error: string; denied: boolean };

type OpenMeteoResponse = {
  current?: {
    temperature_2m?: number;
    weather_code?: number;
  };
};

type OpenMeteoGeocodingResponse = {
  results?: Array<{
    name?: string;
    latitude?: number;
    longitude?: number;
    country?: string;
    admin1?: string;
    admin2?: string;
  }>;
};

type IpLocation = {
  latitude: number;
  longitude: number;
  label: string;
};

type Coordinates = {
  latitude: number;
  longitude: number;
};

type LocatedCoordinates = Coordinates & {
  geolocation: WeatherPermissionState["geolocation"];
  reason?: string;
};

type ReverseGeocodeResponse = {
  city?: string;
  locality?: string;
  town?: string;
  municipality?: string;
  principalSubdivision?: string;
  countryName?: string;
};

const defaultWeatherLocation = {
  latitude: 31.2304,
  longitude: 121.4737,
  city: "上海"
};

export async function requestBrowserWeather(now: number): Promise<BrowserWeatherResult> {
  try {
    const location = await getWeatherCoordinates();
    const city = await resolveCityName(location);
    const weather = await fetchOpenMeteoWeather(location.latitude, location.longitude, city, now);
    return {
      ok: true,
      weather,
      geolocation: location.geolocation,
      message: location.reason ? `${location.reason}，已使用 ${city} 天气。` : `定位成功，已同步 ${city} 天气。`
    };
  } catch (error) {
    return {
      ok: false,
      error: describeWeatherSyncError(error),
      denied: isPermissionDenied(error)
    };
  }
}

export async function requestWeatherForCity(cityQuery: string, now: number): Promise<BrowserWeatherResult> {
  const city = cityQuery.trim();
  if (!city) {
    return { ok: false, error: "请输入城市名", denied: false };
  }

  try {
    const location = await geocodeCity(city);
    const weather = await fetchOpenMeteoWeather(location.latitude, location.longitude, location.label, now);
    return {
      ok: true,
      weather,
      geolocation: "unknown",
      message: `已锁定城市 ${location.label}，同步当地天气。`
    };
  } catch (error) {
    return {
      ok: false,
      error: describeWeatherSyncError(error),
      denied: false
    };
  }
}

async function geocodeCity(city: string): Promise<IpLocation> {
  const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
  url.searchParams.set("name", city);
  url.searchParams.set("count", "1");
  url.searchParams.set("language", "zh");
  url.searchParams.set("format", "json");

  const payload = await fetchJsonWithTimeout<OpenMeteoGeocodingResponse>(url.toString(), 5000);
  const match = payload.results?.find(
    (result) => typeof result.latitude === "number" && typeof result.longitude === "number"
  );

  if (!match || typeof match.latitude !== "number" || typeof match.longitude !== "number") {
    throw new Error(`没有找到城市：${city}`);
  }

  return {
    latitude: match.latitude,
    longitude: match.longitude,
    label: firstLocationLabel([match.name, match.admin2, match.admin1, match.country], city)
  };
}

async function getWeatherCoordinates(): Promise<LocatedCoordinates> {
  try {
    const position = await getBrowserPosition();
    return {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      geolocation: "granted"
    };
  } catch (error) {
    const reason = describeWeatherSyncError(error);
    if (isPermissionDenied(error)) {
      return {
        ...defaultWeatherLocation,
        geolocation: "denied",
        reason: `${reason}，回退到默认城市上海`
      };
    }

    try {
      const ipLocation = await fetchIpLocation();
      return {
        latitude: ipLocation.latitude,
        longitude: ipLocation.longitude,
        geolocation: "unknown",
        reason: `${reason}，改用 IP 定位`
      };
    } catch (ipError) {
      console.warn("IP location fallback failed", ipError);
      return {
        ...defaultWeatherLocation,
        geolocation: "unknown",
        reason: `${reason}，IP 定位不可用，回退到默认城市上海`
      };
    }
  }
}

function getBrowserPosition(): Promise<GeolocationPosition> {
  if (!navigator.geolocation) {
    return Promise.reject(new Error("当前环境不支持浏览器定位"));
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: false,
      maximumAge: 10 * 60 * 1000,
      timeout: 5000
    });
  });
}

async function resolveCityName(location: Coordinates): Promise<string> {
  if (isDefaultLocation(location)) {
    return defaultWeatherLocation.city;
  }

  const fallback = `定位 ${location.latitude.toFixed(2)}, ${location.longitude.toFixed(2)}`;
  try {
    return await reverseGeocode(location.latitude, location.longitude, fallback);
  } catch (error) {
    console.warn("Reverse geocoding failed", error);
    return fallback;
  }
}

async function reverseGeocode(latitude: number, longitude: number, fallback: string): Promise<string> {
  const url = new URL("https://api.bigdatacloud.net/data/reverse-geocode-client");
  url.searchParams.set("latitude", latitude.toFixed(6));
  url.searchParams.set("longitude", longitude.toFixed(6));
  url.searchParams.set("localityLanguage", "zh");

  const payload = await fetchJsonWithTimeout<ReverseGeocodeResponse>(url.toString(), 5000);
  return firstLocationLabel([
    payload.city,
    payload.locality,
    payload.town,
    payload.municipality,
    payload.principalSubdivision,
    payload.countryName
  ], fallback);
}

async function fetchIpLocation(): Promise<IpLocation> {
  const providers = [fetchIpApiLocation, fetchIpWhoLocation];
  let lastError: unknown = null;

  for (const provider of providers) {
    try {
      return await provider();
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("IP定位失败");
}

async function fetchIpApiLocation(): Promise<IpLocation> {
  type IpApiResponse = {
    latitude?: number;
    longitude?: number;
    city?: string;
    region?: string;
    country_name?: string;
  };

  const payload = await fetchJsonWithTimeout<IpApiResponse>("https://ipapi.co/json/", 5000);
  if (typeof payload.latitude !== "number" || typeof payload.longitude !== "number") {
    throw new Error("ipapi 未返回经纬度");
  }

  return {
    latitude: payload.latitude,
    longitude: payload.longitude,
    label: compactLocationLabel([payload.city, payload.region, payload.country_name])
  };
}

async function fetchIpWhoLocation(): Promise<IpLocation> {
  type IpWhoResponse = {
    success?: boolean;
    latitude?: number;
    longitude?: number;
    city?: string;
    region?: string;
    country?: string;
    message?: string;
  };

  const payload = await fetchJsonWithTimeout<IpWhoResponse>("https://ipwho.is/", 5000);
  if (payload.success === false) {
    throw new Error(payload.message ?? "ipwho 定位失败");
  }
  if (typeof payload.latitude !== "number" || typeof payload.longitude !== "number") {
    throw new Error("ipwho 未返回经纬度");
  }

  return {
    latitude: payload.latitude,
    longitude: payload.longitude,
    label: compactLocationLabel([payload.city, payload.region, payload.country])
  };
}

async function fetchOpenMeteoWeather(
  latitude: number,
  longitude: number,
  city: string,
  now: number
): Promise<WeatherState> {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", latitude.toFixed(4));
  url.searchParams.set("longitude", longitude.toFixed(4));
  url.searchParams.set("current", "temperature_2m,weather_code");
  url.searchParams.set("timezone", "auto");

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`天气服务返回 ${response.status}`);
  }

  const payload = (await response.json()) as OpenMeteoResponse;
  const temperature = Math.round(payload.current?.temperature_2m ?? 24);
  const code = payload.current?.weather_code ?? 3;

  return {
    kind: mapWeatherCodeToKind(code, temperature),
    temperature,
    city,
    updatedAt: now
  };
}

async function fetchJsonWithTimeout<T>(url: string, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`${new URL(url).hostname} 返回 ${response.status}`);
    }
    return (await response.json()) as T;
  } finally {
    window.clearTimeout(timer);
  }
}

function compactLocationLabel(parts: Array<string | undefined>, fallback = "当前位置"): string {
  const label = parts.filter((part): part is string => Boolean(part)).join(", ");
  return label || fallback;
}

function firstLocationLabel(parts: Array<string | undefined>, fallback: string): string {
  return parts.find((part): part is string => Boolean(part?.trim())) ?? fallback;
}

function mapWeatherCodeToKind(code: number, temperature: number): WeatherKind {
  if (temperature >= 30) {
    return "hot";
  }
  if (temperature <= 8) {
    return "cold";
  }
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82) || (code >= 95 && code <= 99)) {
    return "rainy";
  }
  if (code === 0 || code === 1) {
    return "sunny";
  }
  return "cloudy";
}

function isDefaultLocation(location: Coordinates): boolean {
  return (
    Math.abs(location.latitude - defaultWeatherLocation.latitude) < 0.0001 &&
    Math.abs(location.longitude - defaultWeatherLocation.longitude) < 0.0001
  );
}

function isPermissionDenied(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === 1;
}

function describeWeatherSyncError(error: unknown): string {
  if (isGeolocationPositionError(error)) {
    if (error.code === 1) {
      return "定位权限未授权";
    }
    if (error.code === 2) {
      return `无法获取当前位置${error.message ? `：${error.message}` : ""}`;
    }
    if (error.code === 3) {
      return "定位请求超时";
    }
    return error.message || "定位失败";
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "天气同步失败";
}

function isGeolocationPositionError(error: unknown): error is GeolocationPositionError {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "number" &&
    "message" in error &&
    typeof error.message === "string"
  );
}
