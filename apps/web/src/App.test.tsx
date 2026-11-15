import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { App } from "./App";

test("renders the product name", () => {
  render(<App />);
  expect(screen.getByRole("heading", { name: "BuildWise AI" })).toBeDefined();
});

test("store links open the retailer search in a new tab", () => {
  render(<App />);
  const link = screen.getByRole("link", { name: "RONA" });
  expect(link.getAttribute("href")).toBe("https://www.rona.ca/en/search?q=Schluter%20KERDI-BAND");
  expect(link.getAttribute("target")).toBe("_blank");
  expect(link.getAttribute("rel")).toBe("noopener noreferrer");
});
