import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockAuth = vi.hoisted(() => ({
  user: null as Record<string, unknown> | null,
  signOut: vi.fn(async () => undefined),
}));

vi.mock("./AuthProvider", () => ({ useAuth: () => mockAuth }));

import { AccountMenu } from "./AccountMenu";

describe("AccountMenu", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.user = null;
  });

  it("stays hidden for anonymous visitors", () => {
    render(<AccountMenu />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
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
