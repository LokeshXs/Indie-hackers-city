"use client";

import { useSyncExternalStore } from "react";

/** Whether the visitor has asked their system to keep motion to a minimum.
 *
 * Three places on the map already answered this question with the same fifteen lines -- the cars,
 * the pedestrians, and now the day/night cycle. They also have to agree: a city where the traffic
 * has stopped but the sky is still crossfading is worse than either choice made consistently.
 *
 * A subscription rather than an effect that seeds state, which is what those fifteen lines were.
 * The preference is not React's to own -- it lives in the operating system -- and useSyncExternalStore
 * is the API for reading something that does: it takes the value straight from matchMedia at render
 * time and re-renders only when the media query itself changes. No seeding render, and no window on
 * the server, because the server snapshot is a separate argument. */

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(onStoreChange: () => void): () => void {
  const query = window.matchMedia(QUERY);
  query.addEventListener("change", onStoreChange);
  return () => query.removeEventListener("change", onStoreChange);
}

function getSnapshot(): boolean {
  return window.matchMedia(QUERY).matches;
}

/** The server cannot know, and guessing "reduce" there would ship a still city to everyone for the
 * length of one hydration. */
function getServerSnapshot(): boolean {
  return false;
}

export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
