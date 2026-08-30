import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { starterDistrict } from "./map-data";

const { mockAuth } = vi.hoisted(() => ({
  mockAuth: {
    user: { id: "user-1", email: "founder@example.com", user_metadata: {} } as Record<string, unknown> | null,
    isAuthenticated: true,
    isLoading: false,
    signInWithGoogle: vi.fn(async () => undefined),
    signOut: vi.fn(async () => undefined),
  },
}));

vi.mock("@/components/auth/AuthProvider", () => ({ useAuth: () => mockAuth }));
vi.mock("@/components/auth/AccountMenu", () => ({ AccountMenu: () => null }));

vi.mock("@react-three/fiber", () => ({
  Canvas: () => <div data-testid="three-canvas" />,
  useFrame: vi.fn(),
  useThree: () => ({ camera: { position: { set: vi.fn() }, lookAt: vi.fn() } }),
}));

vi.mock("@react-three/drei", () => {
  const useGLTF = Object.assign(vi.fn(), { preload: vi.fn() });
  const useTexture = Object.assign(vi.fn(), { preload: vi.fn() });
  return {
    OrbitControls: () => null,
    Html: () => null,
    useGLTF,
    useTexture,
  };
});

import { CityMap3D } from "./CityMap3D";

const plotId = "pioneer:jobs:north:01";
const plotAddress = "Pioneer District · Jobs Avenue · North Plot 01";
const development = {
  plotId,
  ownerId: "user-1",
  project: { id: "123e4567-e89b-42d3-a456-426614174000", name: "Xenith", websiteUrl: "https://xenith.dev/", type: "app" as const },
  founder: { fullName: "Lokesh Singh", xHandle: "lokesh_singh", avatarUrl: null },
  building: { level: 1 as const, assetId: "startup-building-level-1" as const, color: "#e2775c" },
  claimedAt: "2026-08-30T00:00:00.000Z",
  updatedAt: "2026-08-30T00:00:00.000Z",
};

describe("plot claim modal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.user = { id: "user-1", email: "founder@example.com", user_metadata: {} };
    mockAuth.isAuthenticated = true;
    mockAuth.isLoading = false;
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ development }), {
      status: 201,
      headers: { "content-type": "application/json" },
    })));
  });

  it("gates an anonymous plot with Google sign-in", async () => {
    mockAuth.user = null;
    mockAuth.isAuthenticated = false;
    const user = userEvent.setup();
    render(<CityMap3D district={starterDistrict} initialDevelopments={{}} />);

    await user.click(screen.getByRole("button", { name: `${plotAddress}, available` }));
    expect(screen.getByRole("heading", { name: "Sign in to claim this plot" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Continue with Google" }));
    expect(mockAuth.signInWithGoogle).toHaveBeenCalledWith(`/?claimPlot=${encodeURIComponent(plotId)}`);
  });

  it("resumes an authenticated OAuth return and prefills the Google name", async () => {
    mockAuth.user = {
      id: "user-1",
      email: "founder@example.com",
      user_metadata: { full_name: "Ada Founder" },
    };
    render(<CityMap3D district={starterDistrict} initialDevelopments={{}} initialClaimPlotId={plotId} />);

    expect(await screen.findByRole("dialog", { name: `${plotAddress} setup` })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Full name" })).toHaveValue("Ada Founder");
  });

  it("shows an OAuth retry error on an anonymous return", async () => {
    mockAuth.user = null;
    mockAuth.isAuthenticated = false;
    render(<CityMap3D district={starterDistrict} initialDevelopments={{}} initialClaimPlotId={plotId} initialAuthError="oauth" />);

    expect(await screen.findByRole("alert")).toHaveTextContent("We couldn’t complete Google sign-in. Please try again.");
  });

  it("opens a public project card for a persisted building and lets its owner edit", async () => {
    const user = userEvent.setup();
    render(<CityMap3D district={starterDistrict} initialDevelopments={{ [plotId]: development }} />);

    await user.click(screen.getByRole("button", { name: `${plotAddress}, occupied` }));
    expect(screen.getByRole("dialog", { name: "Xenith" })).toHaveTextContent("Founded by Lokesh Singh");
    expect(screen.getByRole("link", { name: /visit project/i })).toHaveAttribute("href", "https://xenith.dev/");
    expect(screen.getByRole("button", { name: "Edit project" })).toBeInTheDocument();
  });

  it("points a one-plot owner at their existing project without opening any modal", async () => {
    const user = userEvent.setup();
    render(<CityMap3D district={starterDistrict} initialDevelopments={{ [plotId]: development }} />);

    await user.click(screen.getByRole("button", { name: "Pioneer District · Jobs Avenue · North Plot 02, available" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Full name" })).not.toBeInTheDocument();
    expect(screen.getByText(/Each founder receives one city plot\. Here is yours: Xenith\./)).toBeInTheDocument();
  });

  it("completes both required steps and claims a plot", async () => {
    const user = userEvent.setup();
    render(<CityMap3D district={starterDistrict} initialDevelopments={{}} />);

    await user.click(screen.getByRole("button", { name: `${plotAddress}, available` }));
    expect(screen.getByRole("dialog", { name: `${plotAddress} setup` })).toBeInTheDocument();

    const fullNameInput = screen.getByRole("textbox", { name: "Full name" });
    const continueButton = screen.getByRole("button", { name: /continue/i });
    expect(continueButton).toBeDisabled();
    await waitFor(() => expect(fullNameInput).toHaveFocus());
    await user.type(fullNameInput, "Lokesh Singh");
    const xHandleInput = screen.getByRole("textbox", { name: "X handle" });
    await user.type(xHandleInput, "@lokesh-singh");
    await user.tab();
    expect(screen.getByText("Use 1–15 letters, numbers, or underscores.")).toBeInTheDocument();
    expect(continueButton).toBeDisabled();
    await user.clear(xHandleInput);
    await user.type(xHandleInput, "@lokesh_singh");
    expect(continueButton).toBeEnabled();
    await user.click(continueButton);

    const projectInput = screen.getByRole("textbox", { name: "Project name" });
    const websiteInput = screen.getByRole("textbox", { name: "Project URL" });
    const continueToColorButton = screen.getByRole("button", { name: /continue/i });
    expect(continueToColorButton).toBeDisabled();
    await waitFor(() => expect(projectInput).toHaveFocus());
    await user.type(projectInput, "Xenith");
    await user.type(websiteInput, "ftp://xenith.dev");
    await user.tab();
    expect(screen.getByText("Enter a valid project URL.")).toBeInTheDocument();
    expect(continueToColorButton).toBeDisabled();

    await user.clear(websiteInput);
    await user.type(websiteInput, "xenith.dev");
    await user.tab();
    expect(websiteInput).toHaveValue("https://xenith.dev/");
    await user.click(screen.getByRole("radio", { name: "App" }));
    expect(continueToColorButton).toBeEnabled();
    await user.click(continueToColorButton);

    const claimButton = screen.getByRole("button", { name: /claim my plot/i });
    expect(claimButton).toBeEnabled();
    await user.click(screen.getByRole("radio", { name: "Coral" }));
    await user.click(claimButton);

    await waitFor(() => expect(screen.queryByRole("dialog", { name: `${plotAddress} setup` })).not.toBeInTheDocument(), { timeout: 1200 });
    const successDialog = await screen.findByRole("dialog", { name: "Plot claimed successfully" }, { timeout: 3000 });
    expect(successDialog).toHaveTextContent("You’re now part of");
    expect(successDialog).toHaveTextContent("Pioneer District");
    expect(screen.getByRole("button", { name: "View my building" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: `${plotAddress}, occupied` })).toBeEnabled();
  }, 15_000);
});
