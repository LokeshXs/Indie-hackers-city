import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCafeAudio } from "./useCafeAudio";

class FakeAudio extends EventTarget {
  src = "";
  preload = "";
  loop = false;
  volume = 1;
  muted = false;
  error: object | null = null;
  play = vi.fn(async () => { this.dispatchEvent(new Event("playing")); });
  pause = vi.fn(() => { this.dispatchEvent(new Event("pause")); });
  load = vi.fn();
  removeAttribute = vi.fn(() => { this.src = ""; });
}

const BUCKET = "https://cafe-audio.example.com";

describe("lazy cafe audio", () => {
  let audio: FakeAudio;
  beforeEach(() => {
    audio = new FakeAudio();
    vi.stubEnv("NEXT_PUBLIC_CAFE_SONG_URL", BUCKET);
    vi.stubGlobal("Audio", vi.fn(function () { return audio; }));
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  it("does not create or load audio until Play, even when volume or mute changes", async () => {
    const { result } = renderHook(() => useCafeAudio());
    act(() => { result.current.changeVolume(30); result.current.toggleMute(); });
    expect(Audio).not.toHaveBeenCalled();
    expect(audio.src).toBe("");
    await act(async () => { await result.current.togglePlayback(); });
    expect(Audio).toHaveBeenCalledOnce();
    expect(audio.src).toBe(`${BUCKET}/standup_cafe/songs/song1.mp3`);
    expect(audio.preload).toBe("none");
    expect(audio.loop).toBe(true);
    expect(audio.volume).toBe(.3);
    expect(audio.muted).toBe(true);
    expect(result.current.playing).toBe(true);
  });

  it("joins the bucket URL to the track without doubling the separator", async () => {
    vi.stubEnv("NEXT_PUBLIC_CAFE_SONG_URL", `${BUCKET}/`);
    const { result } = renderHook(() => useCafeAudio());
    await act(async () => { await result.current.togglePlayback(); });
    expect(audio.src).toBe(`${BUCKET}/standup_cafe/songs/song1.mp3`);
  });

  it("reports an unconfigured bucket instead of requesting a missing track", async () => {
    vi.stubEnv("NEXT_PUBLIC_CAFE_SONG_URL", "");
    const { result } = renderHook(() => useCafeAudio());
    await act(async () => { await result.current.togglePlayback(); });
    expect(Audio).not.toHaveBeenCalled();
    expect(result.current.error).toBeTruthy();
    expect(result.current.playing).toBe(false);
  });

  it("reuses the player on pause/resume and stops it when unmounted", async () => {
    const { result, rerender, unmount } = renderHook(() => useCafeAudio());
    await act(async () => { await result.current.togglePlayback(); });
    rerender();
    expect(audio.pause).not.toHaveBeenCalled();
    await act(async () => { await result.current.togglePlayback(); });
    expect(result.current.playing).toBe(false);
    await act(async () => { await result.current.togglePlayback(); });
    expect(Audio).toHaveBeenCalledOnce();
    expect(audio.play).toHaveBeenCalledTimes(2);
    act(() => { result.current.changeVolume(20); result.current.toggleMute(); });
    expect(audio.volume).toBe(.2);
    expect(audio.muted).toBe(true);
    unmount();
    expect(audio.src).toBe("");
    expect(audio.load).toHaveBeenCalledOnce();
  });

  it("reports a failed play and allows an explicit retry", async () => {
    audio.play.mockRejectedValueOnce(new Error("Blocked"));
    const { result } = renderHook(() => useCafeAudio());
    await act(async () => { await result.current.togglePlayback(); });
    expect(result.current.error).toBeTruthy();
    expect(result.current.loading).toBe(false);
    await act(async () => { await result.current.togglePlayback(); });
    expect(result.current.playing).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it("cancels a pending play without reporting the resulting rejection as an error", async () => {
    let rejectPlay!: (error: Error) => void;
    audio.play.mockImplementationOnce(() => new Promise<void>((_resolve, reject) => { rejectPlay = reject; }));
    const { result } = renderHook(() => useCafeAudio());
    let pending!: Promise<void>;
    act(() => { pending = result.current.togglePlayback(); });
    expect(result.current.loading).toBe(true);
    await act(async () => { await result.current.togglePlayback(); rejectPlay(new Error("Aborted")); await pending; });
    expect(result.current.loading).toBe(false);
    expect(result.current.playing).toBe(false);
    expect(result.current.error).toBeNull();
  });
});
