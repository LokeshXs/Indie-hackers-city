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

describe("building selector", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("places the selected building without billboard setup", async () => {
    const user = userEvent.setup();
    render(<CityMap3D district={starterDistrict} />);

    await user.click(screen.getByRole("button", { name: "North plot 1, available" }));
    expect(screen.getByRole("dialog", { name: "North plot 1 setup" })).toBeInTheDocument();

    const addButton = screen.getByRole("button", { name: /add building/i });
    expect(addButton).toBeEnabled();
    await waitFor(() => expect(addButton).toHaveFocus());
    await user.click(addButton);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText("Startup Shop was added to the city.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "North plot 1, occupied" })).toBeDisabled();
  });
});
