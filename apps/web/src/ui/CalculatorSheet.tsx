import { useState } from "react";
import {
  type CalcSurface,
  type Estimate,
  type RoomSize,
  type RoomType,
  ROOM_TYPES,
  areas,
  chosenBuildups,
  electrical,
  options,
  plumbing,
  surfaceMaterials,
  ventilationRows,
} from "../calculator";
import { useI18n } from "../i18n";
import { type ProductPicks, findItem } from "../knowledge";
import { ItemLine } from "./ItemLine";
import { CodeStatus } from "./CodeStatus";
import { BUILDING_CODE, checkVentilation } from "../ventilation";
import { ProductPicker } from "./ProductPicker";
import type { PurchaseLine } from "../quantities";
import { StoreLinks } from "../StoreLinks";

const SURFACES: readonly CalcSurface[] = ["floor", "walls", "ceiling"];

/** Size a room by hand and see what it needs, without the 3D house. */
export function CalculatorSheet({
  picks,
  onPick,
  onClose,
}: {
  picks: ProductPicks;
  onPick: (slot: string, product: string) => void;
  onClose: () => void;
}) {
  const { t, d, language } = useI18n();
  const [type, setType] = useState<RoomType>("bathroom");
  const [size, setSize] = useState<RoomSize>({
    length: 3,
    width: 2.5,
    height: 2.4,
    doors: 1,
    windows: 1,
  });
  const [chosen, setChosen] = useState<Partial<Record<CalcSurface, string>>>({});
  const fmt = (n: number) => n.toLocaleString(language, { maximumFractionDigits: 2 });
  const a = areas(size);
  const wiring = electrical(type, size);
  const piping = plumbing(type, size, picks);
  const venting = ventilationRows(type, picks);

  const field = (key: keyof RoomSize, label: string, step: number) => (
    <label className="calc-field">
      <span>{label}</span>
      <input
        type="number"
        min={0}
        step={step}
        value={size[key]}
        onChange={(e) => {
          const value = Number(e.target.value);
          if (Number.isFinite(value) && value >= 0) setSize((s) => ({ ...s, [key]: value }));
        }}
      />
    </label>
  );

  return (
    <aside className="sheet calculator" aria-labelledby="sheet-title">
      <header>
        <div>
          <p className="sheet-kicker">BuildWise</p>
          <h1 id="sheet-title">{t.calculator}</h1>
        </div>
        <button type="button" className="icon" onClick={onClose} aria-label={t.close}>
          ×
        </button>
      </header>

      <label className="calc-field calc-wide">
        <span>{t.roomType}</span>
        <select
          value={type}
          onChange={(e) => {
            setType(e.target.value as RoomType);
            setChosen({});
          }}
        >
          {(Object.keys(ROOM_TYPES) as RoomType[]).map((k) => (
            <option key={k} value={k}>
              {t.roomTypes[k]}
            </option>
          ))}
        </select>
      </label>
      <div className="calc-grid">
        {field("length", t.lengthM, 0.1)}
        {field("width", t.widthM, 0.1)}
        {field("height", t.heightM, 0.1)}
        {field("doors", t.doorsN, 1)}
        {field("windows", t.windowsN, 1)}
      </div>
      <p className="sheet-area">{t.calcAreas(fmt(a.floor), fmt(a.walls), fmt(a.ceiling))}</p>
      <p className="muted small">{t.openingsNote}</p>

      {SURFACES.map((surface) => {
        const offered = options(type, surface);
        if (offered.length < 2) return null;
        return (
          <fieldset key={surface} className="technology">
            <legend>
              {t.surfaces[surface]} · {t.technology}
            </legend>
            {offered.map((option) => (
              <label key={option.id}>
                <input
                  type="radio"
                  name={`calc-${surface}`}
                  value={option.id}
                  checked={(chosen[surface] ?? offered[0]?.id) === option.id}
                  onChange={() => setChosen((c) => ({ ...c, [surface]: option.id }))}
                />
                <span>{d(option.title)}</span>
              </label>
            ))}
          </fieldset>
        );
      })}

      <ProductPicker
        buildups={chosenBuildups(type, chosen)}
        items={[...wiring, ...venting, ...piping].map((e) => e.item)}
        picks={picks}
        onPick={onPick}
      />

      <h2 className="list-section">{t.surfaceMaterials}</h2>
      <Materials lines={surfaceMaterials(type, size, chosen, picks)} />

      <h2 className="list-section">{t.trimTitle}</h2>
      <Estimates rows={[{ item: "baseboard", amount: a.baseboard }]} picks={picks} />

      <h2 className="list-section">{t.electricalTitle}</h2>
      <Estimates rows={wiring} picks={picks} />
      <p className="muted small">{t.electricalNote}</p>

      {type === "bathroom" && (
        <>
          <h2 className="list-section">{t.ventilationTitle}</h2>
          <Estimates rows={venting} picks={picks} />
          <CodeStatus
            breaches={checkVentilation(picks)}
            document={BUILDING_CODE}
            pages={[1072, 1074, 1075, 1077, 1078]}
            ok={t.ventCodeOk}
            broken={t.ventCodeBreaches}
          />
          <h2 className="list-section">{t.plumbingCalcTitle}</h2>
          <Estimates rows={piping} picks={picks} />
          <p className="muted small">{t.plumbingCalcNote}</p>
        </>
      )}
      <p className="muted small">{t.storesNote}</p>
    </aside>
  );
}

function Materials({ lines }: { lines: PurchaseLine[] }) {
  const { t, d, language } = useI18n();
  const fmt = (n: number) => n.toLocaleString(language, { maximumFractionDigits: 2 });
  return (
    <ul className="purchase-lines">
      {lines.map((line) => {
        const unit = t.units[line.quantity.unit];
        const name = d(line.name);
        const pack = line.quantity.package;
        return (
          <li key={`${line.quantity.search}|${line.quantity.unit}`} className="purchase-line">
            <span className="purchase-name">{name}</span>
            <span className="purchase-amount">
              {fmt(line.need.total)} {unit}
              {pack && line.need.packages !== undefined && (
                <>
                  {" · "}
                  {t.packages(
                    line.need.packages,
                    t.packageKind[pack.kind],
                    `${fmt(pack.size)} ${unit}`,
                  )}
                </>
              )}
              {line.quantity.basis === "estimate" && (
                <span className="basis basis-estimate"> {t.basis.estimate}</span>
              )}
            </span>
            <StoreLinks query={line.quantity.search} label={t.findIn(name)} />
          </li>
        );
      })}
    </ul>
  );
}

function Estimates({ rows, picks }: { rows: Estimate[]; picks: ProductPicks }) {
  return (
    <ul className="purchase-lines">
      {rows.map(({ item: id, amount }) => {
        const item = findItem(id);
        return item ? <ItemLine key={id} item={item} amount={amount} picks={picks} /> : null;
      })}
    </ul>
  );
}
