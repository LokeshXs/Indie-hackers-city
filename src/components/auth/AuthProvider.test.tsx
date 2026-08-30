import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Session, User } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authChange: undefined as ((event: string, session: Session | null) => void) | undefined,
  unsubscribe: vi.fn(),
  signInWithOAuth: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("@/lib/supabase/client", () => ({
  getSupabaseBrowserClient: () => ({
    auth: {
      onAuthStateChange: (callback: (event: string, session: Session | null) => void) => {
        mocks.authChange = callback;
        return { data: { subscription: { unsubscribe: mocks.unsubscribe } } };
      },
      signInWithOAuth: mocks.signInWithOAuth,
      signOut: mocks.signOut,
    },
  }),
}));
vi.mock("@/lib/supabase/config", () => ({ isSupabaseConfigured: () => true }));

import { AuthProvider, useAuth } from "./AuthProvider";

function Harness() {
  const { user, isAuthenticated, signInWithGoogle, signOut } = useAuth();
  return (
    <div>
      <span>{isAuthenticated ? user?.email : "anonymous"}</span>
      <button type="button" onClick={() => void signInWithGoogle("/?claimPlot=pioneer%3Ajobs%3Anorth%3A01")}>Google</button>
      <button type="button" onClick={() => void signOut()}>Sign out</button>
    </div>
  );
}

const initialUser = { id: "user-1", email: "ada@example.com", user_metadata: {} } as User;

describe("AuthProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.signInWithOAuth.mockResolvedValue({ error: null });
    mocks.signOut.mockResolvedValue({ error: null });
  });

  it("initializes from the server user and tracks auth changes", () => {
    const { unmount } = render(<AuthProvider initialUser={initialUser}><Harness /></AuthProvider>);
    expect(screen.getByText("ada@example.com")).toBeInTheDocument();

    act(() => mocks.authChange?.("SIGNED_OUT", null));
    expect(screen.getByText("anonymous")).toBeInTheDocument();
    unmount();
    expect(mocks.unsubscribe).toHaveBeenCalledOnce();
  });

  it("starts Google OAuth with the callback and selected plot", async () => {
    const user = userEvent.setup();
    render(<AuthProvider initialUser={null}><Harness /></AuthProvider>);
    await user.click(screen.getByRole("button", { name: "Google" }));

    expect(mocks.signInWithOAuth).toHaveBeenCalledOnce();
    const request = mocks.signInWithOAuth.mock.calls[0][0];
    expect(request.provider).toBe("google");
    const redirect = new URL(request.options.redirectTo);
    expect(redirect.pathname).toBe("/auth/callback");
    expect(redirect.searchParams.get("next")).toBe("/?claimPlot=pioneer%3Ajobs%3Anorth%3A01");
  });

  it("uses Supabase sign out", async () => {
    const user = userEvent.setup();
    render(<AuthProvider initialUser={initialUser}><Harness /></AuthProvider>);
    await user.click(screen.getByRole("button", { name: "Sign out" }));
    expect(mocks.signOut).toHaveBeenCalledOnce();
  });
});
