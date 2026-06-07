import type { WorldState } from "../../shared/types";
import { ownerModeLabels, uiModeLabels, weatherLabels } from "../../shared/types";

type WorldStatePanelProps = {
  world: WorldState;
};

function llmModeLabel(mode: WorldState["llmBudget"]["mode"]): string {
  switch (mode) {
    case "quiet":
      return "安静";
    case "normal":
      return "正常";
    case "active":
      return "活跃";
  }
}

export function WorldStatePanel({ world }: WorldStatePanelProps): React.JSX.Element {
  return (
    <section className="world-state-panel">
      <h2>WorldState</h2>
      <dl className="state-list">
        <div>
          <dt>uiMode</dt>
          <dd>{uiModeLabels[world.uiMode]}</dd>
        </div>
        <div>
          <dt>owner.mode</dt>
          <dd>{ownerModeLabels[world.ownerContext.mode]}</dd>
        </div>
        <div>
          <dt>owner.presence</dt>
          <dd>{world.ownerContext.presence}</dd>
        </div>
        <div>
          <dt>weather.kind</dt>
          <dd>{weatherLabels[world.weather.kind]}</dd>
        </div>
        <div>
          <dt>weather.city</dt>
          <dd>{world.weather.city}</dd>
        </div>
        <div>
          <dt>weather.temp</dt>
          <dd>{world.weather.temperature}°C</dd>
        </div>
        <div>
          <dt>focus.min</dt>
          <dd>{world.ownerContext.todayFocusMinutes}</dd>
        </div>
        <div>
          <dt>llm.mode</dt>
          <dd>{llmModeLabel(world.llmBudget.mode)}</dd>
        </div>
        <div>
          <dt>llm.quota</dt>
          <dd>{world.llmBudget.callsUsedThisHour}/{world.llmBudget.maxCallsPerHour}</dd>
        </div>
        <div>
          <dt>characters</dt>
          <dd>{world.characters.length}</dd>
        </div>
        <div>
          <dt>pending</dt>
          <dd>{world.pendingSocialEvent ? world.pendingSocialEvent.kind : "none"}</dd>
        </div>
      </dl>
    </section>
  );
}
