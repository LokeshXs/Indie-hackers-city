import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Modal } from "./Modal";

describe("Modal", () => {
  it("exposes exactly one dialog role, on the panel and not the backdrop", () => {
    render(
      <Modal label="Plot setup" closeLabel="Close" onClose={vi.fn()}>
        <p>body</p>
      </Modal>,
    );

    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(screen.getByRole("dialog", { name: "Plot setup" })).toHaveAttribute("aria-modal", "true");
  });

  it("closes on Escape", async () => {
    const onClose = vi.fn();
    render(
      <Modal label="Plot setup" closeLabel="Close" onClose={onClose}>
        <p>body</p>
      </Modal>,
    );

    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("ignores Escape when closeOnEscape is false", async () => {
    const onClose = vi.fn();
    render(
      <Modal label="Claim celebration" closeLabel="Close" closeOnEscape={false} onClose={onClose}>
        <p>body</p>
      </Modal>,
    );

    await userEvent.keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("routes Escape to the topmost modal only", async () => {
    const onCloseOuter = vi.fn();
    const onCloseInner = vi.fn();
    render(
      <>
        <Modal label="Outer" closeLabel="Close outer" onClose={onCloseOuter}>
          <p>outer</p>
        </Modal>
        <Modal label="Inner" closeLabel="Close inner" onClose={onCloseInner}>
          <p>inner</p>
        </Modal>
      </>,
    );

    await userEvent.keyboard("{Escape}");
    expect(onCloseInner).toHaveBeenCalledTimes(1);
    expect(onCloseOuter).not.toHaveBeenCalled();
  });

  it("closes when the backdrop itself is pressed, but not the panel", async () => {
    const onClose = vi.fn();
    const { container } = render(
      <Modal label="Plot setup" closeLabel="Close" onClose={onClose}>
        <p>body</p>
      </Modal>,
    );

    await userEvent.click(screen.getByText("body"));
    expect(onClose).not.toHaveBeenCalled();

    await userEvent.click(container.firstElementChild as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("blocks backdrop dismissal and disables close while busy", async () => {
    const onClose = vi.fn();
    const { container } = render(
      <Modal label="Plot setup" closeLabel="Close" busy onClose={onClose}>
        <p>body</p>
      </Modal>,
    );

    await userEvent.click(container.firstElementChild as HTMLElement);
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Close" })).toBeDisabled();
  });

  it("takes initial focus only when asked", () => {
    const { unmount } = render(
      <Modal label="Plot setup" closeLabel="Close" onClose={vi.fn()}>
        <button type="button">Inside</button>
      </Modal>,
    );
    expect(document.body).toHaveFocus();
    unmount();

    render(
      <Modal label="Plot setup" closeLabel="Close" initialFocus="close" onClose={vi.fn()}>
        <button type="button">Inside</button>
      </Modal>,
    );
    expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();
  });

  it("cycles Tab within the panel, including selects and links", async () => {
    render(
      <Modal label="Plot setup" showClose={false} onClose={vi.fn()}>
        <button type="button">First</button>
        <select aria-label="Kind">
          <option>a</option>
        </select>
        <a href="https://example.com">Last</a>
      </Modal>,
    );

    const first = screen.getByRole("button", { name: "First" });
    const last = screen.getByRole("link", { name: "Last" });

    last.focus();
    await userEvent.tab();
    expect(first).toHaveFocus();

    await userEvent.tab({ shift: true });
    expect(last).toHaveFocus();
  });

  it("supports alertdialog with labelledby and describedby", () => {
    render(
      <Modal
        role="alertdialog"
        layout="panel"
        showClose={false}
        labelledBy="t"
        describedBy="d"
        onClose={vi.fn()}
      >
        <h2 id="t">Your plot is already claimed</h2>
        <p id="d">Only one plot per founder.</p>
      </Modal>,
    );

    const dialog = screen.getByRole("alertdialog", { name: "Your plot is already claimed" });
    expect(dialog).toHaveAccessibleDescription("Only one plot per founder.");
  });
});
