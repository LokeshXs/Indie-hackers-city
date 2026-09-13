"use client";

import Image from "next/image";
import { useState } from "react";
import styles from "./OnlineFounderMarker.module.css";

interface OnlineFounderMarkerProps {
  fullName: string;
  avatarUrl: string | null;
  text?: string;
}

export function OnlineFounderMarker({ fullName, avatarUrl, text = "Online" }: OnlineFounderMarkerProps) {
  const [failedAvatarUrl, setFailedAvatarUrl] = useState<string | null>(null);
  const name = fullName.trim() || "Founder";
  const initials = name.split(/\s+/).slice(0, 2).map((part) => Array.from(part)[0]).join("").toUpperCase();
  let supportedAvatar = false;
  if (avatarUrl) {
    try {
      const url = new URL(avatarUrl);
      supportedAvatar = url.protocol === "https:" && url.hostname === "lh3.googleusercontent.com";
    } catch { /* The initials remain visible for invalid URLs. */ }
  }
  const label = `${name} is online${text !== "Online" ? `: ${text}` : ""}`;

  return (
    <div className={styles.marker} role="img" aria-label={label}>
      <div className={styles.pill} aria-hidden="true"><span>{text}</span></div>
      <div className={styles.avatarFrame} aria-hidden="true">
        <div className={styles.portrait}>
          {supportedAvatar && avatarUrl && failedAvatarUrl !== avatarUrl ? (
            <Image src={avatarUrl} alt="" width={28} height={28} unoptimized onError={() => setFailedAvatarUrl(avatarUrl)} />
          ) : initials}
        </div>
        <span className={styles.onlineDot} />
      </div>
    </div>
  );
}
