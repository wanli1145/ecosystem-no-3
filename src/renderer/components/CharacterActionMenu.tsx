import { useState, useRef, useEffect } from "react";

interface CharacterActionMenuProps {
  characterId: string;
  onCare: (characterId: string, careType: "coffee" | "snack" | "pet") => void;
  onAssignTask: (characterId: string, task: "study" | "rest" | "chat") => void;
}

export function CharacterActionMenu({
  characterId,
  onCare,
  onAssignTask,
}: CharacterActionMenuProps): React.JSX.Element {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isMenuOpen) return;
    const handler = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (menuRef.current && !menuRef.current.contains(t) && !(t instanceof HTMLButtonElement && t.dataset.menuTrigger === "true")) {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isMenuOpen]);

  return (
    <div className="character-action-menu-container">
      <button
        ref={triggerRef}
        className="character-action-trigger"
        data-menu-trigger="true"
        onClick={(e) => {
          e.stopPropagation();
          setIsMenuOpen(!isMenuOpen);
        }}
      >
        ⋯
      </button>
      {isMenuOpen && (
        <div
          ref={menuRef}
          className="character-action-menu"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="menu-section">
            <div className="menu-section-title">照顾</div>
            <button className="menu-item" onClick={() => { onCare(characterId, "coffee"); setIsMenuOpen(false); }}>咖啡</button>
            <button className="menu-item" onClick={() => { onCare(characterId, "snack"); setIsMenuOpen(false); }}>零食</button>
            <button className="menu-item" onClick={() => { onCare(characterId, "pet"); setIsMenuOpen(false); }}>摸摸</button>
          </div>
          <div className="menu-section">
            <div className="menu-section-title">安排</div>
            <button className="menu-item" onClick={() => { onAssignTask(characterId, "study"); setIsMenuOpen(false); }}>安排学习</button>
            <button className="menu-item" onClick={() => { onAssignTask(characterId, "rest"); setIsMenuOpen(false); }}>安排休息</button>
            <button className="menu-item" onClick={() => { onAssignTask(characterId, "chat"); setIsMenuOpen(false); }}>安排聊天</button>
          </div>
        </div>
      )}
    </div>
  );
}
