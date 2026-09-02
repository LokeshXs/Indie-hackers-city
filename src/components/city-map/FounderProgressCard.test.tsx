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
  it("shows within-level progress and opens the founder building", async () => {
    const onViewBuilding = vi.fn();
    const buttonRef = createRef<HTMLButtonElement>();
    const user = userEvent.setup();
    render(<FounderProgressCard development={development} buttonRef={buttonRef} onViewBuilding={onViewBuilding} />);

    const card = screen.getByRole("button", { name: "Level 2, 185 XP, 115 XP until Level 3. View my building." });
    expect(card).toHaveTextContent("Founder progress");
    expect(card).toHaveTextContent("115 XP until Level 3");
    expect(buttonRef.current).toBe(card);
    expect(card.querySelector('[style="width: 42.5%;"]')).toBeInTheDocument();
    await user.click(card);
    expect(onViewBuilding).toHaveBeenCalledOnce();
  });

  it("shows the maximum state at level five", () => {
    render(<FounderProgressCard
      development={{
        ...development,
        building: { ...development.building, level: 5 },
        progression: { xp: 1750, buildingLevel: 5, currentLevelXp: 1500, nextLevelXp: null },
      }}
      onViewBuilding={() => undefined}
    />);

    expect(screen.getByText("Maximum building level")).toBeInTheDocument();
    expect(screen.getByRole("button")).toHaveAccessibleName(/Level 5, 1,750 XP, Maximum building level/);
  });

  it("keeps the card usable when threshold data is missing", () => {
    render(<FounderProgressCard
      development={{
        ...development,
        progression: { ...development.progression, nextLevelXp: null },
      }}
      onViewBuilding={() => undefined}
    />);

    expect(screen.getByRole("button", { name: "Level 2, 185 XP. View my building." })).toBeInTheDocument();
    expect(screen.queryByText(/until Level/)).not.toBeInTheDocument();
  });
});
