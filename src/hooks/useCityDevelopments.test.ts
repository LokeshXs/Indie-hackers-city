import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const realtimeCallbacks: Array<() => void> = [];
const select = vi.fn();
const removeChannel = vi.fn();

const channel = {
  on: vi.fn((_event, _filter, callback: () => void) => {
    realtimeCallbacks.push(callback);
    return channel;
  }),
  subscribe: vi.fn(),
};

vi.mock("@/lib/supabase/config", () => ({ isSupabaseConfigured: () => true }));
vi.mock("@/lib/supabase/client", () => ({
  getSupabaseBrowserClient: () => ({
    channel: () => channel,
    removeChannel,
    from: () => ({ select }),
  }),
}));

import { useCityDevelopments } from "./useCityDevelopments";

describe("useCityDevelopments", () => {
  beforeEach(() => {
    realtimeCallbacks.length = 0;
    select.mockReset();
    channel.on.mockClear();
    channel.subscribe.mockClear();
    removeChannel.mockClear();
  });

  it("waits for the user to refresh after a realtime change", async () => {
    select.mockResolvedValue({ data: [], error: null });
    const { result } = renderHook(() => useCityDevelopments({}));

    expect(realtimeCallbacks).toHaveLength(3);
    act(() => realtimeCallbacks[0]());

    expect(result.current.hasPendingUpdates).toBe(true);
    expect(select).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.refresh();
    });

    await waitFor(() => expect(result.current.hasPendingUpdates).toBe(false));
    expect(select).toHaveBeenCalledOnce();
  });
});
