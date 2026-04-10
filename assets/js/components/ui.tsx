import React, { useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { getAssetHost } from "../utils";
import type { ContextMenuItem } from "../types";

export function Spinner() {
  return (
    <div style={{ display: "flex", justifyContent: "center", padding: "2rem" }}>
      <div className="mx-spinner" />
    </div>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="mx-error-banner">
      <span className="mx-error-icon">⚠</span>
      {message}
    </div>
  );
}

export function CharCount({ current, max }: { current: number; max: number }) {
  const remaining = max - current;
  const pct = current / max;
  const color =
    pct > 0.9 ? "#ef4444" : pct > 0.75 ? "#f59e0b" : "var(--mx-muted)";
  return (
    <span style={{ color, fontSize: "0.75rem", fontVariantNumeric: "tabular-nums" }}>
      {remaining}
    </span>
  );
}

export function Avatar({
  avatarUrl,
  name,
  size = "md",
}: {
  avatarUrl?: string | null;
  name?: string | null;
  size?: "sm" | "md" | "lg";
}) {
  const assetHost = getAssetHost();
  const initial = ((name ?? "")[0] || "M").toUpperCase();
  const cls =
    size === "sm"
      ? "mx-tweet-avatar mx-tweet-avatar--sm"
      : size === "lg"
      ? "mx-tweet-avatar mx-tweet-avatar--lg"
      : "mx-tweet-avatar";

  return (
    <div className={cls}>
      {avatarUrl ? (
        <img
          src={`${assetHost}/${avatarUrl}`}
          alt={name ?? "avatar"}
          className="mx-avatar-img"
        />
      ) : (
        <span>{initial}</span>
      )}
    </div>
  );
}

export function ContextMenu({
  x,
  y,
  items,
  onClose,
}: {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  const itemCount = items.filter((i) => i.type === "item").length;
  const sepCount = items.filter((i) => i.type === "separator").length;
  const menuH = itemCount * 34 + sepCount * 9 + 8;
  const menuW = 180;
  const left = Math.min(x, window.innerWidth - menuW - 8);
  const top = Math.min(y, window.innerHeight - menuH - 8);

  return createPortal(
    <div
      ref={ref}
      className="mx-context-menu"
      style={{ left, top }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item, i) =>
        item.type === "separator" ? (
          <div key={i} className="mx-context-menu-separator" />
        ) : (
          <button
            key={i}
            className="mx-context-menu-item"
            onClick={() => {
              item.onClick();
              onClose();
            }}
          >
            {item.label}
          </button>
        )
      )}
    </div>,
    document.body
  );
}
