import { useEffect, useRef } from "react";
import { getCharacterProfile } from "../../shared/config/characters";

export interface ChatMessage {
  speakerId: string;
  text: string;
  isUser: boolean;
  at: number;
}

interface ChatHistoryProps {
  messages: ChatMessage[];
}

export function ChatHistory({ messages }: ChatHistoryProps): React.JSX.Element {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  return (
    <div className="chat-messages">
      {messages.map((msg, i) => {
        const profile = !msg.isUser ? getCharacterProfile(msg.speakerId) : null;
        const time = new Date(msg.at).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
        return (
          <div key={i} className={`chat-msg ${msg.isUser ? "chat-msg-user" : "chat-msg-character"}`}>
            {!msg.isUser && (
              <span className="chat-avatar" style={{ background: profile?.color ?? "#999" }}>
                {profile?.avatar ?? msg.speakerId.slice(0, 1)}
              </span>
            )}
            <div className="chat-bubble-wrap">
              {!msg.isUser && <span className="chat-name">{profile?.name ?? msg.speakerId}</span>}
              <div className="chat-bubble">{msg.text}</div>
              <span className="chat-time">{time}</span>
            </div>
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
