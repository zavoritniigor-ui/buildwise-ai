import { expect, test } from "vitest";
import { LANGUAGES, MESSAGES, translateData } from "./i18n";
import { KNOWLEDGE } from "./knowledge";

test("all four languages are offered", () => {
  expect(LANGUAGES.map((l) => l.code)).toEqual(["uk", "ru", "fr", "en"]);
});

test("every language translates every room and surface", () => {
  for (const { code } of LANGUAGES) {
    const m = MESSAGES[code];
    expect(Object.values(m.rooms).every(Boolean)).toBe(true);
    expect(Object.values(m.surfaces).every(Boolean)).toBe(true);
  }
});

test("knowledge base texts are translated and English is the fallback", () => {
  expect(translateData("Plywood", "uk")).toBe("Фанера");
  expect(translateData("Plywood", "fr")).toBe("Contreplaqué");
  expect(translateData("Plywood", "en")).toBe("Plywood");
  expect(translateData("A text nobody wrote", "ru")).toBe("A text nobody wrote");
  expect(Object.keys(KNOWLEDGE.translations)).toEqual(["uk", "ru", "fr"]);
});
