import { act, renderHook } from "@testing-library/react";
import type { User } from "@supabase/supabase-js";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const fake = vi.hoisted(() => ({ sync: () => {}, subscribe: (_status: string) => { void _status; }, state: {} as Record<string, unknown[]>, track: vi.fn(), untrack: vi.fn(), remove: vi.fn() }));
vi.mock("@/lib/supabase/config", () => ({ isSupabaseConfigured: () => true }));
vi.mock("@/lib/supabase/client", () => ({ getSupabaseBrowserClient: () => ({
  channel: () => {
    const channel = { on: (_type: string, _filter: unknown, cb: () => void) => { fake.sync = cb; return channel; },
      subscribe: (cb: (status: string) => void) => { fake.subscribe = cb; return channel; },
      presenceState: () => fake.state, track: fake.track, untrack: fake.untrack };
    return channel;
  }, removeChannel: fake.remove,
}) }));
import { useCityPresence } from "./useCityPresence";
const me: User = { id: "me", user_metadata: { full_name: "Me" }, app_metadata: {}, aud: "authenticated", created_at: "2026-09-13T00:00:00Z" };
const member = { userId: "other", name: "Maya" };
async function connect() { await act(async () => { fake.subscribe("SUBSCRIBED"); fake.sync(); }); }

 describe("city presence", () => {
  beforeEach(() => { vi.useFakeTimers(); fake.state = {}; vi.clearAllMocks(); fake.track.mockResolvedValue("ok"); });
  afterEach(() => vi.useRealTimers());
  it("tracks signed-in users and removes the channel on unmount", async () => {
    const { unmount } = renderHook(() => useCityPresence(me));
    await connect();
    expect(fake.track).toHaveBeenCalledWith({ userId: "me", name: "Me" });
    unmount();
    expect(fake.remove).toHaveBeenCalledOnce();
  });
  it("lets guests observe without publishing a presence", async () => {
    renderHook(() => useCityPresence(null)); await connect();
    expect(fake.track).not.toHaveBeenCalled();
  });
  it("shows existing users without arrival toasts and deduplicates their tabs", async () => {
    const { result } = renderHook(() => useCityPresence(me));
    fake.state = { a: [member], b: [member] }; await connect();
    expect([...result.current.onlineIds]).toEqual(["other"]);
    expect(result.current.notice).toEqual([]);
    act(() => { fake.state = { b: [member] }; fake.sync(); });
    expect(result.current.onlineIds.has("other")).toBe(true);
    act(() => { fake.state = {}; fake.sync(); });
    expect(result.current.onlineIds.size).toBe(0);
  });
  it("notifies other users once, dismisses, and suppresses extra tabs and reconnects", async () => {
    const { result } = renderHook(() => useCityPresence(me)); await connect();
    act(() => { fake.state = { a: [member], self: [{ userId: "me", name: "Me" }] }; fake.sync(); vi.advanceTimersByTime(700); });
    expect(result.current.notice).toEqual([member]);
    act(() => vi.advanceTimersByTime(6000));
    expect(result.current.notice).toEqual([]);
    act(() => { fake.state.b = [member]; fake.sync(); vi.advanceTimersByTime(700); });
    expect(result.current.notice).toEqual([]);
    await act(async () => { fake.subscribe("CHANNEL_ERROR"); fake.subscribe("SUBSCRIBED"); fake.sync(); vi.advanceTimersByTime(700); });
    expect(result.current.notice).toEqual([]);
  });
  it("suppresses brief disconnects but announces a later return", async () => {
    const { result } = renderHook(() => useCityPresence(me));
    fake.state = { a: [member] }; await connect();
    act(() => { fake.state = {}; fake.sync(); vi.advanceTimersByTime(1000); fake.state = { a: [member] }; fake.sync(); vi.advanceTimersByTime(700); });
    expect(result.current.notice).toEqual([]);
    act(() => { fake.state = {}; fake.sync(); vi.advanceTimersByTime(31000); fake.state = { a: [member] }; fake.sync(); vi.advanceTimersByTime(700); });
    expect(result.current.notice).toEqual([member]);
  });
});
