import type { User } from "@supabase/supabase-js";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { presence, auth } = vi.hoisted(() => ({
  presence: { members: [] as Array<{ userId: string; name: string; avatarUrl: string; intention: string }>, connection: "connected", seat: null as null | { intention: string }, busy: false, error: null,
    changeSeat: vi.fn(), notice: [] as Array<{ name: string; intention: string }>, dismissNotice: vi.fn(), notifications: true, toggleNotifications: vi.fn() },
  auth: { user: { id: "me", app_metadata: {}, user_metadata: {}, aud: "authenticated", created_at: "" } as User | null, signInWithGoogle: vi.fn() },
}));
vi.mock("@react-three/drei", () => ({ Html: () => null }));
vi.mock("@/hooks/useCafePresence", () => ({ useCafePresence: () => presence }));
import { CafePanel } from "./CafeExperience";

describe("live cafe panel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("Audio", vi.fn());
    presence.members = []; presence.seat = null; presence.notice = []; presence.connection = "connected";
    auth.user = { id: "me", app_metadata: {}, user_metadata: {}, aud: "authenticated", created_at: "" };
    HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  });
  afterEach(() => vi.unstubAllGlobals());
  it("shows the empty cafe and sends an intention only on explicit joining", async () => {
    const user = userEvent.setup(); render(<CafePanel user={auth.user} signInWithGoogle={auth.signInWithGoogle} />);
    await user.click(screen.getByRole("button", { name: /Open StandUp Cafe/ }));
    expect(screen.getByText("Be the first to take a seat.")).toBeInTheDocument();
    expect(screen.queryByText("Preview")).not.toBeInTheDocument();
    await user.type(screen.getByLabelText(/What are you working on/), "Shipping a tiny app");
    expect(presence.changeSeat).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: /^Take a seat/ }));
    expect(presence.changeSeat).toHaveBeenCalledWith("Shipping a tiny app");
    expect(screen.getAllByRole("button", { name: "Play cafe music" })).toHaveLength(2);
    expect(Audio).not.toHaveBeenCalled();
  });
  it("shows real members, edits an intention and leaves without closing the panel", async () => {
    presence.members = [{ userId: "me", name: "Real Founder", avatarUrl: "", intention: "Building" }];
    presence.seat = { intention: "Building" };
    const user = userEvent.setup(); render(<CafePanel user={auth.user} signInWithGoogle={auth.signInWithGoogle} />);
    await user.click(screen.getByRole("button", { name: /Open StandUp Cafe/ }));
    expect(screen.getByText("Real Founder")).toBeInTheDocument();
    await user.clear(screen.getByLabelText(/What are you working on/));
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(presence.changeSeat).toHaveBeenCalledWith("");
    await user.click(screen.getByRole("button", { name: /Leave cafe/ }));
    expect(presence.changeSeat).toHaveBeenCalledWith(null);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
  it("gates seating with sign in and restores focus on Escape", async () => {
    auth.user = null;
    const user = userEvent.setup(); render(<CafePanel user={auth.user} signInWithGoogle={auth.signInWithGoogle} />);
    const trigger = screen.getByRole("button", { name: /Open StandUp Cafe/ });
    await user.click(trigger);
    await user.click(screen.getByRole("button", { name: /Sign in to take a seat/ }));
    expect(auth.signInWithGoogle).toHaveBeenCalledWith("/");
    expect(presence.changeSeat).not.toHaveBeenCalled();
    fireEvent(screen.getByRole("dialog"), new Event("cancel"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
  it("opens a join toast without automatically seating or playing audio", async () => {
    presence.notice = [{ name: "Maya", intention: "Building a shop" }];
    const user = userEvent.setup(); render(<CafePanel user={auth.user} signInWithGoogle={auth.signInWithGoogle} />);
    await user.click(screen.getByRole("button", { name: "Join cafe" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(presence.changeSeat).not.toHaveBeenCalled();
    expect(Audio).not.toHaveBeenCalled();
  });
});
