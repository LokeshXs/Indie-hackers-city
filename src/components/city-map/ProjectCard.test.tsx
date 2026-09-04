import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CityDevelopment } from "@/lib/city/types";

// The card renders the shared PreviewStage, so the 3D stack has to be stubbed the same way
// CityMap3D.test.tsx does it. With Canvas replaced by a div the previews never mount, which keeps
// useGLTF and useBillboardTexture out of jsdom entirely.
vi.mock("@react-three/fiber", () => ({
  Canvas: () => <div data-testid="three-canvas" />,
  useFrame: vi.fn(),
  useThree: () => ({ camera: { position: { set: vi.fn() }, lookAt: vi.fn() } }),
}));

vi.mock("@react-three/drei", () => ({
  useGLTF: Object.assign(vi.fn(), { preload: vi.fn() }),
}));

const { ProjectCard } = await import("./ProjectCard");

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
  billboard: { textColor: "#f7e0a6", backgroundColor: "#1b3a4b" },
  progression: { xp: 10, buildingLevel: 1, currentLevelXp: 0, nextLevelXp: 100 },
  claimedAt: "2026-08-30T00:00:00.000Z",
  updatedAt: "2026-08-30T00:00:00.000Z",
};

function stubSuccessfulSave() {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ development }), {
    status: 200,
    headers: { "content-type": "application/json" },
  })));
}

describe("ProjectCard building", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("no longer lets the owner change the building shape", async () => {
    const user = userEvent.setup();
    render(
      <ProjectCard
        development={development}
        address="Pioneer District · Jobs Avenue · North Plot 01"
        currentUserId="user-1"
        onClose={vi.fn()}
        onUpdated={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Customise" }));
    await user.click(screen.getByRole("button", { name: /Building colour/ }));

    // The shell is assigned at claim time; only its paint is editable now.
    expect(screen.queryByRole("combobox", { name: "Building" })).not.toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: "Building colour" })).toBeInTheDocument();
  });

  it("saves the building colour without touching the project", async () => {
    const user = userEvent.setup();
    const onUpdated = vi.fn();
    stubSuccessfulSave();

    render(
      <ProjectCard
        development={development}
        address="Pioneer District · Jobs Avenue · North Plot 01"
        currentUserId="user-1"
        onClose={vi.fn()}
        onUpdated={onUpdated}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Customise" }));
    await user.click(screen.getByRole("button", { name: /Building colour/ }));
    await user.click(screen.getByRole("radio", { name: "Sage Green" }));
    await user.click(screen.getByRole("button", { name: "Save colour" }));

    await waitFor(() => expect(onUpdated).toHaveBeenCalledWith(development));
    const [url, request] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("/api/plot-claim/appearance");
    const body = request?.body as FormData;
    expect(body.get("buildingColor")).toBe("#7fa87a");
    // The appearance route owns three fields and no project or founder data.
    expect(body.get("projectName")).toBeNull();
    expect(body.get("buildingAssetId")).toBeNull();
  });
});

describe("ProjectCard billboard editing", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("edits the billboard in place and sends only the appearance fields", async () => {
    const user = userEvent.setup();
    const onUpdated = vi.fn();
    stubSuccessfulSave();

    render(
      <ProjectCard
        development={development}
        address="Pioneer District · Jobs Avenue · North Plot 01"
        currentUserId="user-1"
        onClose={vi.fn()}
        onUpdated={onUpdated}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Customise" }));
    await user.click(screen.getByRole("button", { name: /Billboard design/ }));
    // Same modal throughout; no second dialog is opened.
    expect(screen.getAllByRole("dialog")).toHaveLength(1);

    // A color input has no text to type into; the picker commits through a change event.
    fireEvent.change(screen.getByLabelText("Billboard background"), { target: { value: "#102030" } });
    await user.click(screen.getByRole("button", { name: "Save billboard" }));

    await waitFor(() => expect(onUpdated).toHaveBeenCalledWith(development));
    const [url, request] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("/api/plot-claim/appearance");
    const body = request?.body as FormData;
    expect(body.get("billboardBackgroundColor")).toBe("#102030");
    expect(body.get("billboardTextColor")).toBe("#f7e0a6");
    // The old ten-argument RPC forced a billboard save to resend the whole project. It no longer does.
    expect(body.get("projectName")).toBeNull();
    expect(body.get("fullName")).toBeNull();
  });

  it("warns about low contrast without blocking the save", async () => {
    const user = userEvent.setup();
    stubSuccessfulSave();

    render(
      <ProjectCard
        development={{ ...development, billboard: { textColor: "#1b3a4b", backgroundColor: "#1c3b4c" } }}
        address="Pioneer District · Jobs Avenue · North Plot 01"
        currentUserId="user-1"
        onClose={vi.fn()}
        onUpdated={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Customise" }));
    await user.click(screen.getByRole("button", { name: /Billboard design/ }));
    expect(screen.getByText(/hard to read/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save billboard" })).toBeEnabled();
  });

  it("hides both edit entry points from visitors", () => {
    render(
      <ProjectCard
        development={development}
        address="Pioneer District · Jobs Avenue · North Plot 01"
        currentUserId="someone-else"
        onClose={vi.fn()}
        onUpdated={vi.fn()}
      />,
    );

    expect(screen.queryByRole("button", { name: "Edit billboard" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit project" })).not.toBeInTheDocument();
  });
});
