// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
const fake = vi.hoisted(() => ({ share: vi.fn(), load: vi.fn() }));
vi.mock("@/lib/sharing/server", async (original) => ({ ...await original<object>(), getPublicShare: fake.share }));
vi.mock("@/lib/city/load-city", () => ({ loadCity: fake.load }));
vi.mock("@/components/city-map/CityMap3D", () => ({ CityMap3D: () => null }));
import SharedPlotPage, { generateMetadata } from "./page";
const id = "75000000-0000-4000-8000-000000000001";
const snapshot = { id, owner_id: "owner", plot_id: "pioneer:jobs:north:01", founder_name: "Ada", xp: 390 };
const props = { params: Promise.resolve({ shareId: id }) };
beforeEach(() => {
  fake.share.mockResolvedValue(snapshot);
  fake.load.mockResolvedValue({ initialDevelopments: { [snapshot.plot_id]: { ownerId: "owner" } }, initialDevelopmentLoadError: false, activePlotIds: new Set([snapshot.plot_id]) });
});
describe("public share landing", () => {
  it("declares the same OG and X image with server-readable metadata", async () => {
    const meta = await generateMetadata(props);
    expect(meta.openGraph).toMatchObject({ images: [{ url: `http://localhost:3000/share/${id}/image`, width: 1200, height: 630 }] });
    expect(meta.twitter).toMatchObject({ card: "summary_large_image", images: [{ url: `http://localhost:3000/share/${id}/image` }] });
  });
  it("loads the city directly with its destination, without requiring sign-in", async () => {
    const page = await SharedPlotPage(props);
    expect(page.props.initialFocusPlotId).toBe(snapshot.plot_id);
    expect(page.props.initialShareUnavailable).toBe(false);
  });
  it("does not focus a different owner if the plot is no longer theirs", async () => {
    fake.load.mockResolvedValue({ initialDevelopments: { [snapshot.plot_id]: { ownerId: "someone-else" } }, initialDevelopmentLoadError: false });
    const page = await SharedPlotPage(props);
    expect(page.props.initialFocusPlotId).toBeUndefined();
    expect(page.props.initialShareUnavailable).toBe(true);
  });
  it("returns a not-found response for unknown shares", async () => {
    fake.share.mockResolvedValue(null);
    await expect(SharedPlotPage(props)).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;404");
  });
});
