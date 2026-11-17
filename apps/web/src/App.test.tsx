import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { App } from "./App";

afterEach(cleanup);

test("renders the product name", () => {
  render(<App />);
  expect(screen.getByRole("heading", { name: "BuildWise AI" })).toBeDefined();
});

test("the BW-001 example fits the recessed curbless shower", () => {
  render(<App />);
  const card = screen.getByRole("article", { name: /Recessed curbless shower/ });
  expect(within(card).getByTestId("verdict").textContent).toBe("Fits");
});

test("changing a condition changes the verdict", () => {
  render(<App />);
  fireEvent.change(screen.getByLabelText("Joist spacing on centre (mm)"), {
    target: { value: "488" },
  });
  const card = screen.getByRole("article", { name: /Recessed curbless shower/ });
  expect(within(card).getByTestId("verdict").textContent).toBe("Does not fit");
});

test("only verified facts give no conclusion yet", () => {
  render(<App />);
  fireEvent.click(screen.getByLabelText("Use only verified facts"));
  const card = screen.getByRole("article", { name: /Recessed curbless shower/ });
  expect(within(card).getByTestId("verdict").textContent).toBe("Not enough information");
});

test("the brief alone asks clarifying questions", () => {
  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: "Only “wood floor in Quebec”" }));
  const questions = screen.getByRole("region", { name: "Open questions" });
  expect(within(questions).getByRole("button", { name: /Subfloor thickness/ })).toBeDefined();
});

test("store links search the item in a new tab", () => {
  render(<App />);
  const [link] = screen.getAllByRole("link", { name: "RONA" });
  expect(link?.getAttribute("href")).toMatch(/^https:\/\/www\.rona\.ca\/en\/search\?q=Schluter%20/);
  expect(link?.getAttribute("target")).toBe("_blank");
  expect(link?.getAttribute("rel")).toBe("noopener noreferrer");
});
