import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockAuth = vi.hoisted(() => ({
  user: null as Record<string, unknown> | null,
  signOut: vi.fn(async () => undefined),
  signInWithGoogle: vi.fn<(returnTo: string) => Promise<void>>().mockResolvedValue(undefined),
  isLoading: false,
}));

vi.mock("./AuthProvider", () => ({ useAuth: () => mockAuth }));

import { AccountMenu } from "./AccountMenu";

describe("AccountMenu", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.user = null;
  });

  it("starts Google sign-in for anonymous visitors and prevents duplicate clicks", async () => {
    render(<AccountMenu />);
    await userEvent.click(screen.getByRole("button", { name: "Log in" }));
    expect(mockAuth.signInWithGoogle).toHaveBeenCalledWith(`${window.location.pathname}${window.location.search}${window.location.hash}`);
    expect(screen.getByRole("button", { name: "Signing in…" })).toBeDisabled();
  });

  it("allows retry when sign-in fails", async () => {
    mockAuth.signInWithGoogle.mockRejectedValueOnce(new Error("Unavailable"));
    render(<AccountMenu />);
    await userEvent.click(screen.getByRole("button", { name: "Log in" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn’t start sign-in");
    expect(screen.getByRole("button", { name: "Log in" })).toBeEnabled();
  });

  it("shows identity, closes with Escape, and signs out", async () => {
    mockAuth.user = {
      id: "user-1",
      email: "ada@example.com",
      user_metadata: { full_name: "Ada Lovelace" },
    };
    const user = userEvent.setup();
    render(<AccountMenu />);

    const trigger = screen.getByRole("button", { name: "Account menu for Ada Lovelace" });
    expect(trigger).toHaveTextContent("AL");
    await user.click(trigger);
    expect(screen.getByText("ada@example.com")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();

    await user.click(trigger);
    await user.click(screen.getByRole("menuitem", { name: "Sign out" }));
    expect(mockAuth.signOut).toHaveBeenCalledOnce();
  });
});
