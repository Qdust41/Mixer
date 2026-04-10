import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import { getAssetHost } from "../utils";
import type { MediaItem } from "../types";

export function TweetMedia({ media }: { media: MediaItem[] }) {
  const assetHost = getAssetHost();
  return (
    <div style={{ marginTop: "0.5rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
      {media.map((m) =>
        /\.(mp4|mov)$/i.test(m.s3Key) ? (
          <video
            key={m.id}
            src={`${assetHost}/${m.s3Key}`}
            controls
            style={{ maxWidth: "100%", borderRadius: "0.5rem" }}
          />
        ) : (
          <img
            key={m.id}
            src={`${assetHost}/${m.s3Key}`}
            alt=""
            style={{ maxWidth: "100%", borderRadius: "0.5rem", display: "block" }}
          />
        )
      )}
    </div>
  );
}

export function MediaLightbox({ item, onClose }: { item: MediaItem; onClose: () => void }) {
  const assetHost = getAssetHost();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  return createPortal(
    <div className="mx-lightbox" onClick={onClose}>
      <button className="mx-lightbox-close" onClick={onClose}>✕</button>
      <div className="mx-lightbox-content" onClick={(e) => e.stopPropagation()}>
        {/\.(mp4|mov)$/i.test(item.s3Key) ? (
          <video src={`${assetHost}/${item.s3Key}`} controls autoPlay className="mx-lightbox-media" />
        ) : (
          <img src={`${assetHost}/${item.s3Key}`} alt="" className="mx-lightbox-media" />
        )}
      </div>
    </div>,
    document.body
  );
}
