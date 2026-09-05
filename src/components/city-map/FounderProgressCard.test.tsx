import { createRef } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { CityDevelopment } from "@/lib/city/types";
import { FounderProgressCard } from "./FounderProgressCard";

const development: CityDevelopment = {
  plotId: "pioneer:jobs:north:01",
  ownerId: "user-1",
  project: { id: "project-1", name: "Xenith", websiteUrl: "https://xenith.dev/", type: "app" },
  founder: { fullName: "Ada Founder", xHandle: "ada", avatarUrl: null },
  building: { level: 2, assetId: "startup-building-level-1", color: "#e2775c" },
  billboard: { textColor: "#f7e0a6", backgroundColor: "#1b3a4b" },
  progression: { xp: 185, buildingLevel: 2, currentLevelXp: 100, nextLevelXp: 300 },
  claimedAt: "2026-08-30T00:00:00.000Z",
  updatedAt: "2026-08-30T00:00:00.000Z",
};

describe("FounderProgressCard", () => {
  it("reports the founder's standing and opens their building", async () => {
    const onViewBuilding = vi.fn();
    const buttonRef = createRef<HTMLButtonElement>();
    const user = userEvent.setup();
    render(<FounderProgressCard development={development} buttonRef={buttonRef} onViewBuilding={onViewBuilding} />);

    // 185 sits on the leg between the 100 and 240 rungs: 55 short of the scrolling billboard.
    const card = screen.getByRole("button", {
      name: "Level 2, 185 XP. Next reward Scrolling billboard, 55 XP to go. View my building.",
    });
    expect(card).toHaveTextContent("Founder progress");
    expect(card).toHaveTextContent("185");
    expect(card).toHaveTextContent("Scrolling billboard");
    expect(card).toHaveTextContent("55 XP to go");
    expect(card).toHaveTextContent("240 XP");
    expect(buttonRef.current).toBe(card);
    await user.click(card);
    expect(onViewBuilding).toHaveBeenCalledOnce();
  });

  // Two things at once, because 1,750 XP is past every rung of the reward ladder *and* at the top
  // building level: the card ignores the level thresholds entirely, and drops the bar rather than
  // showing one that is full with nothing beyond it.
  it("drops the bar once every reward is earned, and ignores level thresholds", () => {
    render(<FounderProgressCard
      development={{
        ...development,
        building: { ...development.building, level: 5 },
        progression: { xp: 1750, buildingLevel: 5, currentLevelXp: 1500, nextLevelXp: null },
      }}
      onViewBuilding={() => undefined}
    />);

    expect(screen.getByRole("button", { name: "Level 5, 1,750 XP. View my building." })).toBeInTheDocument();
    expect(screen.queryByText(/until Level/)).not.toBeInTheDocument();
    expect(screen.queryByText(/XP to go/)).not.toBeInTheDocument();
    expect(screen.queryByAltText("")).not.toBeInTheDocument();
  });

  // Load-bearing, not incidental. The bar deliberately carries no progressbar role: it lives inside
  // a button, whose accessible name computation flattens its contents, so the distance travels in
  // the button's own label instead. Anyone adding the role here should have to delete this line.
  it("keeps the bar out of the accessibility tree, putting the reward in the label", () => {
    render(<FounderProgressCard development={development} onViewBuilding={() => undefined} />);

    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.getByRole("button")).toHaveAccessibleName(/Scrolling billboard, 55 XP to go/);
  });

  it("measures the bar across the current leg, not from zero", () => {
    const { container } = render(
      <FounderProgressCard development={development} onViewBuilding={() => undefined} />,
    );

    // 85 of the 140 between the 100 and 240 rungs. From zero this would be 77%, which is the
    // reading that made a barely-started leg look nearly finished.
    expect(container.querySelector('[style*="--fill"]')).toHaveStyle({
      "--fill": `${(85 / 140) * 100}%`,
    });
  });

  it("starts a new founder on a real leg from zero", () => {
    const { container } = render(
      <FounderProgressCard
        development={{ ...development, progression: { ...development.progression, xp: 10 } }}
        onViewBuilding={() => undefined}
      />,
    );

    expect(container.querySelector('[style*="--fill"]')).toHaveStyle({ "--fill": "10%" });
    expect(screen.getByRole("button")).toHaveTextContent("Roof lights");
    expect(screen.getByRole("button")).toHaveTextContent("90 XP to go");
  });

  it("names a rung that has a threshold but no reward yet", () => {
    render(<FounderProgressCard
      development={{ ...development, progression: { ...development.progression, xp: 500 } }}
      onViewBuilding={() => undefined}
    />);

    // 570 is a placeholder: a real landing on the earning curve, with nothing designed for it yet.
    expect(screen.getByRole("button")).toHaveTextContent("A new reward");
    expect(screen.getByRole("button")).toHaveTextContent("570 XP");
  });
});
