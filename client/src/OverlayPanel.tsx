import type { ReactNode } from "react";

type OverlayPanelProps = {
  ariaLabel: string;
  children: ReactNode;
  className?: string;
  onClose: () => void;
};

export function OverlayPanel({
  ariaLabel,
  children,
  className = "",
  onClose,
}: OverlayPanelProps) {
  return (
    <div
      className="overlay-panel-layer"
      onClick={onClose}
      role="presentation"
    >
      <div
        aria-label={ariaLabel}
        aria-modal="true"
        className={`overlay-panel ${className}`.trim()}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        {children}
      </div>
    </div>
  );
}
