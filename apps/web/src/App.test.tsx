import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { App } from "./App";
import type { HouseSceneProps } from "./house/HouseScene";
import { I18nProvider, type Language } from "./i18n";

// WebGL is not available in jsdom; the scene is replaced by plain buttons.
vi.mock("./house/HouseScene", () => ({
  default: ({ onRoom, onItem }: HouseSceneProps) => (
    <>
      <button type="button" onClick={() => onRoom("bathroom")}>
        3D bathroom
      </button>
      <button
        type="button"
        onClick={() =>
          onItem({ item: "toilet", object: "toilet_0", room: "bathroom", size: [70, 42, 82] })
        }
      >
        3D toilet
      </button>
    </>
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
  const picker = screen.getByRole("group", {
    name: "Click the floor, the walls, the shower or anything in the room",
  });
  const names = within(picker)
    .getAllByRole("button")
    .map((b) => b.textContent);
  expect(names).toEqual(["Floor", "Shower", "Walls", "Ceiling", "Room shopping list"]);
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

test("the bathroom floor proposes a waterproof build-up with Schluter DITRA", async () => {
  renderApp();
  fireEvent.click(await screen.findByRole("button", { name: "3D bathroom" }));
  fireEvent.click(screen.getByRole("button", { name: "Floor" }));
  const buildup = screen.getByRole("region", { name: "Proposed build-up" });
  expect(within(buildup).getByText("Schluter DITRA")).toBeDefined();
  // layers run from the covering down to the structure
  const roles = within(buildup)
    .getAllByText(/Covering|Grout|Mortar|Membrane|Base layer|Structure/)
    .map((e) => e.textContent);
  expect(roles[0]).toBe("Grout");
  expect(roles[roles.length - 1]).toBe("Structure");
});

test("the bathroom wall build-up names Schluter KERDI-BOARD", async () => {
  renderApp();
  fireEvent.click(await screen.findByRole("button", { name: "3D bathroom" }));
  fireEvent.click(screen.getByRole("button", { name: "Walls" }));
  const buildup = screen.getByRole("region", { name: "Proposed build-up" });
  expect(within(buildup).getByText("Schluter KERDI-BOARD")).toBeDefined();
});

test("the build-up is translated", async () => {
  renderApp("uk");
  fireEvent.click(await screen.findByRole("button", { name: "3D bathroom" }));
  fireEvent.click(screen.getByRole("button", { name: "Підлога" }));
  const buildup = screen.getByRole("region", { name: "Пропонований пиріг" });
  expect(within(buildup).getByText("Лаги перекриття")).toBeDefined();
});

test("collecting the purchase lists each material with store search links", async () => {
  renderApp();
  fireEvent.click(await screen.findByRole("button", { name: "3D bathroom" }));
  fireEvent.click(screen.getByRole("button", { name: "Floor" }));
  fireEvent.click(screen.getByRole("button", { name: "Collect purchase" }));
  const list = screen.getByRole("region", { name: "Shopping list" });
  expect(within(list).getByText("39.4 kg · 2 × bag of 22.68 kg")).toBeDefined();
  const ditra = within(list).getByRole("list", { name: "Find Schluter DITRA in stores" });
  const rona = within(ditra).getByRole("link", { name: "RONA" });
  expect(rona.getAttribute("href")).toBe("https://www.rona.ca/en/search?q=Schluter%20DITRA");
  expect(rona.getAttribute("target")).toBe("_blank");
});

test("each layer shows its rate per square metre", async () => {
  renderApp("uk");
  fireEvent.click(await screen.findByRole("button", { name: "3D bathroom" }));
  fireEvent.click(screen.getByRole("button", { name: "Підлога" }));
  const buildup = screen.getByRole("region", { name: "Пропонований пиріг" });
  expect(within(buildup).getByText("2,12 кг на 1 м²")).toBeDefined();
  expect(
    within(buildup).getAllByRole("link", { name: "Schluter-DITRA Installation Handbook, с. 19" })
      .length,
  ).toBe(2);
});

test("clicking a fixture shows what to check and opens the stores' search", async () => {
  renderApp();
  fireEvent.click(await screen.findByRole("button", { name: "3D toilet" }));
  expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Toilet");
  expect(screen.getByText("Size in the model: 70 × 42 × 82 cm")).toBeDefined();
  expect(screen.getByText(/measure the rough-in/)).toBeDefined();
  const stores = screen.getByRole("list", { name: "Find Toilet in stores" });
  expect(within(stores).getByRole("link", { name: "RONA" }).getAttribute("href")).toBe(
    "https://www.rona.ca/en/search?q=toilet",
  );
  expect(screen.getByRole("navigation").textContent).toContain("Toilet");
});

test("the item card speaks the person's language", async () => {
  renderApp("uk");
  fireEvent.click(await screen.findByRole("button", { name: "3D toilet" }));
  expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Унітаз");
  expect(screen.getByText("Ванна кімната · Сантехніка")).toBeDefined();
  expect(screen.getByText(/виміряйте відстань від готової стіни/)).toBeDefined();
});

test("the room shopping list counts what the bathroom needs, with store links", async () => {
  renderApp();
  fireEvent.click(await screen.findByRole("button", { name: "3D bathroom" }));
  fireEvent.click(screen.getByRole("button", { name: "Room shopping list" }));
  expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Room shopping list");
  expect(screen.getByText("7.78 m")).toBeDefined();
  const fan = screen.getByRole("list", { name: "Find Bathroom exhaust fan in stores" });
  expect(within(fan).getByRole("link", { name: "RONA" }).getAttribute("href")).toBe(
    "https://www.rona.ca/en/search?q=bathroom%20exhaust%20fan",
  );
});

test("the house shopping list is offered before a room is chosen, in Ukrainian", async () => {
  renderApp("uk");
  fireEvent.click(screen.getByRole("button", { name: "Список закупів будинку" }));
  expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Список закупів будинку");
  expect(screen.getByText("Датчик диму та CO")).toBeDefined();
});

test("a surface offers technologies, and the room list follows the choice", async () => {
  renderApp();
  fireEvent.click(await screen.findByRole("button", { name: "3D bathroom" }));
  fireEvent.click(screen.getByRole("button", { name: "Walls" }));
  const technology = screen.getByRole("group", { name: "Technology" });
  expect(within(technology).getAllByRole("radio")).toHaveLength(3);
  fireEvent.click(
    within(technology).getByRole("radio", { name: "Moisture-resistant painted wall" }),
  );
  expect(screen.getAllByText("Benjamin Moore Aura Bath & Spa").length).toBeGreaterThan(0);

  fireEvent.click(screen.getByRole("button", { name: "Bathroom" }));
  fireEvent.click(screen.getByRole("button", { name: "Room shopping list" }));
  const materials = screen.getByRole("list", {
    name: "Find Benjamin Moore Aura Bath & Spa in stores",
  });
  expect(materials).toBeDefined();
  // walls 26.58 m² and ceiling 7.5 m² of paint at 0.23 L/m²: 3 cans of 3.79 L
  expect(screen.getByText(/7.9 L · 3 × can of 3.79 L/)).toBeDefined();
});
