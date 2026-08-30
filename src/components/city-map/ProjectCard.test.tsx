import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CityDevelopment } from "@/lib/city/types";
import { ProjectCard } from "./ProjectCard";

const development: CityDevelopment = {
  plotId: "pioneer:jobs:north:01",
  ownerId: "user-1",
  project: {
    id: "123e4567-e89b-42d3-a456-426614174000",
    name: "Garageware",
    websiteUrl: "https://garageware.example/",
    type: "app",
  },
  founder: { fullName: "Ada Founder", xHandle: "ada_founder", avatarUrl: null },
  building: { level: 1, assetId: "indie-garage-level-1", color: "#5fa8d3" },
  progression: { xp: 10, buildingLevel: 1, currentLevelXp: 0, nextLevelXp: 100 },
  claimedAt: "2026-08-30T00:00:00.000Z",
  updatedAt: "2026-08-30T00:00:00.000Z",
};

describe("ProjectCard building selection", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("displays Garage and lets the owner persist it", async () => {
    const user = userEvent.setup();
    const onUpdated = vi.fn();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ development }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })));

    render(
      <ProjectCard
        development={{ ...development, building: { ...development.building, assetId: "startup-building-level-1" } }}
        address="Pioneer District · Jobs Avenue · North Plot 01"
        currentUserId="user-1"
        onClose={vi.fn()}
        onUpdated={onUpdated}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Edit project" }));
    const buildingSelect = screen.getByRole("combobox", { name: "Building" });
    expect(screen.getByRole("option", { name: "Garage" })).toBeInTheDocument();
    await user.selectOptions(buildingSelect, "indie-garage-level-1");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(onUpdated).toHaveBeenCalledWith(development));
    const request = vi.mocked(fetch).mock.calls[0];
    expect((request[1]?.body as FormData).get("buildingAssetId")).toBe("indie-garage-level-1");
  });
});
