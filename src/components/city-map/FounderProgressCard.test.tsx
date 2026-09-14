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
  statusText: null,
  founder: { fullName: "Ada Founder", xHandle: "ada", avatarUrl: null, bio: null },
  building: { level: 2, assetId: "startup-building-level-1" },
  billboard: { textColor: "#f7e0a6", backgroundColor: "#1b3a4b" },
  progression: { xp: 150, buildingLevel: 2, currentLevelXp: 100, nextLevelXp: 300 },
  claimedAt: "2026-08-30T00:00:00.000Z",
  updatedAt: "2026-08-30T00:00:00.000Z",
};

describe("FounderProgressCard", () => {
  it("reports the founder's standing and opens their building", async () => {
    const onViewBuilding = vi.fn();
    const buttonRef = createRef<HTMLButtonElement>();
    const user = userEvent.setup();
    render(<FounderProgressCard onShare={vi.fn()} development={development} buttonRef={buttonRef} onViewBuilding={onViewBuilding} />);

    // 150 sits on the leg between the 110 and 190 rungs: 40 short of the scrolling billboard.
    const card = screen.getByRole("button", {
      name: "Level 2, 150 XP. Next reward Scrolling billboard, 40 XP to go. View my building.",
    });
    expect(card).toHaveTextContent("Founder progress");
    expect(card).toHaveTextContent("150");
    expect(card).toHaveTextContent("Scrolling billboard");
    expect(card).toHaveTextContent("40 XP to go");
    expect(card).toHaveTextContent("190 XP");
    expect(buttonRef.current).toBe(card);
    await user.click(card);
    expect(onViewBuilding).toHaveBeenCalledOnce();
  });

  // Two things at once, because 1,750 XP is past every rung of the reward ladder *and* at the top
  // building level: the card ignores the level thresholds entirely, and drops the bar rather than
  // showing one that is full with nothing beyond it.
  it("drops the bar once every reward is earned, and ignores level thresholds", () => {
    render(<FounderProgressCard onShare={vi.fn()}
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
    render(<FounderProgressCard onShare={vi.fn()} development={development} onViewBuilding={() => undefined} />);

    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /View my building/ })).toHaveAccessibleName(/Scrolling billboard, 40 XP to go/);
  });

  it("measures the bar across the current leg, not from zero", () => {
    const { container } = render(
      <FounderProgressCard onShare={vi.fn()} development={development} onViewBuilding={() => undefined} />,
    );

    // 40 of the 80 between the 110 and 190 rungs. From zero this would be 79%, which is the
    // reading that made a barely-started leg look nearly finished.
    expect(container.querySelector('[style*="--fill"]')).toHaveStyle({
      "--fill": `${(40 / 80) * 100}%`,
    });
  });

  it("starts a new founder on a real leg from zero", () => {
    const { container } = render(
      <FounderProgressCard onShare={vi.fn()}
        development={{ ...development, progression: { ...development.progression, xp: 10 } }}
        onViewBuilding={() => undefined}
      />,
    );

    expect(container.querySelector('[style*="--fill"]')).toHaveStyle({ "--fill": `${(10 / 110) * 100}%` });
    expect(screen.getByRole("button", { name: /View my building/ })).toHaveTextContent("Status bubble");
    expect(screen.getByRole("button", { name: /View my building/ })).toHaveTextContent("100 XP to go");
  });

  it("names a rung that has a threshold but no reward yet", () => {
    render(<FounderProgressCard onShare={vi.fn()}
      development={{ ...development, progression: { ...development.progression, xp: 500 } }}
      onViewBuilding={() => undefined}
    />);

    expect(screen.getByRole("button", { name: /View my building/ })).toHaveTextContent("A new reward");
    expect(screen.getByRole("button", { name: /View my building/ })).toHaveTextContent("570 XP");
  });
});

it("keeps Share and View my building independent without nested buttons", async () => {
  const onShare = vi.fn(), onViewBuilding = vi.fn();
  const user = userEvent.setup();
  const { container } = render(<FounderProgressCard development={development} onShare={onShare} onViewBuilding={onViewBuilding} />);
  await user.click(screen.getByRole("button", { name: "Share my plot" }));
  expect(onShare).toHaveBeenCalledOnce();
  expect(onViewBuilding).not.toHaveBeenCalled();
  expect(container.querySelector("button button")).toBeNull();
});
