import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import type { CharacterState } from "../../shared/types";
import { getCharacterVisualConfig, resolveCharacterSpriteState } from "../../shared/config/characters";

type CharacterSpriteProps = {
  character: CharacterState;
  isMini: boolean;
};

export function CharacterSprite({ character, isMini }: CharacterSpriteProps): React.JSX.Element {
  const config = getCharacterVisualConfig(character.id);
  const spriteState = resolveCharacterSpriteState(character);
  const stateConfig = config && spriteState ? config.states[spriteState] : null;
  const [frame, setFrame] = useState(0);
  const [spriteLoadFailed, setSpriteLoadFailed] = useState(false);

  useEffect(() => {
    setSpriteLoadFailed(false);
    if (!config?.spriteUrl) {
      return;
    }

    const image = new Image();
    image.onerror = () => setSpriteLoadFailed(true);
    image.src = config.spriteUrl;
  }, [config?.spriteUrl]);

  useEffect(() => {
    setFrame(0);
    if (!stateConfig || stateConfig.frames <= 1) {
      return;
    }

    const intervalMs = Math.max(80, Math.round(stateConfig.durationMs / stateConfig.frames));
    const timer = window.setInterval(() => {
      setFrame((current) => (current + 1) % stateConfig.frames);
    }, intervalMs);

    return () => window.clearInterval(timer);
  }, [spriteState, stateConfig?.durationMs, stateConfig?.frames]);

  if (!config || !spriteState || !stateConfig || spriteLoadFailed) {
    return <div className="character-avatar">{character.name.slice(0, 1)}</div>;
  }

  const frameWidth = isMini ? 56 : 84;
  const frameHeight = frameWidth * 208 / 192;
  const style: CSSProperties = {
    backgroundImage: `url(${config.spriteUrl})`,
    backgroundPosition: `${-frame * frameWidth}px ${-stateConfig.row * frameHeight}px`,
    backgroundSize: `${config.spriteColumns * 100}% ${config.spriteRows * 100}%`
  };

  return (
    <div
      aria-label={`${character.name} ${spriteState}`}
      className={`character-sprite ${isMini ? "is-mini" : ""}`}
      role="img"
      style={style}
      title={`${config.name} · ${spriteState}`}
    />
  );
}
