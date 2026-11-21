import { useI18n } from "../i18n";
import { type Buildup, KNOWLEDGE, type ProductPicks, productsForSlot, slotsOf } from "../knowledge";

/** A choice of product for every slot the build-ups use. */
export function ProductPicker({
  buildups,
  picks,
  onPick,
}: {
  buildups: readonly Buildup[];
  picks: ProductPicks;
  onPick: (slot: string, product: string) => void;
}) {
  const { t, d } = useI18n();
  const slots = slotsOf(buildups);
  if (slots.length === 0) return null;
  return (
    <fieldset className="technology products">
      <legend>{t.productsTitle}</legend>
      {slots.map((slot) => {
        const offered = productsForSlot(slot);
        const name = d(KNOWLEDGE.slots[slot]?.name ?? slot);
        return (
          <label key={slot} className="calc-field">
            <span>{name}</span>
            <select
              aria-label={name}
              value={picks[slot] ?? offered[0]?.id}
              onChange={(e) => onPick(slot, e.target.value)}
            >
              {offered.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.brand} {p.name}
                </option>
              ))}
            </select>
          </label>
        );
      })}
    </fieldset>
  );
}
