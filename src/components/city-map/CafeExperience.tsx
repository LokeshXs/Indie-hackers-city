"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { Html } from "@react-three/drei";
import type { CityEntity } from "./map-types";
import type { AuthContextValue } from "@/lib/auth/types";
import { useCafePresence } from "@/hooks/useCafePresence";
import { useCafeAudio } from "@/hooks/useCafeAudio";
import { initials, type CafeMember } from "@/lib/cafes/presence";
import styles from "./CafeExperience.module.css";

type CafeAuth = Pick<AuthContextValue, "user" | "signInWithGoogle">;

function MemberAvatar({ member }: { member: CafeMember }) {
  const [failed, setFailed] = useState(false);
  return member.avatarUrl && !failed
    ? <Image src={member.avatarUrl} width={36} height={36} alt="" onError={() => setFailed(true)} />
    : <>{initials(member.name)}</>;
}

function CoffeeIcon() {
  return <Image src="/assets/cafes/standup_cafe/coffee_icon.png" width={40} height={40} sizes="40px" className={styles.coffeeIcon} alt="" aria-hidden="true" />;
}

/** The channel stays connected while the map is open, including when the panel is closed. */
export function CafeExperience({ entity, user, signInWithGoogle }: { entity: CityEntity } & CafeAuth) {
  return (
    // Anchor the pointer above the roof. The bubble has a fixed screen size, so centering
    // it here would let its lower half cover the building as the camera zooms out.
    <Html position={[entity.position.x, entity.position.y + 4.06 * (entity.scale ?? 1) + 0.8, entity.position.z]} zIndexRange={[5, 1]}>
      <CafePanel cafeId={entity.id} user={user} signInWithGoogle={signInWithGoogle} />
    </Html>
  );
}

// Drei Html renders into a separate DOM root: pass auth across that boundary.
export function CafePanel({ cafeId = "coffee-shop", user, signInWithGoogle }: { cafeId?: string } & CafeAuth) {
  const audio = useCafeAudio();
  const playLabel = audio.loading ? "Cancel loading music" : audio.playing ? "Pause cafe music" : "Play cafe music";
  const presence = useCafePresence(cafeId, user);
  const { members, connection, seat, busy, error } = presence;
  const seated = Boolean(seat);
  const intention = seat?.intention ?? "";
  const [authError, setAuthError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const bubbleRef = useRef<HTMLButtonElement>(null);
  const count = members.length;


  useEffect(() => {
    if (!open) return;
    dialogRef.current?.showModal();
    const bubble = bubbleRef.current;
    return () => {
      const target = returnFocusRef.current?.isConnected ? returnFocusRef.current : bubble;
      target?.focus({ preventScroll: true });
    };
  }, [open]);

  function openCafe() {
    returnFocusRef.current = document.activeElement as HTMLElement | null;
    setDraft(intention);
    setOpen(true);
  }

  async function handleSeat() {
    if (user) { await presence.changeSeat(seated ? null : draft); return; }
    setSigningIn(true);
    setAuthError(null);
    try { await signInWithGoogle("/"); }
    catch { setAuthError("Couldn’t sign you in. Please try again."); setSigningIn(false); }
  }

  return <>
    {presence.notice.length ? createPortal(<aside className={styles.joinToast} role="status" aria-live="polite">
      <CoffeeIcon /><div><strong>{presence.notice.length === 1 ? `${presence.notice[0].name} took a seat at StandUp Cafe` : `${presence.notice[0].name} and ${presence.notice.length - 1} others joined StandUp Cafe`}</strong>
      {presence.notice.length === 1 && presence.notice[0].intention ? <p>{presence.notice[0].intention}</p> : null}
      <button type="button" onClick={() => { presence.dismissNotice(); openCafe(); }}>Join cafe</button></div>
      <button type="button" aria-label="Dismiss cafe notification" onClick={presence.dismissNotice}>×</button>
    </aside>, document.body) : null}
    <div className={styles.anchor} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()} onDoubleClick={(event) => event.stopPropagation()} onWheel={(event) => event.stopPropagation()}>
      <div className={styles.bubble}>
        <button ref={bubbleRef} type="button" className={styles.bubbleBody} onClick={openCafe} aria-label={`Open StandUp Cafe, ${connection === "connected" ? `${count} working` : connection}`} aria-haspopup="dialog" aria-expanded={open}>
          <CoffeeIcon />
          <span className={styles.bubbleDetails}>
            <span className={styles.bubbleHeading}>{connection === "offline" ? "Cafe offline" : connection === "connecting" ? "Connecting…" : count ? `${count} working` : "Take a seat"}</span>
            <span className={styles.visitors} aria-hidden="true">
              {members.slice(0, 3).map((person) => <span key={person.userId}><MemberAvatar member={person} /></span>)}
              {count > 3 ? <span>+{count - 3}</span> : null}
            </span>
          </span>
        </button>
        {audio.playing && !audio.muted && audio.volume > 0 ? <span className={styles.soundBars} aria-hidden="true"><i /><i /><i /></span> : null}
        <button type="button" className={styles.bubblePlay} onClick={audio.togglePlayback} aria-label={playLabel} title={audio.error || playLabel}><span aria-hidden="true">{audio.loading ? "…" : audio.playing ? "❚❚" : "▶"}</span></button>
      </div>
      {audio.error && !open ? <span className={styles.audioError} role="alert">{audio.error}</span> : null}
    </div>
    {open ? createPortal(
      <dialog ref={dialogRef} className={styles.panel} aria-labelledby="cafe-title" aria-describedby="cafe-presence-note" onCancel={() => setOpen(false)} onClick={(event) => { if (event.target === event.currentTarget) { const rect = event.currentTarget.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) setOpen(false); } }}>
        <div className={styles.panelInner}>
          <header className={styles.header}>
            <div className={styles.brandMark}><CoffeeIcon /></div>
            <button type="button" className={styles.close} onClick={() => setOpen(false)} aria-label="Close cafe">×</button>
            <p className={styles.subtitle}>Work from Cafe</p>
            <h2 id="cafe-title">StandUp Cafe</h2>
            <p>A little company for whatever you’re building.</p>
          </header>
          <div className={styles.content}>
            <p id="cafe-presence-note" className={styles.previewNote}>{connection === "connected" ? "See who’s working here. Take a seat to join them." : "Cafe connection unavailable. We’ll reconnect automatically."}</p>
            {error || authError ? <p role="alert" className={styles.error}>{error || authError}</p> : null}
            <section className={styles.seatSection} aria-label="Your cafe seat">
              <div className={styles.seatHeading}><span className={styles.statusDot} /><strong>{seated ? "Your seat is saved" : "There’s a seat for you"}</strong><span>No rush.</span></div>
              <p>Bring your work. Music is optional.</p>
              <button type="button" className={seated ? styles.leaveButton : styles.joinButton} disabled={busy || signingIn || connection !== "connected"} onClick={handleSeat}>{busy ? "Updating seat…" : signingIn ? "Signing in…" : !user ? "Sign in to take a seat" : seated ? "Leave cafe" : "Take a seat"}<span aria-hidden="true">{seated ? "↗" : "+"}</span></button>
              <form className={styles.intentionForm} onSubmit={(event) => { event.preventDefault(); void presence.changeSeat(draft); }}>
                <label htmlFor="cafe-intention">What are you working on? <span>Optional</span></label>
                <input id="cafe-intention" maxLength={100} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Shipping my landing page…" aria-describedby="cafe-intention-help" />
                <div className={styles.inputFoot}><small id="cafe-intention-help">Visible to everyone in the city when seated.</small>{seated ? <button type="submit" disabled={busy || connection !== "connected" || draft.trim() === intention}>Save</button> : null}</div>
              </form>
            </section>
            <section className={styles.peopleSection} aria-labelledby="cafe-people-title">
              <div className={styles.sectionHeading}><h3 id="cafe-people-title">Around the tables</h3><span aria-live="polite">{connection === "connected" ? `${count} here` : "Reconnecting…"}</span></div>
              <ul className={styles.people}>
                {members.map((person) => <li key={person.userId}><span className={styles.avatar}><MemberAvatar member={person} /></span><div><strong>{person.name}{person.userId === user?.id ? <small>You</small> : null}</strong><p>{person.intention || "Enjoying some quiet company"}</p></div></li>)}
              </ul>
              {!count && connection === "connected" ? <p className={styles.empty}>Be the first to take a seat.</p> : null}
            </section>
            <section className={styles.music} aria-labelledby="cafe-music-title">
              <div className={styles.sectionHeading}><h3 id="cafe-music-title">Cafe soundtrack</h3><span aria-live="polite">{audio.loading ? "Loading…" : audio.playing ? "Now playing" : "Press play to listen"}</span></div>
              <div className={styles.track}><span className={styles.record} aria-hidden="true">♫</span><div><strong>StandUp Cafe · Track 1</strong><p>A little music for your work. Repeats on a loop.</p></div></div>
              <div className={styles.musicControls}><button type="button" onClick={audio.togglePlayback} aria-label={playLabel}>{audio.loading ? "…" : audio.playing ? "❚❚" : "▶"}</button><button type="button" onClick={audio.toggleMute} aria-label={audio.muted ? "Unmute cafe music" : "Mute cafe music"} aria-pressed={audio.muted}>{audio.muted ? "Unmute" : "Mute"}</button><label>Volume<input type="range" min="0" max="100" value={audio.volume} onChange={(event) => audio.changeVolume(Number(event.target.value))} aria-label="Music volume" /></label></div>
              {audio.error ? <p className={styles.error} role="alert">{audio.error}</p> : null}
            </section>
            <label className={styles.notificationSetting}><input type="checkbox" checked={presence.notifications} onChange={presence.toggleNotifications} />Notify me when someone joins a cafe</label>
            <footer className={styles.footer}><CoffeeIcon /><span>Good company. Your own pace.</span></footer>
          </div>
        </div>
      </dialog>, document.body,
    ) : null}
  </>;
}
