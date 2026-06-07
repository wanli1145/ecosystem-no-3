import type { WorldLogEntry } from "../../shared/types";

type EventLogPanelProps = {
  entries: WorldLogEntry[];
};

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString("zh-CN", { hour12: false });
}

function eventTypeLabel(type: string): string {
  switch (type) {
    case "init":
      return "初始化";
    case "ui_mode_changed":
      return "界面";
    case "owner_mode_changed":
      return "模式";
    case "owner_care":
      return "关怀";
    case "owner_task_assigned":
      return "任务";
    case "character_dragged":
      return "移动";
    case "character_near":
      return "互动";
    case "weather_changed":
      return "天气";
    case "dialogue_generated":
      return "对话";
    case "day_summary_created":
      return "日报";
    default:
      return "事件";
  }
}

export function EventLogPanel({ entries }: EventLogPanelProps): React.JSX.Element {
  return (
    <section className="event-log-panel">
      <h2>事件日志</h2>
      {entries.length === 0 ? (
        <p className="event-log-empty">暂无事件记录</p>
      ) : (
        <ol className="event-log">
          {entries.map((entry) => (
            <li key={entry.id} className={`event-log-item event-type-${entry.type}`}>
              <span className="event-type-badge">{eventTypeLabel(entry.type)}</span>
              <time>{formatTime(entry.at)}</time>
              <span className="event-text">{entry.text}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
