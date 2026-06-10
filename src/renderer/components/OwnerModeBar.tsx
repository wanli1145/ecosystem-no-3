import type { OwnerMode } from "../../shared/types";
import { ownerModeLabels } from "../../shared/types";

const ownerModes: OwnerMode[] = ["focus", "rest", "chat", "do_not_disturb"];

interface OwnerModeBarProps {
  currentMode: OwnerMode;
  onModeChange: (mode: OwnerMode) => void;
}

export function OwnerModeBar({ currentMode, onModeChange }: OwnerModeBarProps): React.JSX.Element {
  return (
    <section>
      <h2>主人模式</h2>
      <div className="owner-mode-grid">
        {ownerModes.map((mode) => (
          <button
            className={currentMode === mode ? "active" : ""}
            key={mode}
            onClick={() => onModeChange(mode)}
          >
            {ownerModeLabels[mode]}
          </button>
        ))}
      </div>
    </section>
  );
}
