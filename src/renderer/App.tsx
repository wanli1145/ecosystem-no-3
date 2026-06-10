import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type { OwnerMode, UIMode } from "../shared/types";
import { ownerModeLabels, uiModeLabels, weatherLabels } from "../shared/types";
import type { WorldEvent } from "../shared/events";
import { initialWorldState, reducer } from "../shared/reducer";
import { OwnerModeBar } from "./components/OwnerModeBar";
import { CharacterActionMenu } from "./components/CharacterActionMenu";
import { DialogueBubble } from "./components/DialogueBubble";
import { MoodParticles } from "./components/MoodParticles";
import { LLMConfigPanel } from "./components/LLMConfigPanel";
import { ChatPanel } from "./components/ChatPanel";
import type { ChatMessage } from "./components/ChatHistory";
import { getDiverseResponse } from "./data/responses";
import { chatWithCharacter, chatBetweenCharacters, chatWithCharacterWithContext, extractMemory, proactiveAction, getTimeOfDay } from "./services/llmService";
import { getCharacterProfile } from "../shared/config/characters";

export function App(): React.JSX.Element {
  const [world, dispatchBase] = useReducer(reducer, initialWorldState);
  const isMini = world.uiMode === "mini";
  const [showCardId, setShowCardId] = useState<string | null>(null);

  interface ParticleEffect {
    id: number;
    characterId: string;
    careType: string;
    color: string;
  }
  const [particles, setParticles] = useState<ParticleEffect[]>([]);
  const nextIdRef = useRef(0);

  /* ── LLM loading state ── */
  const [loadingChars, setLoadingChars] = useState<Set<string>>(new Set());
  const [llmReady, setLlmReady] = useState(false);

  /* ── 聊天状态 ── */
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [selectedCharId, setSelectedCharId] = useState<string | null>(null);
  const [chatLoading, setChatLoading] = useState(false);

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

  /* ── 自动角色间对话 + 主动行为定时器 ── */
  useEffect(() => {
    if (!llmReady) return;
    let cancelled = false;

    async function doProactiveAction() {
      if (cancelled) return;
      const chars = world.characters;
      if (chars.length === 0) return;

      const timeOfDay = getTimeOfDay();
      // 深夜不打扰
      if (timeOfDay === "late_night") { scheduleNext(); return; }

      const randomChar = chars[Math.floor(Math.random() * chars.length)];
      const idleAgo = Date.now() - world.ownerContext.lastInteractionAt;
      const text = await proactiveAction(randomChar.id, timeOfDay, idleAgo);
      if (cancelled || !text) { scheduleNext(); return; }

      dispatch({ type: "DIALOGUE_GENERATED", speakerId: randomChar.id, text, at: Date.now() });
      // 同时加入聊天记录
      setChatMessages((prev) => [...prev, { speakerId: randomChar.id, text, isUser: false, at: Date.now() }]);
      scheduleNext();
    }

    async function doAutoChat() {
      if (cancelled) return;
      const chars = world.characters;
      if (chars.length < 2) { scheduleNext(); return; }

      const i = Math.floor(Math.random() * chars.length);
      let j = Math.floor(Math.random() * (chars.length - 1));
      if (j >= i) j++;

      const turns = await chatBetweenCharacters(chars[i].id, chars[j].id);
      if (cancelled || turns.length === 0) { scheduleNext(); return; }

      for (const turn of turns) {
        if (cancelled) break;
        dispatch({ type: "DIALOGUE_GENERATED", speakerId: turn.speakerId, text: turn.text, at: Date.now() });
        setChatMessages((prev) => [...prev, { speakerId: turn.speakerId, text: turn.text, isUser: false, at: Date.now() }]);
        await new Promise((r) => setTimeout(r, 800));
      }
      scheduleNext();
    }

    function scheduleNext() {
      if (cancelled) return;
      const delay = 45000 + Math.random() * 75000; // 45-120秒
      timerId = setTimeout(async () => {
        // 60% 概率触发自主行为，40% 概率触发角色间对话
        if (Math.random() < 0.6) {
          await doProactiveAction();
        } else {
          await doAutoChat();
        }
      }, delay);
    }

    let timerId = setTimeout(() => scheduleNext(), 40000);
    return () => { cancelled = true; clearTimeout(timerId); };
  }, [llmReady, world.characters, world.ownerContext.lastInteractionAt]);


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
    const ch = world.characters.find((c) => c.id === characterId);
    if (ch) triggerParticles(characterId, careType, ch.color);

    // LLM 回复（异步，不阻塞事件 dispatch）
    setLoadingChars((prev) => new Set(prev).add(characterId));
    chatWithCharacter(characterId, careType).then((text) => {
      dispatch({ type: "DIALOGUE_GENERATED", speakerId: characterId, text, at: Date.now() });
    }).finally(() => {
      setLoadingChars((prev) => { const next = new Set(prev); next.delete(characterId); return next; });
    });
  }

  function handleAssignTask(characterId: string, task: "study" | "rest" | "chat"): void {
    dispatch({ type: "OWNER_TASK_ASSIGNED", targetId: characterId, task, at: Date.now() });
    const ch = world.characters.find((c) => c.id === characterId);
    if (ch) triggerParticles(characterId, task, ch.color);

    setLoadingChars((prev) => new Set(prev).add(characterId));
    chatWithCharacter(characterId, task).then((text) => {
      dispatch({ type: "DIALOGUE_GENERATED", speakerId: characterId, text, at: Date.now() });
    }).finally(() => {
      setLoadingChars((prev) => { const next = new Set(prev); next.delete(characterId); return next; });
    });
  }

  /* ── 发送聊天消息 ── */
  function handleSendMessage(text: string) {
    if (!selectedCharId || chatLoading) return;
    const now = Date.now();
    // 添加用户消息
    setChatMessages((prev) => [...prev, { speakerId: selectedCharId, text, isUser: true, at: now }]);
    setChatLoading(true);

    // 调用 LLM 获取回复
    chatWithCharacterWithContext(selectedCharId, text, chatMessages, world.memories).then((reply) => {
      if (!reply) return;
      dispatch({ type: "DIALOGUE_GENERATED", speakerId: selectedCharId, text: reply, at: Date.now() });
      setChatMessages((prev) => [...prev, { speakerId: selectedCharId, text: reply, isUser: false, at: Date.now() }]);
      // 异步提取记忆
      extractMemory(selectedCharId, text).then((mem) => {
        if (mem) {
          dispatch({ type: "DIALOGUE_GENERATED", speakerId: selectedCharId, text: `[记住了：${mem.key} - ${mem.value}]`, at: Date.now() });
        }
      });
    }).finally(() => setChatLoading(false));
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
                    ["--character-color" as string]: character.color,
                  }}
                >
                <div
                  className={`character-avatar ${selectedCharId === character.id ? "selected" : ""}`}
                  aria-label={character.name}
                  onClick={() => {
                    setSelectedCharId(selectedCharId === character.id ? null : character.id);
                    setShowCardId(showCardId === character.id ? null : character.id);
                  }}
                  style={{ cursor: "pointer" }}
                >
                  {profile ? profile.avatar : character.name.slice(0, 1)}
                </div>
                {showCardId === character.id && profile && (
                <div className="character-card">
                <div className="character-card-row">
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
                <div className="character-tags">{profile.personalityTags.map(t => <span className="tag" key={t}>{t}</span>)}</div>
                <span className="character-tone">语气：{profile.defaultTone}</span>
                {!isMini && (
                  loadingChars.has(character.id)
                    ? <div className="thinking-indicator"><span /><span /><span /></div>
                    : <DialogueBubble text={character.lastDialogue} />
                )}
                </div>
                )}
                {particles.filter(p => p.characterId === character.id).map(p => (
                <MoodParticles key={p.id} careType={p.careType} characterColor={p.color} onComplete={() => removeParticle(p.id)} />
                ))}
                </article>
                );
                })}
          </div>
          {!isMini && (
            <ChatPanel
              selectedCharacterId={selectedCharId}
              messages={chatMessages}
              onSendMessage={handleSendMessage}
              isLoading={chatLoading}
            />
          )}
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

            <LLMConfigPanel onConfigured={() => setLlmReady(true)} />
          </aside>
        )}
      </section>
    </main>
  );
}
