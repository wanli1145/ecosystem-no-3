import { useState, type KeyboardEvent } from "react";
import { getCharacterProfile } from "../../shared/config/characters";
import { ChatHistory, type ChatMessage } from "./ChatHistory";

interface ChatPanelProps {
  selectedCharacterId: string | null;
  messages: ChatMessage[];
  onSendMessage: (text: string) => void;
  isLoading: boolean;
}

export function ChatPanel({ selectedCharacterId, messages, onSendMessage, isLoading }: ChatPanelProps): React.JSX.Element {
  const [input, setInput] = useState("");
  const profile = selectedCharacterId ? getCharacterProfile(selectedCharacterId) : null;

  function handleSend() {
    const text = input.trim();
    if (!text || !selectedCharacterId || isLoading) return;
    onSendMessage(text);
    setInput("");
  }

  function handleKey(e: KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  if (!selectedCharacterId) {
    return (
      <div className="chat-panel chat-panel-empty">
        <span className="chat-hint">点击角色头像开始聊天</span>
      </div>
    );
  }

  return (
    <div className="chat-panel">
      <div className="chat-header" style={{ borderColor: profile?.color }}>
        <span className="chat-header-avatar" style={{ background: profile?.color }}>
          {profile?.avatar}
        </span>
        <span className="chat-header-name">{profile?.name}</span>
        {isLoading && <span className="chat-thinking">思考中...</span>}
      </div>
      <ChatHistory messages={messages.filter((m) => m.speakerId === selectedCharacterId || m.isUser)} />
      <div className="chat-input-row">
        <input
          className="chat-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder={`和${profile?.name}说点什么...`}
          disabled={isLoading}
        />
        <button className="chat-send-btn" onClick={handleSend} disabled={!input.trim() || isLoading}>
          发送
        </button>
      </div>
    </div>
  );
}
