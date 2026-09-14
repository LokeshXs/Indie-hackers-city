import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CityDevelopment } from "@/lib/city/types";
import type { PublicMilestone } from "@/lib/city/timeline";
const fake = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock("@/lib/supabase/client", () => ({ getSupabaseBrowserClient: () => ({}) }));
vi.mock("@/lib/city/timeline", async (original) => ({ ...await original<object>(), loadPublicTimeline: fake.load }));
import { VisitorPlotCard } from "./VisitorPlotCard";
const development: CityDevelopment = {
  plotId: "p", ownerId: "o", statusText: null,
  founder: { fullName: "Ada Founder", avatarUrl: null, xHandle: "ada", bio: "Building small tools." },
  project: { id: "project", name: "BeatClub", websiteUrl: "https://example.com", type: "website" },
  building: { level: 1, assetId: "startup-building-level-1" },
  billboard: { backgroundColor: "#123456", textColor: "#ffffff" },
  progression: { xp: 390, buildingLevel: 1, currentLevelXp: 0, nextLevelXp: 490 },
  claimedAt: "2026-09-01T00:00:00Z", updatedAt: "2026-09-01T00:00:00Z",
};
const milestones: PublicMilestone[] = Array.from({ length: 9 }, (_, index) => ({ id: String(index), category: "users", label: `Milestone ${index}`, projectName: "BeatClub", date: development.claimedAt }));
beforeEach(() => { fake.load.mockReset(); fake.load.mockResolvedValue(milestones); });
describe("visitor profile", () => {
  it("shows public details, safe project/X links and no editing tools", async () => {
    render(<VisitorPlotCard development={development} onClose={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Ada Founder" })).toBeInTheDocument();
    expect(screen.getByText("Building small tools.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "BeatClub" })).toHaveAttribute("href", "https://example.com/");
    expect(screen.getByRole("link", { name: /@ada/ })).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByLabelText("390 city XP")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Customise" })).not.toBeInTheDocument();
    await screen.findByText("Milestone 8");
  });
  it("expands the gap and returns focus when collapsed", async () => {
    const user = userEvent.setup();
    render(<VisitorPlotCard development={development} onClose={vi.fn()} />);
    await user.click(await screen.findByRole("button", { name: "Show 4 more milestones" }));
    expect(screen.getByText("Milestone 4")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Show less" })).toHaveFocus());
    await user.click(screen.getByRole("button", { name: "Show less" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Show 4 more milestones" })).toHaveFocus());
    expect(screen.queryByText("Milestone 4")).not.toBeInTheDocument();
  });
  it("retries failed loads and supports empty history and missing optional profile fields", async () => {
    fake.load.mockRejectedValueOnce(new Error()).mockResolvedValueOnce([]);
    render(<VisitorPlotCard development={{ ...development, founder: { ...development.founder, bio: null, xHandle: null } }} onClose={vi.fn()} />);
    await userEvent.click(await screen.findByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.queryByLabelText("Loading founder journey")).not.toBeInTheDocument());
    expect(screen.queryByRole("link", { name: /@ada/ })).not.toBeInTheDocument();
    expect(screen.getByText("AF")).toBeInTheDocument();
  });
  it("ignores requests after unmount and supports Escape dismissal", async () => {
    let resolve!: (value: PublicMilestone[]) => void;
    fake.load.mockReturnValue(new Promise<PublicMilestone[]>((done) => { resolve = done; }));
    const close = vi.fn();
    const view = render(<VisitorPlotCard development={development} onClose={close} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(close).toHaveBeenCalledOnce();
    view.unmount();
    await act(async () => resolve(milestones));
  });
});

it("counts XP smoothly to the exact total without changing the accessible value", async () => {
  let tick: FrameRequestCallback | undefined;
  const raf = vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => { tick = callback; return 1; });
  const now = vi.spyOn(performance, "now").mockReturnValue(0);
  const view = render(<VisitorPlotCard development={development} onClose={vi.fn()} />);
  try {
    const xp = screen.getByLabelText("390 city XP");
    expect(xp.firstChild?.textContent).toBe("0");
    act(() => tick?.(1200));
    const halfway = Number(xp.firstChild?.textContent);
    expect(halfway).toBeGreaterThan(0);
    expect(halfway).toBeLessThan(390);
    act(() => tick?.(2400));
    expect(xp.firstChild?.textContent).toBe("390");
    expect(screen.queryByText("On the billboard")).not.toBeInTheDocument();
    await screen.findByText("Milestone 8");
  } finally { view.unmount(); raf.mockRestore(); now.mockRestore(); }
});

it("shows the final XP immediately when reduced motion is enabled", async () => {
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
  const view = render(<VisitorPlotCard development={development} onClose={vi.fn()} />);
  try {
    expect(screen.getByLabelText("390 city XP").firstChild?.textContent).toBe("390");
    await screen.findByText("Milestone 8");
  } finally { view.unmount(); vi.unstubAllGlobals(); }
});

it("uses the supplied achievement asset and falls back to the SVG on load failure", async () => {
  fake.load.mockResolvedValue([{ ...milestones[0], label: "10+ users" }]);
  render(<VisitorPlotCard development={development} onClose={vi.fn()} />);
  const card = (await screen.findByText("10+ users")).closest("article")!;
  const icon = card.querySelector("img")!;
  expect(icon).not.toBeNull();
  expect(decodeURIComponent(icon.getAttribute("src") ?? "")).toContain("/assets/timeline_modal_assets/users_gained.png");
  fireEvent.error(icon);
  expect(card.querySelector("img")).toBeNull();
  expect(card.querySelector("svg")).not.toBeNull();
  expect(screen.getByText("10+ users")).toBeInTheDocument();
});
