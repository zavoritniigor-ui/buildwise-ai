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
  chooseSurface: "Click the floor, the walls, the shower or anything in the room",
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
  roles: {
    structure: "Structure",
    substrate: "Base layer",
    underlayment: "Underlayment",
    membrane: "Membrane",
    drain: "Drain",
    mortar: "Mortar",
    covering: "Covering",
    grout: "Grout",
    finish: "Finish",
  },
  buildup: "Proposed build-up",
  buildupNote: "Layers from the finished surface down to the structure.",
  noBuildup: "No build-up is defined for this surface yet.",
  units: { kg: "kg", m2: "m²", m: "m", L: "L", pcs: "pcs" },
  perArea: "per m²",
  perMetre: "per m of joint",
  perEach: "per surface",
  forArea: (area: string) => `for ${area} m²`,
  forLength: (length: string) => `for ${length} m of joint`,
  packageKind: { bag: "bag", roll: "roll", box: "box" },
  packages: (n: number, kind: string, size: string) => `${n} × ${kind} of ${size}`,
  waste: (percent: string) => `includes ${percent}% for cuts`,
  basis: { manufacturer: "manufacturer data", geometry: "from the surface", estimate: "estimate" },
  collect: "Collect purchase",
  purchaseTitle: "Shopping list",
  purchaseNote:
    "Each button opens the store's own search; price and stock are shown there. Quantities include the cut allowance; estimates will be replaced by manufacturer data.",
  hidePurchase: "Hide list",
  findIn: (name: string) => `Find ${name} in stores`,
  page: (n: number) => `p. ${n}`,
  area: (m2: string) => `${m2} m²`,
  wallsNote: "Wall area from floor to ceiling, less the doors, windows and passages.",
  categories: {
    cabinetry: "Cabinetry",
    plumbing: "Plumbing",
    electrical: "Electrical",
    lighting: "Lighting",
    heating: "Heating",
    ventilation: "Ventilation",
    door: "Doors",
    window: "Windows",
    hardware: "Hardware and accessories",
    trim: "Trim",
  },
  houseList: "House shopping list",
  roomList: "Room shopping list",
  inventoryNote:
    "Counted from the model: each fixture, device, door and window, and baseboard and cabinets by the metre. Each button opens the store's own search.",
  pieces: (n: string) => `${n} pcs`,
  metres: (n: string) => `${n} m`,
  itemSize: (dims: string) => `Size in the model: ${dims} cm`,
  beforeBuying: "Before buying",
  storesTitle: "Find it in stores",
  storesNote: "Each button opens the store's own search; price and stock are shown there.",
  nextStep: "Layers and materials per square metre will appear here in the next step.",
  dataNote: "Manufacturer facts are still awaiting review by a person.",
};

export type Messages = typeof en;

const uk: Messages = {
  tagline: "Плануйте ремонт кімната за кімнатою",
  language: "Мова",
  house: "Будинок",
  chooseRoom: "Оберіть кімнату",
  chooseSurface: "Клацніть підлогу, стіни, душову чи будь-що в кімнаті",
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
  roles: {
    structure: "Основа",
    substrate: "Базовий шар",
    underlayment: "Підкладка",
    membrane: "Мембрана",
    drain: "Трап",
    mortar: "Розчин",
    covering: "Покриття",
    grout: "Затирка",
    finish: "Оздоблення",
  },
  buildup: "Пропонований пиріг",
  buildupNote: "Шари від готової поверхні вниз до основи.",
  noBuildup: "Для цієї поверхні пиріг ще не задано.",
  units: { kg: "кг", m2: "м²", m: "м", L: "л", pcs: "шт." },
  perArea: "на 1 м²",
  perMetre: "на 1 м стику",
  perEach: "на поверхню",
  forArea: (area) => `на ${area} м²`,
  forLength: (length) => `на ${length} м стику`,
  packageKind: { bag: "мішок", roll: "рулон", box: "коробка" },
  packages: (n, kind, size) => `${n} × ${kind} ${size}`,
  waste: (percent) => `з запасом ${percent}% на підрізку`,
  basis: { manufacturer: "дані виробника", geometry: "з площі поверхні", estimate: "оцінка" },
  collect: "Зібрати закупи",
  purchaseTitle: "Список закупів",
  purchaseNote:
    "Кожна кнопка відкриває пошук на сайті магазину; ціну й наявність видно там. Кількості вже з запасом на підрізку; оцінки замінимо даними виробника.",
  hidePurchase: "Сховати список",
  findIn: (name) => `Знайти ${name} у магазинах`,
  page: (n) => `с. ${n}`,
  area: (m2) => `${m2} м²`,
  wallsNote: "Площа стін від підлоги до стелі за вирахуванням дверей, вікон і прорізів.",
  categories: {
    cabinetry: "Шафи й стільниці",
    plumbing: "Сантехніка",
    electrical: "Електрика",
    lighting: "Освітлення",
    heating: "Опалення",
    ventilation: "Вентиляція",
    door: "Двері",
    window: "Вікна",
    hardware: "Фурнітура й аксесуари",
    trim: "Оздоблювальні елементи",
  },
  houseList: "Список закупів будинку",
  roomList: "Список закупів кімнати",
  inventoryNote:
    "Пораховано з моделі: кожен прилад, пристрій, двері й вікно, а плінтус і шафи — у метрах. Кожна кнопка відкриває пошук самого магазину.",
  pieces: (n) => `${n} шт`,
  metres: (n) => `${n} м`,
  itemSize: (dims) => `Розмір у моделі: ${dims} см`,
  beforeBuying: "Перед купівлею",
  storesTitle: "Знайти в магазинах",
  storesNote: "Кожна кнопка відкриває пошук самого магазину; ціну й наявність видно там.",
  nextStep: "Наступним кроком тут з'являться шари та матеріали на 1 м².",
  dataNote: "Дані виробників ще чекають перевірки людиною.",
};

const ru: Messages = {
  tagline: "Планируйте ремонт комната за комнатой",
  language: "Язык",
  house: "Дом",
  chooseRoom: "Выберите комнату",
  chooseSurface: "Нажмите на пол, стены, душевую или что угодно в комнате",
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
  roles: {
    structure: "Основа",
    substrate: "Базовый слой",
    underlayment: "Подложка",
    membrane: "Мембрана",
    drain: "Трап",
    mortar: "Раствор",
    covering: "Покрытие",
    grout: "Затирка",
    finish: "Отделка",
  },
  buildup: "Предлагаемый пирог",
  buildupNote: "Слои от готовой поверхности вниз до основания.",
  noBuildup: "Для этой поверхности пирог ещё не задан.",
  units: { kg: "кг", m2: "м²", m: "м", L: "л", pcs: "шт." },
  perArea: "на 1 м²",
  perMetre: "на 1 м стыка",
  perEach: "на поверхность",
  forArea: (area) => `на ${area} м²`,
  forLength: (length) => `на ${length} м стыка`,
  packageKind: { bag: "мешок", roll: "рулон", box: "коробка" },
  packages: (n, kind, size) => `${n} × ${kind} ${size}`,
  waste: (percent) => `с запасом ${percent}% на подрезку`,
  basis: {
    manufacturer: "данные производителя",
    geometry: "по площади поверхности",
    estimate: "оценка",
  },
  collect: "Собрать закупку",
  purchaseTitle: "Список покупок",
  purchaseNote:
    "Каждая кнопка открывает поиск на сайте магазина; цена и наличие видны там. Количества уже с запасом на подрезку; оценки заменим данными производителя.",
  hidePurchase: "Скрыть список",
  findIn: (name) => `Найти ${name} в магазинах`,
  page: (n) => `с. ${n}`,
  area: (m2) => `${m2} м²`,
  wallsNote: "Площадь стен от пола до потолка за вычетом дверей, окон и проёмов.",
  categories: {
    cabinetry: "Шкафы и столешницы",
    plumbing: "Сантехника",
    electrical: "Электрика",
    lighting: "Освещение",
    heating: "Отопление",
    ventilation: "Вентиляция",
    door: "Двери",
    window: "Окна",
    hardware: "Фурнитура и аксессуары",
    trim: "Отделочные элементы",
  },
  houseList: "Список покупок для дома",
  roomList: "Список покупок для комнаты",
  inventoryNote:
    "Посчитано по модели: каждый прибор, устройство, дверь и окно, а плинтус и шкафы — в метрах. Каждая кнопка открывает поиск самого магазина.",
  pieces: (n) => `${n} шт`,
  metres: (n) => `${n} м`,
  itemSize: (dims) => `Размер в модели: ${dims} см`,
  beforeBuying: "Перед покупкой",
  storesTitle: "Найти в магазинах",
  storesNote: "Каждая кнопка открывает поиск самого магазина; цену и наличие видно там.",
  nextStep: "Следующим шагом здесь появятся слои и материалы на 1 м².",
  dataNote: "Данные производителей ещё ждут проверки человеком.",
};

const fr: Messages = {
  tagline: "Planifiez vos rénovations pièce par pièce",
  language: "Langue",
  house: "Maison",
  chooseRoom: "Choisissez une pièce",
  chooseSurface: "Cliquez sur le plancher, les murs, la douche ou tout objet de la pièce",
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
  roles: {
    structure: "Structure",
    substrate: "Couche de base",
    underlayment: "Sous-couche",
    membrane: "Membrane",
    drain: "Drain",
    mortar: "Mortier",
    covering: "Revêtement",
    grout: "Coulis",
    finish: "Finition",
  },
  buildup: "Assemblage proposé",
  buildupNote: "Les couches, de la surface finie jusqu'à la structure.",
  noBuildup: "Aucun assemblage n'est encore défini pour cette surface.",
  units: { kg: "kg", m2: "m²", m: "m", L: "L", pcs: "pc" },
  perArea: "par m²",
  perMetre: "par m de joint",
  perEach: "par surface",
  forArea: (area) => `pour ${area} m²`,
  forLength: (length) => `pour ${length} m de joint`,
  packageKind: { bag: "sac", roll: "rouleau", box: "boîte" },
  packages: (n, kind, size) => `${n} × ${kind} de ${size}`,
  waste: (percent) => `inclut ${percent} % pour les coupes`,
  basis: {
    manufacturer: "données du fabricant",
    geometry: "selon la surface",
    estimate: "estimation",
  },
  collect: "Préparer les achats",
  purchaseTitle: "Liste d'achats",
  purchaseNote:
    "Chaque bouton ouvre la recherche du magasin; le prix et le stock y sont affichés. Les quantités incluent la marge de coupe; les estimations seront remplacées par les données du fabricant.",
  hidePurchase: "Masquer la liste",
  findIn: (name) => `Trouver ${name} en magasin`,
  page: (n) => `p. ${n}`,
  area: (m2) => `${m2} m²`,
  wallsNote: "Surface des murs du plancher au plafond, moins les portes, fenêtres et passages.",
  categories: {
    cabinetry: "Armoires et comptoirs",
    plumbing: "Plomberie",
    electrical: "Électricité",
    lighting: "Éclairage",
    heating: "Chauffage",
    ventilation: "Ventilation",
    door: "Portes",
    window: "Fenêtres",
    hardware: "Quincaillerie et accessoires",
    trim: "Moulures",
  },
  houseList: "Liste d'achats de la maison",
  roomList: "Liste d'achats de la pièce",
  inventoryNote:
    "Compté à partir du modèle : chaque appareil, dispositif, porte et fenêtre, et les plinthes et armoires au mètre. Chaque bouton ouvre la recherche du magasin.",
  pieces: (n) => `${n} pcs`,
  metres: (n) => `${n} m`,
  itemSize: (dims) => `Taille dans le modèle : ${dims} cm`,
  beforeBuying: "Avant d'acheter",
  storesTitle: "Trouver en magasin",
  storesNote:
    "Chaque bouton ouvre la recherche du magasin; le prix et la disponibilité y sont affichés.",
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
