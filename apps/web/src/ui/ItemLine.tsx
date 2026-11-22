import { useI18n } from "../i18n";
import { type Item, type ProductPicks, citationUrl, itemPurchase } from "../knowledge";
import { StoreLinks } from "../StoreLinks";

/** One counted item of a shopping list; with the chosen brand's packages when
 * the item is supplied by a brand (pipe in coils or lengths, cable in coils). */
export function ItemLine({
  item,
  amount,
  picks,
  category = false,
}: {
  item: Item;
  amount: number;
  picks: ProductPicks;
  /** show the item's category after the amount */
  category?: boolean;
}) {
  const { t, d, language } = useI18n();
  const fmt = (n: number) => n.toLocaleString(language, { maximumFractionDigits: 2 });
  const name = d(item.name);
  const sold = itemPurchase(item.id, amount, picks);
  const unit = item.measure === "length" ? t.units.m : t.units.pcs;
  return (
    <li className="purchase-line">
      <span className="purchase-name">{name}</span>
      <span className="purchase-amount">
        {item.measure === "length" ? t.metres(fmt(amount)) : t.pieces(fmt(amount))}
        {sold && (
          <>
            {" · "}
            {sold.product.brand} {sold.product.name}
            {" · "}
            {t.packages(
              sold.packages,
              t.packageKind[sold.package.kind],
              `${fmt(sold.package.size)} ${unit}`,
            )}{" "}
            <a
              className="citation"
              href={citationUrl(sold.product.source)}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t.page(sold.product.source.page)}
            </a>
          </>
        )}
        {category && <span className="muted"> · {t.categories[item.category]}</span>}
      </span>
      <StoreLinks query={sold?.search ?? item.search} label={t.findIn(name)} />
    </li>
  );
}
