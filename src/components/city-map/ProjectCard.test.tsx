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
  { achievement_type: "users_100", label: "100+ users", description: "A hundred or more.", xp_reward: 50, sort_order: 4, group_key: "users", tier: 3, scope: "project", requires_new_project: false, evidence_prompt: "Show the count and where it came from", evidence_hint: "Leave the dashboard visible, not just the number." },
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
  statusText: null,
  founder: { fullName: "Ada Founder", xHandle: "ada_founder", avatarUrl: null, bio: null },
  building: { level: 1, assetId: "indie-garage-level-1" },
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

describe("ProjectCard customise menu", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("offers founder details and the billboard, and no way to change the building", async () => {
    const user = userEvent.setup();
    stubSuccessfulSave();

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

    // The shell is assigned at claim time and its colour is no longer a founder choice at all,
    // so neither a shape picker nor a paint picker should be reachable from here.
    expect(screen.getByRole("button", { name: /Founder details/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Billboard design/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Building colour/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Building" })).not.toBeInTheDocument();
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
      { project_id: development.project.id, achievement_type: "users_10", status: "approved" },
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

  it("says the claim goes to an admin, on every screen that can file one", async () => {
    const note = /goes to an admin for approval.*XP lands on your plot once it is approved/;
    const user = userEvent.setup();
    renderCard();

    await user.click(screen.getByRole("button", { name: "Add achievement" }));
    expect(await screen.findByText(note)).toBeInTheDocument();

    await user.click(await screen.findByRole("button", { name: /Gained users/ }));
    await user.click(await screen.findByRole("button", { name: /Garageware/ }));
    expect(await screen.findByText(note)).toBeInTheDocument();
  });

  it("marks a rung that is waiting on review rather than offering it again", async () => {
    mockRows.project_achievements = [
      { project_id: development.project.id, achievement_type: "users_10", status: "pending" },
    ];
    const user = userEvent.setup();
    renderCard();

    await user.click(screen.getByRole("button", { name: "Add achievement" }));
    await user.click(await screen.findByRole("button", { name: /Gained users/ }));
    await user.click(await screen.findByRole("button", { name: /Garageware/ }));

    // Filed but not granted, so it cannot be filed again -- and 100+ still counts it as unpaid,
    // because nothing has been awarded yet.
    expect(await screen.findByRole("radio", { name: /10 users.*Awaiting review/ })).toBeDisabled();
    expect(screen.getByRole("radio", { name: /100\+ users.*\+80 XP on approval/ })).toBeInTheDocument();
  });

  it("treats a rejected rung as claimable again", async () => {
    mockRows.project_achievements = [
      { project_id: development.project.id, achievement_type: "users_10", status: "rejected" },
    ];
    const user = userEvent.setup();
    renderCard();

    await user.click(screen.getByRole("button", { name: "Add achievement" }));
    await user.click(await screen.findByRole("button", { name: /Gained users/ }));
    await user.click(await screen.findByRole("button", { name: /Garageware/ }));

    const rung = await screen.findByRole("radio", { name: /10 users.*\+5 XP on approval/ });
    expect(rung).not.toBeDisabled();
  });

  it("tells the founder the claim is queued instead of showing an XP gain", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({ development, achievement: { status: "pending", xpPending: 80 }, projects: [] }),
      { status: 200, headers: { "content-type": "application/json" } },
    )));
    renderCard();

    await user.click(screen.getByRole("button", { name: "Add achievement" }));
    await user.click(await screen.findByRole("button", { name: /Gained users/ }));
    await user.click(await screen.findByRole("button", { name: /Garageware/ }));
    await user.click(await screen.findByRole("radio", { name: /100\+ users/ }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.type(screen.getByLabelText("Link"), "https://dash.example/users");
    await user.click(screen.getByRole("button", { name: "Send for review" }));

    // Naming the rung matters: the card returns to a view that is otherwise unchanged, so without
    // it a founder cannot tell which of several claims they just filed.
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "“100+ users” sent for review. It adds 80 XP once it is approved.",
    );
  });

  it("names the product whose launch was filed after adding one", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({ development, projects: [] }),
      { status: 200, headers: { "content-type": "application/json" } },
    )));
    renderCard();

    await user.click(screen.getByRole("button", { name: "Add achievement" }));
    await user.click(await screen.findByRole("button", { name: /Launched a new product/ }));
    await user.type(screen.getByLabelText("Product name"), "Tideline");
    await user.type(screen.getByLabelText("Product URL"), "https://tideline.example/");
    await user.click(screen.getByRole("button", { name: "Add product" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "“Tideline” added, and its launch sent for review. It adds 100 XP once it is approved.",
    );
  });

  it("keeps showing what is awaiting approval after the card is closed and reopened", async () => {
    mockRows.project_achievements = [
      { project_id: development.project.id, achievement_type: "users_100", status: "pending" },
    ];
    const { unmount } = renderCard();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "“100+ users” on Garageware is with an admin for approval. It adds 80 XP once approved.",
    );

    // The bug this covers: the message used to be component state, so reopening the plot lost it.
    unmount();
    renderCard();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "“100+ users” on Garageware is with an admin for approval.",
    );
  });

  it("summarises rather than lists when several claims are waiting", async () => {
    mockRows.project_achievements = [
      { project_id: development.project.id, achievement_type: "users_100", status: "pending" },
      { project_id: null, achievement_type: "revenue_100", status: "pending" },
    ];
    renderCard();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "2 achievements are with an admin for approval. They add 280 XP once approved.",
    );
  });

  it("shows nothing to a visitor looking at someone else's plot", async () => {
    mockRows.project_achievements = [
      { project_id: development.project.id, achievement_type: "users_100", status: "pending" },
    ];
    render(
      <ProjectCard
        development={development}
        address="Pioneer District · Jobs Avenue · North Plot 01"
        currentUserId="someone-else"
        onClose={vi.fn()}
        onUpdated={vi.fn()}
      />,
    );

    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  });

  it("asks for evidence in the words of the rung, and will not send without it", async () => {
    const user = userEvent.setup();
    renderCard();

    await user.click(screen.getByRole("button", { name: "Add achievement" }));
    await user.click(await screen.findByRole("button", { name: /Gained users/ }));
    await user.click(await screen.findByRole("button", { name: /Garageware/ }));
    await user.click(await screen.findByRole("radio", { name: /100\+ users/ }));
    await user.click(screen.getByRole("button", { name: "Next" }));

    // The prompt and the note both come from the catalog, so a re-worded ask needs no deploy.
    expect(screen.getByText("Show the count and where it came from")).toBeInTheDocument();
    expect(screen.getByText("Leave the dashboard visible, not just the number.")).toBeInTheDocument();

    const send = screen.getByRole("button", { name: "Send for review" });
    expect(send).toBeDisabled();

    // A note is the claim restated, not evidence for it.
    await user.type(screen.getByLabelText("Anything else we should know"), "about a hundred");
    expect(screen.getByRole("button", { name: "Send for review" })).toBeDisabled();

    await user.type(screen.getByLabelText("Link"), "https://dash.example/users");
    expect(screen.getByRole("button", { name: "Send for review" })).toBeEnabled();
  });

  it("posts the selected rung and returns to the card", async () => {
    const user = userEvent.setup();
    const onUpdated = vi.fn();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({ development, achievement: { status: "pending", xpPending: 80 }, projects: [] }),
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
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.type(screen.getByLabelText("Link"), "https://dash.example/users");
    await user.click(screen.getByRole("button", { name: "Send for review" }));

    await waitFor(() => expect(onUpdated).toHaveBeenCalledWith(development));
    const [url, request] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("/api/achievements");
    expect(JSON.parse(String(request?.body))).toEqual({
      achievementType: "users_100",
      projectId: development.project.id,
      evidenceLink: "https://dash.example/users",
    });
  });

  it("skips the project picker for revenue, which belongs to the founder", async () => {
    const user = userEvent.setup();
    const onUpdated = vi.fn();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({
        development,
        achievement: { status: "pending", xpPending: 200 },
        projects: [],
        founderAchievements: [],
      }),
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
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.type(screen.getByLabelText("Link"), "https://dash.example/users");
    await user.click(screen.getByRole("button", { name: "Send for review" }));

    await waitFor(() => expect(onUpdated).toHaveBeenCalledWith(development));
    const [, request] = vi.mocked(fetch).mock.calls[0];
    // No projectId at all: the RPC decides which types need one.
    expect(JSON.parse(String(request?.body))).toEqual({
      achievementType: "revenue_100",
      evidenceLink: "https://dash.example/users",
    });
  });
});

describe("ProjectCard status editing", () => {
  afterEach(() => vi.unstubAllGlobals());

  function openCard(xp = 110, statusText: string | null = null) {
    const savedDevelopment = { ...development, statusText, progression: { ...development.progression, xp } };
    const onUpdated = vi.fn();
    const props = { development: savedDevelopment, currentUserId: "user-1", address: "Jobs Avenue", onClose: vi.fn(), onUpdated };
    const view = render(<ProjectCard {...props} />);
    return { ...view, props, onUpdated };
  }

  async function openStatus(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole("button", { name: "Customise" }));
    await user.click(screen.getByRole("button", { name: /Status bubble/ }));
  }

  it("shows a locked preview at 109 XP", async () => {
    const user = userEvent.setup();
    openCard(109, "Previously unlocked");
    await openStatus(user);
    expect(screen.getByText(/Reach 110 XP/)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Ada Founder is online" })).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: /Status text/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save status" })).not.toBeInTheDocument();
  });

  it("previews and saves at exactly 110 XP, then reloads the persisted message", async () => {
    const user = userEvent.setup();
    const { props, onUpdated, rerender } = openCard();
    const saved = { ...props.development, statusText: "Shipping 🚀" };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ development: saved }), { status: 200 })));
    await openStatus(user);
    const field = screen.getByRole("textbox", { name: /Status text/ });
    expect(field).toHaveFocus();
    await user.type(field, "  Shipping 🚀  ");
    expect(screen.getByRole("img", { name: "Ada Founder is online: Shipping 🚀" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save status" }));
    expect(fetch).toHaveBeenCalledWith("/api/plot-claim/status", expect.objectContaining({ method: "PATCH", body: JSON.stringify({ statusText: "Shipping 🚀" }) }));
    expect(onUpdated).toHaveBeenCalledWith(saved);
    rerender(<ProjectCard {...props} development={saved} />);
    await user.click(screen.getByRole("button", { name: /Status bubble/ }));
    expect(screen.getByRole("textbox", { name: /Status text/ })).toHaveValue("Shipping 🚀");
  });

  it("discards drafts on Back and only persists Reset after Save", async () => {
    const user = userEvent.setup();
    openCard(110, "Building");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ development }), { status: 200 })));
    await openStatus(user);
    await user.clear(screen.getByRole("textbox", { name: /Status text/ }));
    await user.type(screen.getByRole("textbox", { name: /Status text/ }), "Unsaved");
    await user.click(screen.getByRole("button", { name: /Back/ }));
    await user.click(screen.getByRole("button", { name: /Status bubble/ }));
    expect(screen.getByRole("textbox", { name: /Status text/ })).toHaveValue("Building");
    await user.click(screen.getByRole("button", { name: "Reset to Online" }));
    expect(fetch).not.toHaveBeenCalled();
    expect(screen.getByRole("img", { name: "Ada Founder is online" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save status" }));
    expect(fetch).toHaveBeenCalledWith("/api/plot-claim/status", expect.objectContaining({ body: JSON.stringify({ statusText: null }) }));
  });

  it("retains the draft after a failed save and supports retry", async () => {
    const user = userEvent.setup();
    openCard();
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: "Please retry." } }), { status: 500 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ development }), { status: 200 })));
    await openStatus(user);
    await user.type(screen.getByRole("textbox", { name: /Status text/ }), "Shipping");
    await user.click(screen.getByRole("button", { name: "Save status" }));
    expect(screen.getByText("Please retry.")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /Status text/ })).toHaveValue("Shipping");
    await user.click(screen.getByRole("button", { name: "Save status" }));
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("rejects overlong text before sending it", async () => {
    const user = userEvent.setup();
    openCard();
    vi.stubGlobal("fetch", vi.fn());
    await openStatus(user);
    await user.type(screen.getByRole("textbox", { name: /Status text/ }), "x".repeat(41));
    await user.click(screen.getByRole("button", { name: "Save status" }));
    expect(screen.getByText(/single-line status of 40 characters or fewer/)).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not expose configuration to other founders", () => {
    render(<ProjectCard development={development} currentUserId="someone-else" address="Jobs Avenue" onClose={vi.fn()} onUpdated={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Customise" })).not.toBeInTheDocument();
  });
});

describe("owner and visitor modal routing", () => {
  it.each([undefined, "other-user"])("shows the visitor profile for %s", async (currentUserId) => {
    render(<ProjectCard development={development} address="Jobs Avenue" currentUserId={currentUserId} onClose={vi.fn()} onUpdated={vi.fn()} />);
    expect(screen.getByRole("heading", { name: development.founder.fullName })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Customise" })).not.toBeInTheDocument();
    await screen.findByText("Claimed a plot");
  });
  it("switches away from an open owner editor when the user logs out", async () => {
    const props = { development, address: "Jobs Avenue", onClose: vi.fn(), onUpdated: vi.fn() };
    const view = render(<ProjectCard {...props} currentUserId={development.ownerId} />);
    await userEvent.click(screen.getByRole("button", { name: "Customise" }));
    await userEvent.click(screen.getByRole("button", { name: /Founder details/ }));
    expect(screen.getByRole("textbox", { name: "Public bio (optional)" })).toBeInTheDocument();
    view.rerender(<ProjectCard {...props} />);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    await screen.findByText("Claimed a plot");
  });
  it("submits bio through the existing founder editor", async () => {
    stubSuccessfulSave();
    render(<ProjectCard development={development} address="Jobs Avenue" currentUserId={development.ownerId} onClose={vi.fn()} onUpdated={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Customise" }));
    await userEvent.click(screen.getByRole("button", { name: /Founder details/ }));
    await userEvent.type(screen.getByRole("textbox", { name: "Public bio (optional)" }), "Building for makers");
    await userEvent.click(screen.getByRole("button", { name: "Save details" }));
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("/api/profile");
    expect((init?.body as FormData).get("bio")).toBe("Building for makers");
    vi.unstubAllGlobals();
  });
});
