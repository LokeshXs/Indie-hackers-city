import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loaderState = vi.hoisted(() => ({
  active: true,
  progress: 0,
  loaded: 0,
  total: 12,
  errors: [] as unknown[],
}));

vi.mock("@react-three/drei", () => ({
  useProgress: (selector: (state: typeof loaderState) => unknown) => selector(loaderState),
}));

import { CityLoadingScreen, getCityLoadingStage } from "./CityLoadingScreen";

describe("CityLoadingScreen", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.assign(loaderState, { active: true, progress: 0, loaded: 0, total: 12, errors: [] });
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("shows real asset progress and its matching city stage", () => {
    Object.assign(loaderState, { progress: 72, loaded: 8 });
    render(<CityLoadingScreen sceneReady={false} assetError={null} onComplete={vi.fn()} onRetry={vi.fn()} />);

    expect(screen.getByRole("status", { name: "Loading Indie Hackers City" })).toBeInTheDocument();
    expect(screen.getByText("Raising landmarks…")).toBeInTheDocument();
    expect(screen.getByText("72%")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "72");
    expect(screen.getByRole("heading", { name: "Indie Hackers City" })).toBeInTheDocument();
    expect(screen.queryByText(/city assets/i)).not.toBeInTheDocument();
    expect(document.querySelector('[class*="cityAssembly"]')).not.toBeInTheDocument();
  });

  it("maps progress thresholds to stable stage copy", () => {
    expect(getCityLoadingStage(0)).toBe("Surveying the shoreline…");
    expect(getCityLoadingStage(20)).toBe("Laying the city roads…");
    expect(getCityLoadingStage(45)).toBe("Preparing founder plots…");
    expect(getCityLoadingStage(70)).toBe("Raising landmarks…");
    expect(getCityLoadingStage(90)).toBe("Lighting the district…");
    expect(getCityLoadingStage(100, true)).toBe("Preparing your first view…");
  });

  it("keeps cached assets covered for the full intro and waits for the first frame", async () => {
    Object.assign(loaderState, { active: false, progress: 100, loaded: 12 });
    const onComplete = vi.fn();
    const { rerender } = render(
      <CityLoadingScreen sceneReady={false} assetError={null} onComplete={onComplete} onRetry={vi.fn()} />,
    );

    await act(async () => vi.advanceTimersByTime(1800));
    expect(onComplete).not.toHaveBeenCalled();
    expect(screen.getByText("Preparing your first view…")).toBeInTheDocument();

    await act(async () => {
      rerender(<CityLoadingScreen sceneReady assetError={null} onComplete={onComplete} onRetry={vi.fn()} />);
    });
    expect(onComplete).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTime(0));
    await act(async () => vi.advanceTimersByTime(220));
    await act(async () => vi.advanceTimersByTime(350));
    expect(onComplete).toHaveBeenCalledOnce();
  });

  it("does not finish when the first frame is ready but assets are still active", async () => {
    const onComplete = vi.fn();
    render(<CityLoadingScreen sceneReady assetError={null} onComplete={onComplete} onRetry={vi.fn()} />);

    await act(async () => vi.advanceTimersByTime(3000));
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("shows a recoverable error state", async () => {
    const onRetry = vi.fn();
    render(<CityLoadingScreen sceneReady={false} assetError={new Error("broken glb")} onComplete={vi.fn()} onRetry={onRetry} />);

    await act(async () => undefined);
    expect(screen.getByRole("alert")).toHaveTextContent("The city couldn’t finish loading");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
