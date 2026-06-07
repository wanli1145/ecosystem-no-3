import type { WeatherKind } from "../types";

export type WeatherRule = {
  kind: WeatherKind;
  label: string;
  moodHint: string;
  actionBias: "energetic" | "relaxed" | "focused" | "cozy";
  sampleEvents: string[];
};

export const weatherRules: Record<WeatherKind, WeatherRule> = {
  sunny: {
    kind: "sunny",
    label: "晴天",
    moodHint: "明亮、轻快，适合户外活动或晒太阳",
    actionBias: "energetic",
    sampleEvents: [
      "阳光透过窗户洒进来，房间变得暖洋洋的。",
      "今天天气很好，适合出去走走。",
      "窗外的光线很柔和，适合阅读。",
      "阳光照在桌面上，感觉很温暖。",
      "是个适合泡茶发呆的好天气。"
    ]
  },
  rainy: {
    kind: "rainy",
    label: "雨天",
    moodHint: "安静、内省，适合待在室内",
    actionBias: "cozy",
    sampleEvents: [
      "雨滴敲打着窗户，节奏很舒缓。",
      "外面在下雨，房间里很安静。",
      "雨天适合窝在沙发上听音乐。",
      "空气里有湿润的味道，很清新。",
      "下雨天，热饮格外好喝。"
    ]
  },
  cloudy: {
    kind: "cloudy",
    label: "阴天",
    moodHint: "平和、中性，适合专注工作",
    actionBias: "focused",
    sampleEvents: [
      "天空有些阴沉，光线很均匀。",
      "阴天的光线不刺眼，很适合看屏幕。",
      "云层很厚，但不会下雨。",
      "今天适合安静地做自己的事。",
      "阴天有种特别的宁静感。"
    ]
  },
  hot: {
    kind: "hot",
    label: "高温",
    moodHint: "慵懒、缓慢，需要多喝水",
    actionBias: "relaxed",
    sampleEvents: [
      "气温有点高，先喝杯水吧。",
      "今天比较热，空调是个好伙伴。",
      "天气热，适合做些轻松的事。",
      "午后有点犯困，可能是天气的原因。",
      "高温天，记得补充水分。"
    ]
  },
  cold: {
    kind: "cold",
    label: "降温",
    moodHint: "温暖、包裹感，适合喝热饮",
    actionBias: "cozy",
    sampleEvents: [
      "降温了，加件外套比较舒服。",
      "冷天适合喝一杯热可可。",
      "窗外有点冷，屋里很暖和。",
      "天气冷了，窝在室内更有安全感。",
      "降温天，热汤是最好的安慰。"
    ]
  }
};

/**
 * 根据天气类型返回随机的示例事件文本
 */
export function getRandomSampleEvent(kind: WeatherKind): string {
  const rule = weatherRules[kind];
  const index = Math.floor(Math.random() * rule.sampleEvents.length);
  return rule.sampleEvents[index];
}
