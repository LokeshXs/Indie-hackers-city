import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CityDevelopment } from "@/lib/city/types";

// The modal renders the shared PreviewStage, so the 3D stack is stubbed the way the other
// city-map tests do it. With Canvas replaced by a div the turntable never mounts, which keeps
// useGLTF out of jsdom entirely.
vi.mock("@react-three/fiber", () => ({
  Canvas: () => <div data-testid="three-canvas" />,
  useFrame: vi.fn(),
  useThree: () => ({ camera: { position: { set: vi.fn() }, lookAt: vi.fn() } }),
}));
vi.mock("@react-three/drei", () => ({
  useGLTF: Object.assign(vi.fn(), { preload: vi.fn() }),
}));

const { PremisesUpgradeModal } = await import("./PremisesUpgradeModal");

const development = {
  plotId: "pioneer:jobs:north:01",
  ownerId: "user-1",
  project: { id: "p1", name: "UrlBit", websiteUrl: "https://urlbit.dev/", type: "website" },
  statusText: null,
  founder: { fullName: "Ada Lovelace", xHandle: "ada_builds", avatarUrl: null },
  building: { level: 2, assetId: "corner-studio-level-1" },
  billboard: { textColor: "#f7e0a6", backgroundColor: "#1b3a4b" },
  progression: { xp: 512, buildingLevel: 2, currentLevelXp: 490, nextLevelXp: 690 },
  claimedAt: "2026-09-01T10:00:00.000Z",
  updatedAt: "2026-09-07T10:00:00.000Z",
} as unknown as CityDevelopment;

function renderModal(overrides: Partial<Parameters<typeof PremisesUpgradeModal>[0]> = {}) {
  return render(
    <PremisesUpgradeModal
      development={development}
      onClose={vi.fn()}
      onUpgraded={vi.fn()}
      {...overrides}
    />,
  );
}

describe("PremisesUpgradeModal", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("leads with the founder's own XP total, not the 490 threshold", () => {
    renderModal();
    // 490 is the rung; 512 is what they actually hold, and showing the rung here would make the
    // figure a placard rather than their receipt.
    expect(screen.getByLabelText("512 city XP")).toBeInTheDocument();
  });

  it("lists the rewards already earned and marks the one being spent", () => {
    renderModal();
    expect(screen.getByText("Roof lights")).toBeInTheDocument();
    expect(screen.getByText("Scrolling billboard")).toBeInTheDocument();
    expect(screen.getByText("Status bubble")).toBeInTheDocument();

    // The markers are glyphs, so the state a screen reader hears is what is asserted.
    const current = screen.getByText("A bigger building").closest("li");
    expect(current).toHaveTextContent("Ready to claim:");
    expect(screen.getByText("Roof lights").closest("li")).toHaveTextContent("Earned:");
  });

  it("names the selected premises in the button and follows the carousel", async () => {
    const user = userEvent.setup();
    renderModal();

    expect(screen.getByRole("button", { name: "Move into the Slat Studio" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Next premises" }));
    expect(screen.getByRole("button", { name: "Move into the Teal Brow" })).toBeInTheDocument();

    // The reward block belongs to the founder, not to the option, so it must survive the step.
    expect(screen.getByLabelText("512 city XP")).toBeInTheDocument();
    expect(screen.getByText("Roof lights")).toBeInTheDocument();
  });

  it("sends the chosen asset id and hands back the updated development", async () => {
    const user = userEvent.setup();
    const onUpgraded = vi.fn();
    const updated = { ...development, building: { level: 2, assetId: "teal-brow-level-2" } };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ development: updated }),
    }));

    renderModal({ onUpgraded });
    await user.click(screen.getByRole("button", { name: "Next premises" }));
    await user.click(screen.getByRole("button", { name: "Move into the Teal Brow" }));

    await waitFor(() => expect(onUpgraded).toHaveBeenCalledWith(updated));
    const [url, request] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("/api/plot-claim/premises");
    expect(JSON.parse(String(request?.body))).toEqual({ buildingAssetId: "teal-brow-level-2" });
  });

  it("surfaces a failed upgrade instead of closing", async () => {
    const user = userEvent.setup();
    const onUpgraded = vi.fn();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: { code: "reward_locked", message: "Reach 490 XP to unlock new premises." } }),
    }));

    renderModal({ onUpgraded });
    await user.click(screen.getByRole("button", { name: "Move into the Slat Studio" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Reach 490 XP to unlock new premises.");
    expect(onUpgraded).not.toHaveBeenCalled();
  });
});
