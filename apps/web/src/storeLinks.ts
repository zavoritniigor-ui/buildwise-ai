/**
 * Deep links into retailers' own product search.
 *
 * BuildWise never fetches retailer pages itself. It only builds a URL that the
 * user opens in their own browser, where the retailer shows current stock and
 * price. Each URL pattern was checked by hand on the date in `verifiedOn`.
 */
export interface Retailer {
  id: string;
  name: string;
  searchUrl: (encodedQuery: string) => string;
  verifiedOn: string;
}

export const RETAILERS: readonly Retailer[] = [
  {
    id: "rona",
    name: "RONA",
    searchUrl: (q) => `https://www.rona.ca/en/search?q=${q}`,
    verifiedOn: "2026-11-15",
  },
  {
    id: "home-depot-ca",
    name: "Home Depot Canada",
    searchUrl: (q) => `https://www.homedepot.ca/search?q=${q}`,
    verifiedOn: "2026-11-15",
  },
  {
    id: "canac",
    name: "Canac",
    searchUrl: (q) => `https://www.canac.ca/en/search?q=${q}`,
    verifiedOn: "2026-11-15",
  },
  {
    id: "bmr",
    name: "BMR",
    searchUrl: (q) => `https://www.bmr.ca/en/search/result/#q=${q}`,
    verifiedOn: "2026-11-15",
  },
];

export interface SearchableProduct {
  manufacturer: string;
  name: string;
}

export interface StoreLink {
  retailerId: string;
  retailerName: string;
  url: string;
}

export function productQuery(product: SearchableProduct): string {
  const name = product.name.trim().replace(/\s+/g, " ");
  const manufacturer = product.manufacturer.trim();
  if (!name) throw new Error("Product name is required to search a store");
  const hasBrand = name.toLowerCase().includes(manufacturer.toLowerCase());
  return manufacturer && !hasBrand ? `${manufacturer} ${name}` : name;
}

export function storeLinks(
  product: SearchableProduct,
  retailers: readonly Retailer[] = RETAILERS,
): StoreLink[] {
  const query = encodeURIComponent(productQuery(product));
  return retailers.map((r) => ({
    retailerId: r.id,
    retailerName: r.name,
    url: r.searchUrl(query),
  }));
}
