interface DialogueBubbleProps {
  text: string;
}

export function DialogueBubble({ text }: DialogueBubbleProps): React.JSX.Element | null {
  if (!text) {
    return null;
  }

  return (
    <div className="dialogue-bubble">
      <p>{text}</p>
    </div>
  );
}
