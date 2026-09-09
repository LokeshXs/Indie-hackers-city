"use client";

import { useEffect, useRef, useState } from "react";

const SONG_KEY = "standup_cafe/songs/song1.mp3";

/**
 * The track streams from R2 rather than the app bundle -- it is ~72 MB, an order of
 * magnitude past every other asset here. Returns null when the bucket has not been
 * configured, so an unconfigured checkout says so instead of retrying a 404 forever.
 */
function resolveSongUrl(): string | null {
  const base = process.env.NEXT_PUBLIC_CAFE_SONG_URL;
  return base ? `${base.replace(/\/+$/, "")}/${SONG_KEY}` : null;
}

/** No audio element or source exists until the listener explicitly presses Play. */
export function useCafeAudio() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const requestedRef = useRef(false);
  const attemptRef = useRef(0);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(65);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => () => {
    attemptRef.current += 1;
    requestedRef.current = false;
    cleanupRef.current?.();
    const audio = audioRef.current;
    audioRef.current = null;
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }
  }, []);

  async function togglePlayback() {
    if (requestedRef.current) {
      requestedRef.current = false;
      attemptRef.current += 1;
      audioRef.current?.pause();
      setPlaying(false);
      setLoading(false);
      return;
    }
    const songUrl = resolveSongUrl();
    if (!songUrl) {
      setError("The cafe soundtrack isn’t configured for this environment.");
      return;
    }
    let audio = audioRef.current;
    if (!audio) {
      // Bound as a const so the cleanup closure below captures a player that is known
      // non-null; a captured `let` widens back to its declared type inside a closure.
      const player = new Audio();
      player.preload = "none";
      player.loop = true;
      player.volume = volume / 100;
      player.muted = muted;
      const onPlaying = () => { setPlaying(true); setLoading(false); setError(null); };
      const onPause = () => { requestedRef.current = false; setPlaying(false); setLoading(false); };
      const onWaiting = () => { if (requestedRef.current) { setLoading(true); setPlaying(false); } };
      const onError = () => {
        requestedRef.current = false;
        setPlaying(false);
        setLoading(false);
        setError("Couldn’t play the cafe soundtrack. Press Play to try again.");
      };
      player.addEventListener("playing", onPlaying);
      player.addEventListener("pause", onPause);
      player.addEventListener("waiting", onWaiting);
      player.addEventListener("error", onError);
      cleanupRef.current = () => {
        player.removeEventListener("playing", onPlaying);
        player.removeEventListener("pause", onPause);
        player.removeEventListener("waiting", onWaiting);
        player.removeEventListener("error", onError);
      };
      player.src = songUrl;
      audioRef.current = player;
      audio = player;
    } else if (audio.error) {
      audio.load();
    }
    const attempt = ++attemptRef.current;
    requestedRef.current = true;
    setLoading(true);
    setError(null);
    try {
      await audio.play();
    } catch {
      if (attempt !== attemptRef.current) return;
      requestedRef.current = false;
      setPlaying(false);
      setLoading(false);
      setError("Couldn’t play the cafe soundtrack. Press Play to try again.");
    }
  }

  function toggleMute() {
    const next = !muted;
    setMuted(next);
    if (audioRef.current) audioRef.current.muted = next;
  }

  function changeVolume(next: number) {
    const clamped = Math.max(0, Math.min(100, next));
    setVolume(clamped);
    if (audioRef.current) audioRef.current.volume = clamped / 100;
  }

  return { playing, loading, muted, volume, error, togglePlayback, toggleMute, changeVolume };
}
