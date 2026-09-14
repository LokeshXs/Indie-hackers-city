import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RewardAnnouncement } from "./RewardAnnouncement";
import type { RewardAnnouncement as Announcement } from "@/lib/city/rewards";

function announcement(overrides: Partial<Announcement> = {}): Announcement {
  return {
    xpGained: 80,
    previousXpTotal: 310,
    xpTotal: 390,
    previousBuildingLevel: 1,
    buildingLevel: 1,
    currentLevelXp: 0,
    nextLevelXp: 490,
    levelChanged: false,
    achievements: [
      { type: "users_10", label: "10 users", xp: 5 },
      { type: "users_50", label: "50 users", xp: 25 },
      { type: "users_100", label: "100+ users", xp: 50 },
    ],
    ...overrides,
  };
}

describe("RewardAnnouncement", () => {
  it("shows the level when the building was upgraded", () => {
    render(
      <RewardAnnouncement
        announcement={announcement({ levelChanged: true, buildingLevel: 2, previousBuildingLevel: 1 })}
        onDismiss={vi.fn()}
      />,
    );

    expect(screen.getByText("Level 2")).toBeInTheDocument();
  });

  it("shows the current level without a level-up announcement when it did not move", () => {
    render(<RewardAnnouncement announcement={announcement()} onDismiss={vi.fn()} />);

    expect(screen.getByText("Level 1")).toBeInTheDocument();
    expect(screen.queryByText(/Level 1 unlocked/)).not.toBeInTheDocument();
  });

  it("carries nothing but the figure, what was unlocked, and the way out", () => {
    render(<RewardAnnouncement announcement={announcement()} onDismiss={vi.fn()} />);

    // The explanatory chrome is deliberately gone: who approved it and when belong on the card.
    expect(screen.queryByText(/while you were away/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/approved/i)).not.toBeInTheDocument();
    expect(screen.queryByText("+80 XP")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue" })).toBeInTheDocument();
  });

  it("shows the celebration caption without an achievement list", () => {
    const { container } = render(
      <RewardAnnouncement announcement={announcement()} onDismiss={vi.fn()} />,
    );

    expect(container.querySelector("header")).toHaveTextContent("Achievements unlocked");
    expect(screen.queryByText("10 users")).not.toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("says achievement in the singular when only one landed", () => {
    render(
      <RewardAnnouncement
        announcement={announcement({ achievements: [{ type: "revenue_10", label: "$10 earned", xp: 50 }] })}
        onDismiss={vi.fn()}
      />,
    );

    expect(screen.getByText("Achievement unlocked")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "You earned $10" })).toBeInTheDocument();
  });

  it("counts earned XP from zero and separates the lifetime total", () => {
    render(<RewardAnnouncement announcement={announcement()} onDismiss={vi.fn()} />);
    expect(screen.getByText("+0")).toBeInTheDocument();
    expect(screen.getByText("Total XP: 390")).toBeInTheDocument();
    const progress = screen.getByRole("progressbar");
    expect(progress).toHaveAttribute("aria-valuemin", "0");
    expect(progress).toHaveAttribute("aria-valuemax", "490");
    expect(progress).toHaveAttribute("aria-valuenow", "390");
    expect(screen.getByText("Level 2 unlocks")).toBeInTheDocument();
  });

  it("keeps level 1 progress on the 0 to 490 building range", () => {
    render(<RewardAnnouncement announcement={announcement({
      previousXpTotal: 10, xpGained: 380, xpTotal: 390,
    })} onDismiss={vi.fn()} />);
    const progress = screen.getByRole("progressbar");
    expect(progress).toHaveAttribute("aria-valuemin", "0");
    expect(progress).toHaveAttribute("aria-valuemax", "490");
    expect(progress).toHaveAttribute("aria-valuenow", "390");
    expect(progress.firstElementChild).toHaveStyle({ transform: `scaleX(${10 / 490})` });
  });

  it("starts the level 2 to level 3 range when level 2 is reached", () => {
    render(<RewardAnnouncement announcement={announcement({
      previousXpTotal: 480, xpGained: 10, xpTotal: 490,
      previousBuildingLevel: 1, buildingLevel: 2, levelChanged: true,
      currentLevelXp: 490, nextLevelXp: 690,
    })} onDismiss={vi.fn()} />);
    const progress = screen.getByRole("progressbar");
    expect(progress).toHaveAttribute("aria-valuemin", "490");
    expect(progress).toHaveAttribute("aria-valuemax", "690");
    expect(progress).toHaveAttribute("aria-valuenow", "490");
    expect(screen.getByText("Level 3 unlocks")).toBeInTheDocument();
  });

  it("celebrates a single user milestone in the headline", () => {
    render(<RewardAnnouncement announcement={announcement({
      achievements: [{ type: "users_100", label: "100+ users", xp: 50 }],
    })} onDismiss={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "You reached 100 users" })).toBeInTheDocument();
  });

  it("does not invent a next level after the final level", () => {
    render(<RewardAnnouncement announcement={announcement({ xpTotal: 1_890, buildingLevel: 5, currentLevelXp: 1_890, nextLevelXp: null })} onDismiss={vi.fn()} />);
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.getByText("All current levels unlocked")).toBeInTheDocument();
  });

  it("puts the whole story in the dialog label, since the figure is animating", () => {
    render(
      <RewardAnnouncement
        announcement={announcement({ levelChanged: true, buildingLevel: 2, currentLevelXp: 490, nextLevelXp: 690, xpTotal: 490 })}
        onDismiss={vi.fn()}
      />,
    );

    expect(screen.getByRole("dialog")).toHaveAccessibleName(
      "Level 2. 80 XP awarded, for a total of 490. Unlocked: 10 users, 50 users, 100+ users.",
    );
  });

  it("reports the dismissal so the server can mark it delivered", async () => {
    const onDismiss = vi.fn();
    const user = userEvent.setup();
    render(<RewardAnnouncement announcement={announcement()} onDismiss={onDismiss} />);

    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
