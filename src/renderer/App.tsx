import { useReducer } from "react";
import type { OwnerMode, UIMode } from "../shared/types";
import { ownerModeLabels, uiModeLabels } from "../shared/types";
import type { WorldEvent } from "../shared/events";
import { initialWorldState, reducer } from "../shared/reducer";
import { EventLogPanel } from "./components/EventLogPanel";
import { WorldStatePanel } from "./components/WorldStatePanel";

const ownerModes: OwnerMode[] = ["focus", "rest", "chat", "do_not_disturb"];

export function App(): React.JSX.Element {
  const [world, dispatchBase] = useReducer(reducer, initialWorldState);
  const isMini = world.uiMode === "mini";

  function dispatch(event: WorldEvent): void {
    dispatchBase(event);
  }

  function changeUIMode(mode: UIMode): void {
    dispatch({ type: "UI_MODE_CHANGED", mode, at: Date.now() });
    window.ecosystem.setUIMode(mode).catch((error) => {
      console.error("Failed to resize window", error);
    });
  }

  function changeOwnerMode(mode: OwnerMode): void {
    dispatch({ type: "OWNER_MODE_CHANGED", mode, at: Date.now() });
  }

  return (
    <main className={`app-shell ${isMini ? "is-mini" : "is-full"}`}>
      <header className="top-bar">
        <div>
          <p className="eyebrow">{uiModeLabels[world.uiMode]}</p>
          <h1>生态圈三号</h1>
        </div>
        <button className="mode-toggle" onClick={() => changeUIMode(isMini ? "full" : "mini")}>
          {isMini ? "展开生态舱" : "缩小观察窗"}
        </button>
      </header>

      <section className="content-grid">
        <section className="room-panel" aria-label="生态舱区域">
          <div className="room-header">
            <span>第三空间生态舱</span>
            <span>主人模式：{ownerModeLabels[world.ownerContext.mode]}</span>
          </div>
          <div className="room-stage">
            <div className="window-glow" />
            <div className="desk" />
            <div className="rug" />
            {world.characters.map((character) => (
              <article
                className="character"
                key={character.id}
                style={{
                  left: `${character.position.x}%`,
                  top: `${character.position.y}%`,
                  ["--character-color" as string]: character.color
                }}
              >
                <div className="character-avatar">{character.name.slice(0, 1)}</div>
                <div className="character-card">
                  <strong>{character.name}</strong>
                  <span>{character.currentAction}</span>
                  {!isMini && <p>{character.lastDialogue}</p>}
                </div>
              </article>
            ))}
          </div>
        </section>

        {!isMini && (
          <aside className="side-panel">
            <section>
              <h2>主人模式</h2>
              <div className="owner-mode-grid">
                {ownerModes.map((mode) => (
                  <button
                    className={world.ownerContext.mode === mode ? "active" : ""}
                    key={mode}
                    onClick={() => changeOwnerMode(mode)}
                  >
                    {ownerModeLabels[mode]}
                  </button>
                ))}
              </div>
            </section>

            <WorldStatePanel world={world} />

            <EventLogPanel entries={world.eventLog} />
          </aside>
        )}
      </section>
    </main>
  );
}
