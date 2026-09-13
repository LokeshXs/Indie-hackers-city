import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { CityDevelopment } from "@/lib/city/types";
import { PlotShareModal } from "./PlotShareModal";
const development = { founder: { fullName: "Ada" }, progression: { xp: 390 } } as CityDevelopment;
const result = { shareId: "id", shareUrl: "https://city.example/share/id", imageUrl: "https://city.example/share/id/image", caption: "390 XP & counting" };

describe("plot share modal", () => {
  it("prepares once in Strict Mode and enables links only after the stored PNG loads", async () => {
    const prepare = vi.fn(async () => result);
    render(<StrictMode><PlotShareModal development={development} prepare={prepare} onClose={vi.fn()} /></StrictMode>);
    expect(screen.getByRole("button", { name: "Close share preview" })).toHaveFocus();
    expect(screen.getByRole("button", { name: "Share on X" })).toBeDisabled();
    const image = await screen.findByRole("img");
    expect(prepare).toHaveBeenCalledOnce();
    expect(image).toHaveAttribute("src", result.imageUrl);
    fireEvent.load(image);
    const shareLink = await screen.findByRole("link", { name: "Share on X" });
    const intent = new URL(shareLink.getAttribute("href")!);
    expect(intent.searchParams.get("text")).toBe(result.caption);
    expect(intent.searchParams.get("url")).toBe(result.shareUrl);
    expect(screen.getByRole("link", { name: "Download image" })).toHaveAttribute("href", `${result.imageUrl}?download=1`);
  });
  it("copies the caption without its decorative quotation marks", async () => {
    const user = userEvent.setup();
    const copy = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    render(<PlotShareModal development={development} prepare={async () => result} onClose={vi.fn()} />);
    await user.click(await screen.findByRole("button", { name: "Copy caption" }));
    expect(copy).toHaveBeenCalledWith(result.caption);
    expect(screen.getByRole("button", { name: "Copied!" })).toBeInTheDocument();
    expect(screen.getByText(`“${result.caption}”`)).toBeInTheDocument();
    expect(screen.getByText("Caption copied!")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Copy caption" })).toBeInTheDocument());
    expect(screen.getByText("Caption copied!")).toBeInTheDocument();
    copy.mockRestore();
  });
  it("retries a failed preparation", async () => {
    const prepare = vi.fn().mockRejectedValueOnce(new Error("Upload failed")).mockResolvedValue(result);
    const user = userEvent.setup();
    render(<PlotShareModal development={development} prepare={prepare} onClose={vi.fn()} />);
    expect(await screen.findByText("Upload failed")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    await screen.findByRole("img");
    expect(prepare).toHaveBeenCalledTimes(2);
  });
  it("aborts unfinished preparation on close/unmount", async () => {
    let signal: AbortSignal | undefined;
    const prepare = vi.fn((value: AbortSignal) => { signal = value; return new Promise<typeof result>(() => {}); });
    const { unmount } = render(<PlotShareModal development={development} prepare={prepare} onClose={vi.fn()} />);
    await waitFor(() => expect(prepare).toHaveBeenCalledOnce());
    unmount();
    expect(signal?.aborted).toBe(true);
  });
});
