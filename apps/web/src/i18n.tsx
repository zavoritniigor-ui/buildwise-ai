/**
 * Interface languages: Ukrainian, Russian, French and English.
 *
 * Interface strings live here, typed so every language must define every
 * message. Texts from the knowledge base (labels, rules, notes) are translated
 * in data/i18n/*.yaml and reach the app through the snapshot; English is their
 * source and the fallback.
 */
import { type ReactNode, createContext, useContext, useEffect, useMemo, useState } from "react";
import { KNOWLEDGE, type Knowledge } from "./knowledge";

export const LANGUAGES = [
  { code: "uk", name: "Українська" },
  { code: "ru", name: "Русский" },
  { code: "fr", name: "Français" },
  { code: "en", name: "English" },
] as const;

export type Language = (typeof LANGUAGES)[number]["code"];

const en = {
  tagline: "Plan your renovation room by room",
  language: "Language",
  house: "House",
  chooseRoom: "Choose a room",
  chooseSurface: "Click a floor, the walls or the shower",
  back: "Back to the house",
  close: "Close",
  rooms: {
    living: "Living room",
    kitchen: "Kitchen",
    bedroom: "Bedroom",
    hallway: "Hallway",
    bathroom: "Bathroom",
  },
  surfaces: { floor: "Floor", walls: "Walls", shower: "Shower" },
  area: (m2: string) => `${m2} m²`,
  wallsNote: "Wall area without door and window openings.",
  nextStep: "Layers and materials per square metre will appear here in the next step.",
  dataNote: "Manufacturer facts are still awaiting review by a person.",
};

export type Messages = typeof en;

const uk: Messages = {
  tagline: "Плануйте ремонт кімната за кімнатою",
  language: "Мова",
  house: "Будинок",
  chooseRoom: "Оберіть кімнату",
  chooseSurface: "Клацніть підлогу, стіни чи душову",
  back: "До будинку",
  close: "Закрити",
  rooms: {
    living: "Вітальня",
    kitchen: "Кухня",
    bedroom: "Спальня",
    hallway: "Коридор",
    bathroom: "Ванна кімната",
  },
  surfaces: { floor: "Підлога", walls: "Стіни", shower: "Душова" },
  area: (m2) => `${m2} м²`,
  wallsNote: "Площа стін без вирахування дверей і вікон.",
  nextStep: "Наступним кроком тут з'являться шари та матеріали на 1 м².",
  dataNote: "Дані виробників ще чекають перевірки людиною.",
};

const ru: Messages = {
  tagline: "Планируйте ремонт комната за комнатой",
  language: "Язык",
  house: "Дом",
  chooseRoom: "Выберите комнату",
  chooseSurface: "Нажмите на пол, стены или душевую",
  back: "К дому",
  close: "Закрыть",
  rooms: {
    living: "Гостиная",
    kitchen: "Кухня",
    bedroom: "Спальня",
    hallway: "Коридор",
    bathroom: "Ванная",
  },
  surfaces: { floor: "Пол", walls: "Стены", shower: "Душевая" },
  area: (m2) => `${m2} м²`,
  wallsNote: "Площадь стен без вычета дверей и окон.",
  nextStep: "Следующим шагом здесь появятся слои и материалы на 1 м².",
  dataNote: "Данные производителей ещё ждут проверки человеком.",
};

const fr: Messages = {
  tagline: "Planifiez vos rénovations pièce par pièce",
  language: "Langue",
  house: "Maison",
  chooseRoom: "Choisissez une pièce",
  chooseSurface: "Cliquez sur le plancher, les murs ou la douche",
  back: "Retour à la maison",
  close: "Fermer",
  rooms: {
    living: "Salon",
    kitchen: "Cuisine",
    bedroom: "Chambre",
    hallway: "Couloir",
    bathroom: "Salle de bain",
  },
  surfaces: { floor: "Plancher", walls: "Murs", shower: "Douche" },
  area: (m2) => `${m2} m²`,
  wallsNote: "Surface des murs sans déduire les portes et fenêtres.",
  nextStep: "Les couches et les matériaux au mètre carré s'afficheront ici à la prochaine étape.",
  dataNote: "Les données des fabricants attendent encore une vérification humaine.",
};

export const MESSAGES: Record<Language, Messages> = { en, uk, ru, fr };

const STORAGE_KEY = "buildwise.language";

const isLanguage = (value: string | null | undefined): value is Language =>
  LANGUAGES.some((l) => l.code === value);

/** The saved choice, else the browser's preferred supported language, else English. */
export function initialLanguage(): Language {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (isLanguage(saved)) return saved;
  } catch {
    // Storage can be unavailable (private mode); fall back to the browser.
  }
  const preferred = typeof navigator === "undefined" ? [] : navigator.languages;
  for (const tag of preferred) {
    const code = tag.slice(0, 2).toLowerCase();
    if (isLanguage(code)) return code;
  }
  return "en";
}

/** Translate a text from the knowledge base; English is the source and fallback. */
export function translateData(
  text: string,
  language: Language,
  knowledge: Knowledge = KNOWLEDGE,
): string {
  if (language === "en") return text;
  return knowledge.translations[language]?.[text] ?? text;
}

interface I18n {
  language: Language;
  setLanguage: (language: Language) => void;
  t: Messages;
  d: (text: string) => string;
}

const I18nContext = createContext<I18n | null>(null);

export function I18nProvider({
  children,
  language: fixed,
}: {
  children: ReactNode;
  language?: Language;
}) {
  const [language, setLanguageState] = useState<Language>(() => fixed ?? initialLanguage());

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const value = useMemo<I18n>(
    () => ({
      language,
      setLanguage: (next) => {
        setLanguageState(next);
        try {
          localStorage.setItem(STORAGE_KEY, next);
        } catch {
          // Not saving the choice is fine.
        }
      },
      t: MESSAGES[language],
      d: (text) => translateData(text, language),
    }),
    [language],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  const context = useContext(I18nContext);
  if (!context) throw new Error("useI18n must be used inside I18nProvider");
  return context;
}
