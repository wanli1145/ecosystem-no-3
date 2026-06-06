import { useReducer, useState } from "react";
import type { OwnerMode, UIMode } from "../shared/types";
import { ownerModeLabels, uiModeLabels, weatherLabels } from "../shared/types";
import type { WorldEvent } from "../shared/events";
import { initialWorldState, reducer } from "../shared/reducer";
import { getCharacterProfile } from "../shared/config/characters";

const ownerModes: OwnerMode[] = ["focus", "rest", "chat", "do_not_disturb"];

export function App(): React.JSX.Element {
  const [world, dispatchBase] = useReducer(reducer, initialWorldState);
  const isMini = world.uiMode === "mini";
  const [showCardId, setShowCardId] = useState<string | null>(null);

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
            {world.characters.map((character) => {
              const profile = getCharacterProfile(character.id);
              return (
                <article
                className="character"
                key={character.id}
                style={{
                  left: `${character.position.x}%`,
                  top: `${character.position.y}%`,
                  ["--character-color" as string]: character.color
                }}
              >
                <div
                  className="character-avatar"
                  aria-label={character.name}
                  onClick={() => setShowCardId(showCardId === character.id ? null : character.id)}
                  style={{ cursor: "pointer" }}
                >
                  {profile ? profile.avatar : character.name.slice(0, 1)}
                </div>
                {showCardId === character.id && profile && (
                <div className="character-card">
                  <strong>{character.name}</strong>
                  <div className="character-tags">{profile.personalityTags.map(t => <span className="tag" key={t}>{t}</span>)}</div>
                  <span>{character.currentAction}</span>
                  <span>{character.lastDialogue}</span>
                  <span className="character-tone">语气：{profile.defaultTone}</span>
                </div>
                )}
              </article>
            )})}
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

            <section>
              <h2>WorldState</h2>
              <dl className="state-list">
                <div>
                  <dt>uiMode</dt>
                  <dd>{world.uiMode}</dd>
                </div>
                <div>
                  <dt>weather</dt>
                  <dd>{weatherLabels[world.weather.kind]}</dd>
                </div>
                <div>
                  <dt>owner.mode</dt>
                  <dd>{world.ownerContext.mode}</dd>
                </div>
                <div>
                  <dt>presence</dt>
                  <dd>{world.ownerContext.presence}</dd>
                </div>
                <div>
                  <dt>focus.min</dt>
                  <dd>{world.ownerContext.todayFocusMinutes}</dd>
                </div>
                <div>
                  <dt>characters</dt>
                  <dd>{world.characters.length}</dd>
                </div>
                <div>
                  <dt>llm.mode</dt>
                  <dd>{world.llmBudget.mode}</dd>
                </div>
                <div>
                  <dt>pending</dt>
                  <dd>{world.pendingSocialEvent ? world.pendingSocialEvent.kind : "none"}</dd>
                </div>
              </dl>
            </section>

            <section>
              <h2>事件日志</h2>
              <ol className="event-log">
                {world.eventLog.map((entry) => (
                  <li key={entry.id}>
                    <time>{new Date(entry.at).toLocaleTimeString("zh-CN", { hour12: false })}</time>
                    <span>{entry.text}</span>
                  </li>
                ))}
              </ol>
            </section>
          </aside>
        )}
      </section>
    </main>
  );
}
