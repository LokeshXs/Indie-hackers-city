"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { getUserAvatarUrl, getUserDisplayName, getUserInitials } from "@/lib/auth/user-metadata";
import { useAuth } from "./AuthProvider";
import styles from "./AccountMenu.module.css";

export function AccountMenu() {
  const { user, signOut } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [failedAvatarUrl, setFailedAvatarUrl] = useState("");
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    function handlePointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [isOpen]);

  if (!user) return null;
  const displayName = getUserDisplayName(user) || "Indie hacker";
  const avatarUrl = getUserAvatarUrl(user);

  async function handleSignOut() {
    setIsSigningOut(true);
    setError(null);
    try {
      await signOut();
      setIsOpen(false);
    } catch {
      setError("Couldn’t sign out. Try again.");
      setIsSigningOut(false);
    }
  }

  return (
    <div ref={containerRef} className={styles.account}>
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        aria-label={`Account menu for ${displayName}`}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => { setIsOpen((current) => !current); setError(null); }}
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          setIsOpen(false);
          triggerRef.current?.focus();
        }}
      >
        {avatarUrl && failedAvatarUrl !== avatarUrl ? (
          <Image className={styles.avatar} src={avatarUrl} alt="" fill sizes="58px" unoptimized onError={() => setFailedAvatarUrl(avatarUrl)} />
        ) : getUserInitials(user)}
      </button>
      {isOpen ? (
        <div
          className={styles.menu}
          role="menu"
          onKeyDown={(event) => {
            if (event.key !== "Escape") return;
            event.preventDefault();
            setIsOpen(false);
            triggerRef.current?.focus();
          }}
        >
          <div className={styles.identity}>
            <strong>{displayName}</strong>
            {user.email ? <span>{user.email}</span> : null}
          </div>
          <button className={styles.signOut} role="menuitem" type="button" disabled={isSigningOut} onClick={handleSignOut}>
            {isSigningOut ? "Signing out…" : "Sign out"}
          </button>
          {error ? <p className={styles.error} role="alert">{error}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
