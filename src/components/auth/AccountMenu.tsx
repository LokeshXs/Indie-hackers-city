"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { getUserAvatarUrl, getUserDisplayName, getUserInitials } from "@/lib/auth/user-metadata";
import { Button } from "@/components/ui/Button";
import { useAuth } from "./AuthProvider";
import styles from "./AccountMenu.module.css";

export function AccountMenu() {
  const { user, signOut, signInWithGoogle, isLoading } = useAuth();
  const [isSigningIn, setIsSigningIn] = useState(false);
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

  async function handleSignIn() {
    setIsSigningIn(true);
    setError(null);
    try {
      await signInWithGoogle(`${window.location.pathname}${window.location.search}${window.location.hash}`);
    } catch {
      setError("Couldn’t start sign-in. Try again.");
      setIsSigningIn(false);
    }
  }

  if (!user) return (
    <div className={styles.account}>
      <Button size="sm" disabled={isLoading || isSigningIn} onClick={handleSignIn}>
        {isSigningIn ? "Signing in…" : "Log in"}
      </Button>
      {error ? <div className={styles.menu}><p className={styles.loginError} role="alert">{error}</p></div> : null}
    </div>
  );
  const displayName = getUserDisplayName(user) || "Indie hacker";
  const avatarUrl = getUserAvatarUrl(user);

  async function handleSignOut() {
    setIsSigningOut(true);
    setError(null);
    try {
      await signOut();
      setIsOpen(false);
      setIsSigningIn(false);
      setIsSigningOut(false);
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
