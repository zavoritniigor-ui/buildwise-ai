import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { App } from "./App";
import type { HouseSceneProps } from "./house/HouseScene";
import { I18nProvider, type Language } from "./i18n";

// WebGL is not available in jsdom; the scene is replaced by plain buttons.
vi.mock("./house/HouseScene", () => ({
  default: ({ onRoom }: HouseSceneProps) => (
    <button type="button" onClick={() => onRoom("bathroom")}>
      3D bathroom
    </button>
  ),
}));

vi.mock("./house/webgl", () => ({ supportsWebGL: () => true }));

afterEach(cleanup);

const renderApp = (language: Language = "en") =>
  render(
    <I18nProvider language={language}>
      <App />
    </I18nProvider>,
  );

test("starts at the house and asks for a room", async () => {
  renderApp();
  expect(screen.getByRole("status").textContent).toBe("Choose a room");
  expect(await screen.findByRole("button", { name: "3D bathroom" })).toBeDefined();
});

test("choosing the bathroom offers its floor, shower and walls", async () => {
  renderApp();
  fireEvent.click(await screen.findByRole("button", { name: "3D bathroom" }));
  const picker = screen.getByRole("group", { name: "Click a floor, the walls or the shower" });
  const names = within(picker)
    .getAllByRole("button")
    .map((b) => b.textContent);
  expect(names).toEqual(["Floor", "Shower", "Walls"]);
});

test("the bathroom floor shows its area without the shower", async () => {
  renderApp();
  fireEvent.click(await screen.findByRole("button", { name: "3D bathroom" }));
  fireEvent.click(screen.getByRole("button", { name: "Floor" }));
  const sheet = screen.getByRole("complementary");
  expect(within(sheet).getByRole("heading", { name: "Floor" })).toBeDefined();
  expect(within(sheet).getByText("6.42 m²")).toBeDefined();
});

test("the breadcrumb leads back to the house", async () => {
  renderApp();
  fireEvent.click(await screen.findByRole("button", { name: "3D bathroom" }));
  fireEvent.click(screen.getByRole("button", { name: "House" }));
  expect(screen.getByRole("status").textContent).toBe("Choose a room");
});

test.each([
  ["uk", "Оберіть кімнату", "Ванна кімната"],
  ["ru", "Выберите комнату", "Ванная"],
  ["fr", "Choisissez une pièce", "Salle de bain"],
] as const)("speaks %s", async (language, prompt, bathroom) => {
  renderApp(language);
  expect(screen.getByRole("status").textContent).toBe(prompt);
  fireEvent.click(await screen.findByRole("button", { name: "3D bathroom" }));
  expect(screen.getByRole("button", { name: bathroom })).toBeDefined();
});
