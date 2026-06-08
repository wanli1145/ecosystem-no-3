import { useCallback, useReducer, useRef, useState } from "react";
import type { OwnerMode, UIMode } from "../shared/types";
import { ownerModeLabels, uiModeLabels, weatherLabels } from "../shared/types";
import type { WorldEvent } from "../shared/events";
import { initialWorldState, reducer } from "../shared/reducer";
import { OwnerModeBar } from "./components/OwnerModeBar";
import { CharacterActionMenu } from "./components/CharacterActionMenu";
import { DialogueBubble } from "./components/DialogueBubble";
import { MoodParticles } from "./components/MoodParticles";
import { getDiverseResponse } from "./data/responses";

export function App(): React.JSX.Element {
  const [world, dispatchBase] = useReducer(reducer, initialWorldState);
  const isMini = world.uiMode === "mini";

  interface ParticleEffect {
    id: number;
    characterId: string;
    careType: string;
    color: string;
  }
  const [particles, setParticles] = useState<ParticleEffect[]>([]);
  const nextIdRef = useRef(0);

  const removeParticle = useCallback((id: number) => {
    setParticles((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const triggerParticles = useCallback(
    (characterId: string, careType: string, color: string) => {
      const id = nextIdRef.current++;
      setParticles((prev) => [...prev, { id, characterId, careType, color }]);
    },
    []
  );


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

  function handleCare(characterId: string, careType: "coffee" | "snack" | "pet"): void {
    dispatch({ type: "OWNER_CARE", targetId: characterId, careType, at: Date.now() });
    const text = getDiverseResponse(careType);
    dispatch({ type: "DIALOGUE_GENERATED", speakerId: characterId, text, at: Date.now() });
    const ch = world.characters.find((c) => c.id === characterId);
    if (ch) triggerParticles(characterId, careType, ch.color);
  }

  function handleAssignTask(characterId: string, task: "study" | "rest" | "chat"): void {
    dispatch({ type: "OWNER_TASK_ASSIGNED", targetId: characterId, task, at: Date.now() });
    const text = getDiverseResponse(task);
    dispatch({ type: "DIALOGUE_GENERATED", speakerId: characterId, text, at: Date.now() });
    const ch = world.characters.find((c) => c.id === characterId);
    if (ch) triggerParticles(characterId, task, ch.color);
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
                <div className="character-card">
                  <div className="character-card-row">
                    <div className="character-avatar">{character.name.slice(0, 1)}</div>
                    <strong>{character.name}</strong>
                    <span>{character.currentAction}</span>
                    {!isMini && (
                      <CharacterActionMenu
                        characterId={character.id}
                        onCare={handleCare}
                        onAssignTask={handleAssignTask}
                      />
                    )}
                  </div>
                  {!isMini && <DialogueBubble text={character.lastDialogue} />}
                </div>
                {particles.filter(p=>p.characterId===character.id).map(p=>(
                  <MoodParticles key={p.id} careType={p.careType} characterColor={p.color} onComplete={()=>removeParticle(p.id)} />
                ))}
              </article>
            ))}
          </div>
        </section>

        {!isMini && (
          <aside className="side-panel">
            <OwnerModeBar
              currentMode={world.ownerContext.mode}
              onModeChange={changeOwnerMode}
            />

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
