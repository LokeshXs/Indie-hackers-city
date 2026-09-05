import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

const { mockRows } = vi.hoisted(() => ({
  mockRows: {
    projects: [] as Record<string, unknown>[],
    project_achievements: [] as Record<string, unknown>[],
    achievement_definitions: [] as Record<string, unknown>[],
  },
}));

// useFounderProjects reads projects, awarded achievements and the catalog directly. Each select
// resolves from the table it names, so a test only has to set mockRows.
vi.mock("@/lib/supabase/config", () => ({ isSupabaseConfigured: () => true }));
vi.mock("@/lib/supabase/client", () => ({
  getSupabaseBrowserClient: () => ({
    from: (table: keyof typeof mockRows) => {
      const result = Promise.resolve({ data: mockRows[table] ?? [], error: null });
      const builder = {
        select: () => builder,
        eq: () => builder,
        order: () => result,
        then: result.then.bind(result),
      };
      return builder;
    },
  }),
}));

const CATALOG = [
  { achievement_type: "product_launched", label: "Launched a new product", description: "Shipped it.", xp_reward: 100, sort_order: 1, group_key: "launch", tier: 1, scope: "project", requires_new_project: true },
  { achievement_type: "users_10", label: "10 users", description: "Ten people.", xp_reward: 5, sort_order: 2, group_key: "users", tier: 1, scope: "project", requires_new_project: false },
  { achievement_type: "users_50", label: "50 users", description: "Fifty people.", xp_reward: 25, sort_order: 3, group_key: "users", tier: 2, scope: "project", requires_new_project: false },
  { achievement_type: "users_100", label: "100+ users", description: "A hundred or more.", xp_reward: 50, sort_order: 4, group_key: "users", tier: 3, scope: "project", requires_new_project: false },
  { achievement_type: "revenue_10", label: "$10 earned", description: "First money.", xp_reward: 50, sort_order: 5, group_key: "revenue", tier: 1, scope: "founder", requires_new_project: false },
  { achievement_type: "revenue_100", label: "$100+ earned", description: "A hundred dollars.", xp_reward: 150, sort_order: 6, group_key: "revenue", tier: 2, scope: "founder", requires_new_project: false },
];

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

describe("ProjectCard achievements", () => {
  beforeEach(() => {
    mockRows.achievement_definitions = CATALOG;
    mockRows.projects = [{
      id: development.project.id,
      owner_id: "user-1",
      name: "Garageware",
      website_url: "https://garageware.example/",
      project_type: "app",
      created_at: "2026-08-30T00:00:00.000Z",
      updated_at: "2026-08-30T00:00:00.000Z",
    }];
    mockRows.project_achievements = [];
  });

  afterEach(() => vi.unstubAllGlobals());

  function renderCard() {
    return render(
      <ProjectCard
        development={development}
        address="Pioneer District · Jobs Avenue · North Plot 01"
        currentUserId="user-1"
        onClose={vi.fn()}
        onUpdated={vi.fn()}
      />,
    );
  }

  it("offers the three groups with what each is worth", async () => {
    const user = userEvent.setup();
    renderCard();

    await user.click(screen.getByRole("button", { name: "Add achievement" }));

    // Launch is a single rung so it reads as an exact amount; the graded ones read as a ceiling.
    expect(await screen.findByRole("button", { name: /Launched a new product.*\+100 XP/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Gained users.*up to \+80 XP/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Earned revenue.*up to \+200 XP/ })).toBeInTheDocument();
  });

  it("shows every rung and what it would grant on an unlogged project", async () => {
    const user = userEvent.setup();
    renderCard();

    await user.click(screen.getByRole("button", { name: "Add achievement" }));
    await user.click(await screen.findByRole("button", { name: /Gained users/ }));
    await user.click(await screen.findByRole("button", { name: /Garageware/ }));

    // Each rung carries its own reward plus every rung beneath it.
    expect(await screen.findByRole("radio", { name: /10 users.*\+5 XP/ })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /50 users.*\+30 XP/ })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /100\+ users.*\+80 XP/ })).toBeInTheDocument();
  });

  it("shrinks the preview for rungs already held and disables exhausted ones", async () => {
    mockRows.project_achievements = [
      { project_id: development.project.id, achievement_type: "users_10" },
    ];
    const user = userEvent.setup();
    renderCard();

    await user.click(screen.getByRole("button", { name: "Add achievement" }));
    await user.click(await screen.findByRole("button", { name: /Gained users/ }));
    await user.click(await screen.findByRole("button", { name: /Garageware/ }));

    // 10 is held, so it grants nothing and 100+ drops from 80 to 75.
    expect(await screen.findByRole("radio", { name: /10 users.*Already logged/ })).toBeDisabled();
    expect(screen.getByRole("radio", { name: /50 users.*\+25 XP/ })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /100\+ users.*\+75 XP/ })).toBeInTheDocument();
  });

  it("posts the selected rung and returns to the card", async () => {
    const user = userEvent.setup();
    const onUpdated = vi.fn();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({ development, achievement: { xpAwarded: 80 }, projects: [] }),
      { status: 200, headers: { "content-type": "application/json" } },
    )));

    render(
      <ProjectCard
        development={development}
        address="Pioneer District · Jobs Avenue · North Plot 01"
        currentUserId="user-1"
        onClose={vi.fn()}
        onUpdated={onUpdated}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Add achievement" }));
    await user.click(await screen.findByRole("button", { name: /Gained users/ }));
    await user.click(await screen.findByRole("button", { name: /Garageware/ }));
    await user.click(await screen.findByRole("radio", { name: /100\+ users/ }));
    await user.click(screen.getByRole("button", { name: "Log achievement" }));

    await waitFor(() => expect(onUpdated).toHaveBeenCalledWith(development));
    const [url, request] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("/api/achievements");
    expect(JSON.parse(String(request?.body))).toEqual({
      achievementType: "users_100",
      projectId: development.project.id,
    });
  });

  it("skips the project picker for revenue, which belongs to the founder", async () => {
    const user = userEvent.setup();
    const onUpdated = vi.fn();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({ development, achievement: { xpAwarded: 200 }, projects: [], founderAchievements: [] }),
      { status: 200, headers: { "content-type": "application/json" } },
    )));

    render(
      <ProjectCard
        development={development}
        address="Pioneer District · Jobs Avenue · North Plot 01"
        currentUserId="user-1"
        onClose={vi.fn()}
        onUpdated={onUpdated}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Add achievement" }));
    await user.click(await screen.findByRole("button", { name: /Earned revenue/ }));

    // Straight to the rungs — no project list in between.
    expect(await screen.findByRole("radio", { name: /\$100\+ earned.*\+200 XP/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Garageware/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: /\$100\+ earned/ }));
    await user.click(screen.getByRole("button", { name: "Log achievement" }));

    await waitFor(() => expect(onUpdated).toHaveBeenCalledWith(development));
    const [, request] = vi.mocked(fetch).mock.calls[0];
    // No projectId at all: the RPC decides which types need one.
    expect(JSON.parse(String(request?.body))).toEqual({ achievementType: "revenue_100" });
  });
});
