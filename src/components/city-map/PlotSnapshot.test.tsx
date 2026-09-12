import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { CityDevelopment } from "@/lib/city/types";
import { PlotSnapshot } from "./PlotSnapshot";

vi.mock("./ModelPreview", () => ({
  PLOT_PREVIEW_CAMERA: [8, 2.8, 8],
  PreviewStage: ({ onCapture }: { onCapture(image: string): void }) => (
    <button onClick={() => onCapture("data:image/png;base64,c25hcHNob3Q=")}>Capture scene</button>
  ),
  BuildingPreview: () => null,
  PlotPreview: () => null,
}));

it("replaces the live scene with the captured image", () => {
  const development = { building: { assetId: "startup-building-level-1" } } as CityDevelopment;
  render(<PlotSnapshot development={development} address="North Plot 01" />);
  fireEvent.click(screen.getByRole("button", { name: "Capture scene" }));
  expect(screen.queryByRole("button", { name: "Capture scene" })).not.toBeInTheDocument();
  expect(screen.getByRole("img", { name: "Plot at North Plot 01" }))
    .toHaveAttribute("src", "data:image/png;base64,c25hcHNob3Q=");
});
