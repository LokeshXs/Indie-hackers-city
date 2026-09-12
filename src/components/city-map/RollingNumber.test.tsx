import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RollingNumber } from "./RollingNumber";

describe("RollingNumber", () => {
  it.each([0, 140, 490, 999, 1000, 12345])("aligns every wheel at %i XP", (value) => {
    const { container } = render(<RollingNumber value={value} still />);
    const wheels = container.querySelector("[data-value]")!.children;

    String(value).split("").forEach((digit, index) => {
      const column = wheels[index].firstElementChild as HTMLElement;
      expect(column.style.transform).toBe(digit === "0" ? "none" : `translateY(-${digit}em)`);
    });
  });

  it("keeps the next zero visible during rollover", () => {
    const { container } = render(<RollingNumber value={9.5} still />);
    const column = container.querySelector("[data-value]")!.firstElementChild!.firstElementChild as HTMLElement;

    expect(column.style.transform).toBe("translateY(-9.5em)");
    expect(column.lastElementChild).toHaveTextContent("0");
  });
});
