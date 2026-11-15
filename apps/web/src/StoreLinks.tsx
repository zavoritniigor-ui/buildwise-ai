import { type SearchableProduct, storeLinks } from "./storeLinks";

export function StoreLinks({ product }: { product: SearchableProduct }) {
  return (
    <ul aria-label={`Find ${product.name} in stores`}>
      {storeLinks(product).map((link) => (
        <li key={link.retailerId}>
          <a href={link.url} target="_blank" rel="noopener noreferrer">
            {link.retailerName}
          </a>
        </li>
      ))}
    </ul>
  );
}
