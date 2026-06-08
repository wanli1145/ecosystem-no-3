import { useEffect } from "react";

interface MoodParticlesProps {
  careType: string;
  characterColor: string;
  onComplete: () => void;
}

const EMOJI_MAP: Record<string, string[]> = {
  coffee: ["☕", "✨", "🌟", "💫", "✨"],
  snack: ["🍪", "✨", "💫", "🌟", "🎉"],
  pet: ["💕", "🐾", "✨", "💖", "✨"],
  study: ["📚", "✨", "💡", "🌟", "📖"],
  rest: ["💤", "☁️", "🌙", "✨", "🍃"],
  chat: ["💬", "✨", "🌟", "💫", "✨"],
};

export function MoodParticles({ careType, characterColor, onComplete }: MoodParticlesProps): React.JSX.Element {
  const emojis = EMOJI_MAP[careType] ?? EMOJI_MAP.coffee;

  useEffect(() => {
    const timer = setTimeout(onComplete, 3800);
    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <div className="mood-particles">
      {emojis.map((emoji, i) => {
        const xOffset = (Math.random() - 0.5) * 100;
        const drift = (Math.random() - 0.5) * 40;
        const delay = Math.random() * 0.6;
        const rotation = (Math.random() - 0.5) * 60;

        return (
          <span
            key={i}
            className="mood-particle"
            style={{
              "--x-offset": `${xOffset}px`,
              "--drift": `${drift}px`,
              "--delay": `${delay}s`,
              "--rotation": `${rotation}deg`,
              "--particle-color": characterColor,
              fontSize: `${18 + Math.random() * 10}px`,
            } as React.CSSProperties}
          >
            {emoji}
          </span>
        );
      })}
    </div>
  );
}
