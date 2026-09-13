import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { OnlineFounderMarker } from "./OnlineFounderMarker";

describe("online founder marker", () => {
  it("keeps online state in the accessible label when custom text replaces Online", () => {
    render(<OnlineFounderMarker fullName="Ada Founder" avatarUrl={null} text="Shipping <script>" />);
    expect(screen.getByRole("img", { name: "Ada Founder is online: Shipping <script>" })).toBeInTheDocument();
    expect(screen.getByText("Shipping <script>")).toBeInTheDocument();
    expect(screen.getByText("AF")).toBeInTheDocument();
  });

  it("falls back on image failure and retries when the avatar URL changes", () => {
    const firstUrl = "https://lh3.googleusercontent.com/first";
    const secondUrl = "https://lh3.googleusercontent.com/second";
    const { container, rerender } = render(<OnlineFounderMarker fullName="Ada Founder" avatarUrl={firstUrl} />);
    fireEvent.error(container.querySelector("img")!);
    expect(screen.getByText("AF")).toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
    rerender(<OnlineFounderMarker fullName="Ada Founder" avatarUrl={secondUrl} />);
    expect(container.querySelector("img")).toHaveAttribute("src", secondUrl);
  });

  it("does not load an unsupported avatar host", () => {
    const { container } = render(<OnlineFounderMarker fullName="Ada" avatarUrl="https://example.test/portrait" />);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByRole("img", { name: "Ada is online" })).toBeInTheDocument();
    expect(screen.getByText("A")).toBeInTheDocument();
  });
});
