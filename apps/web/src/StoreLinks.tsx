import { storeLinks } from "./storeLinks";

/** Buttons that open each retailer's own search for a query, in a new tab. */
export function StoreLinks({ query, label }: { query: string; label: string }) {
  return (
    <ul className="store-links" aria-label={label}>
      {storeLinks({ manufacturer: "", name: query }).map((link) => (
        <li key={link.retailerId}>
          <a href={link.url} target="_blank" rel="noopener noreferrer">
            {link.retailerName}
          </a>
        </li>
      ))}
    </ul>
  );
}
