import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { starterDistrict } from "./map-data";

vi.mock("@react-three/fiber", () => ({
  Canvas: () => <div data-testid="three-canvas" />,
  useFrame: vi.fn(),
  useThree: () => ({ camera: { position: { set: vi.fn() }, lookAt: vi.fn() } }),
}));

vi.mock("@react-three/drei", () => {
  const useGLTF = Object.assign(vi.fn(), { preload: vi.fn() });
  return {
    OrbitControls: () => null,
    useGLTF,
  };
});

import { CityMap3D } from "./CityMap3D";

describe("plot claim modal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("completes both required steps and claims a plot", async () => {
    const user = userEvent.setup();
    render(<CityMap3D district={starterDistrict} />);

    await user.click(screen.getByRole("button", { name: "North plot 1, available" }));
    expect(screen.getByRole("dialog", { name: "North plot 1 setup" })).toBeInTheDocument();

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
    const claimButton = screen.getByRole("button", { name: /claim my plot/i });
    expect(claimButton).toBeDisabled();
    await waitFor(() => expect(projectInput).toHaveFocus());
    await user.type(projectInput, "Xenith");
    await user.type(websiteInput, "ftp://xenith.dev");
    await user.tab();
    expect(screen.getByText("Enter a valid project URL.")).toBeInTheDocument();
    expect(claimButton).toBeDisabled();

    await user.clear(websiteInput);
    await user.type(websiteInput, "xenith.dev");
    await user.tab();
    expect(websiteInput).toHaveValue("https://xenith.dev/");
    await user.click(screen.getByRole("radio", { name: "App" }));
    await user.upload(screen.getByLabelText("Logo"), new File(["logo"], "xenith.png", { type: "image/png" }));
    expect(claimButton).toBeEnabled();
    await user.click(claimButton);

    expect(screen.getByRole("button", { name: "Reserving plot…" })).toBeDisabled();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument(), { timeout: 1200 });
    const successDialog = await screen.findByRole("dialog", { name: "Plot claimed successfully" }, { timeout: 3500 });
    expect(successDialog).toHaveTextContent("You’re now part of");
    expect(successDialog).toHaveTextContent("Founders Crossing");
    expect(screen.getByRole("button", { name: "View my building" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "North plot 1, occupied" })).toBeDisabled();
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Plot claimed successfully" })).not.toBeInTheDocument(), { timeout: 5500 });
  }, 12_000);
});
