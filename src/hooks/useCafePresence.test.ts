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
import { useCafePresence } from "./useCafePresence";
const me: User = { id: "me", user_metadata: { full_name: "My Name" }, app_metadata: {}, aud: "authenticated", created_at: "2026-09-09T00:00:00Z" };
const member = (overrides = {}) => ({ userId: "other", name: "Other Founder", avatarUrl: "", intention: "Shipping", seatId: "seat-1", joinedAt: Date.now(), updatedAt: Date.now(), ...overrides });
const storageKey = "city:cafe-seat:v1:coffee-shop:me";
async function connect() { await act(async () => { fake.subscribe("SUBSCRIBED"); fake.sync(); }); }

describe("cafe realtime presence", () => {
  beforeEach(() => { vi.useFakeTimers(); localStorage.clear(); fake.state = {}; vi.clearAllMocks(); fake.track.mockResolvedValue("ok"); fake.untrack.mockResolvedValue("ok"); });
  afterEach(() => vi.useRealTimers());
  it("deduplicates tabs, uses the latest intention, and removes disconnected members", async () => {
    const { result, unmount } = renderHook(() => useCafePresence("coffee-shop", me));
    fake.state = { tab1: [member()], tab2: [member({ intention: "Updated", updatedAt: Date.now() + 1 })] };
    await connect();
    expect(result.current.members).toHaveLength(1);
    expect(result.current.members[0].intention).toBe("Updated");
    expect(result.current.notice).toEqual([]);
    act(() => { fake.state = {}; fake.sync(); });
    expect(result.current.members).toEqual([]);
    unmount(); expect(fake.remove).toHaveBeenCalledOnce();
  });
  it("groups explicit arrivals and suppresses own joins, updates and reconnects", async () => {
    const { result } = renderHook(() => useCafePresence("coffee-shop", me));
    await connect();
    act(() => { fake.state = { a: [member()], b: [member({ userId: "second", seatId: "seat-2" })], me: [member({ userId: "me", seatId: "mine" })] }; fake.sync(); vi.advanceTimersByTime(1500); });
    expect(result.current.notice).toHaveLength(2);
    act(() => { result.current.dismissNotice(); fake.sync(); vi.advanceTimersByTime(1500); });
    expect(result.current.notice).toEqual([]);
    await act(async () => { fake.subscribe("CHANNEL_ERROR"); fake.subscribe("SUBSCRIBED"); fake.sync(); vi.advanceTimersByTime(1500); });
    expect(result.current.notice).toEqual([]);
  });
  it("only seats after acknowledgement and resumes the same seat after remount", async () => {
    const first = renderHook(() => useCafePresence("coffee-shop", me)); await connect();
    await act(async () => { await first.result.current.changeSeat(" My task "); });
    expect(first.result.current.seat?.intention).toBe("My task");
    const seatId = first.result.current.seat?.seatId;
    first.unmount();
    const second = renderHook(() => useCafePresence("coffee-shop", me)); await connect();
    expect(second.result.current.seat?.seatId).toBe(seatId);
    await act(async () => { await second.result.current.changeSeat(null); });
    expect(fake.untrack).toHaveBeenCalled();
    expect(localStorage.getItem(storageKey)).toBeNull();
    expect(second.result.current.seat).toBeNull();
  });
  it("does not notify for a second device belonging to someone already seated", async () => {
    const { result } = renderHook(() => useCafePresence("coffee-shop", me));
    fake.state = { first: [member()] };
    await connect();
    act(() => {
      fake.state.second = [member({ seatId: "another-device", updatedAt: Date.now() + 1 })];
      fake.sync(); vi.advanceTimersByTime(2000);
    });
    expect(result.current.members).toHaveLength(1);
    expect(result.current.notice).toEqual([]);
  });
  it("handles failures without claiming a successful seat", async () => {
    fake.track.mockResolvedValue("timed out");
    const { result } = renderHook(() => useCafePresence("coffee-shop", me)); await connect();
    await act(async () => { await result.current.changeSeat("Task"); });
    expect(result.current.seat).toBeNull(); expect(result.current.error).toBeTruthy();
    expect(localStorage.getItem(storageKey)).toBeNull();
  });
  it("syncs leaving across tabs and respects notification opt out", async () => {
    const { result } = renderHook(() => useCafePresence("coffee-shop", me)); await connect();
    await act(async () => { await result.current.changeSeat("Task"); });
    await act(async () => { localStorage.removeItem(storageKey); window.dispatchEvent(new StorageEvent("storage", { key: storageKey })); });
    expect(result.current.seat).toBeNull(); expect(fake.untrack).toHaveBeenCalled();
    act(() => { result.current.toggleNotifications(); fake.state = { other: [member()] }; fake.sync(); vi.advanceTimersByTime(2000); });
    expect(result.current.notice).toEqual([]); expect(result.current.notifications).toBe(false);
  });
  it("does not allow guests to publish a seat", async () => {
    const { result } = renderHook(() => useCafePresence("coffee-shop", null)); await connect();
    await act(async () => { await result.current.changeSeat("Task"); });
    expect(fake.track).not.toHaveBeenCalled();
  });
});
