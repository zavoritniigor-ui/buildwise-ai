import { describe, expect, test } from "vitest";
import { productQuery, RETAILERS, storeLinks } from "./storeLinks";

const kerdiBand = { manufacturer: "Schluter", name: "KERDI-BAND 5 in x 16 ft" };

describe("productQuery", () => {
  test("puts the manufacturer before the product name", () => {
    expect(productQuery(kerdiBand)).toBe("Schluter KERDI-BAND 5 in x 16 ft");
  });

  test("does not repeat a manufacturer already in the name", () => {
    expect(productQuery({ manufacturer: "MAPEI", name: "Mapei Ultraflex 2" })).toBe(
      "Mapei Ultraflex 2",
    );
  });

  test("collapses extra whitespace", () => {
    expect(productQuery({ manufacturer: " Schluter ", name: "  KERDI   200 " })).toBe(
      "Schluter KERDI 200",
    );
  });

  test("rejects a product without a name", () => {
    expect(() => productQuery({ manufacturer: "Schluter", name: "  " })).toThrow();
  });
});

describe("storeLinks", () => {
  test("returns one https link per configured retailer", () => {
    const links = storeLinks(kerdiBand);
    expect(links.map((l) => l.retailerId)).toEqual(RETAILERS.map((r) => r.id));
    for (const link of links) expect(new URL(link.url).protocol).toBe("https:");
  });

  test("builds the known search URL for each retailer", () => {
    const urls = Object.fromEntries(
      storeLinks({ manufacturer: "Schluter", name: "KERDI band" }).map((l) => [
        l.retailerId,
        l.url,
      ]),
    );
    expect(urls).toEqual({
      rona: "https://www.rona.ca/en/search?q=Schluter%20KERDI%20band",
      "home-depot-ca": "https://www.homedepot.ca/search?q=Schluter%20KERDI%20band",
      canac: "https://www.canac.ca/en/search?q=Schluter%20KERDI%20band",
      bmr: "https://www.bmr.ca/en/search/result/#q=Schluter%20KERDI%20band",
    });
  });

  test("encodes characters that would break the URL", () => {
    const [link] = storeLinks({ manufacturer: "ACME", name: 'Tile 12" & trim #4 ?x=1' });
    expect(link?.url).not.toMatch(/[" ]/);
    expect(link?.url).toContain("%26");
    expect(link?.url).toContain("%23");
    expect(link?.url).toContain("%3F");
  });

  test("links only to the retailers' own domains", () => {
    const hosts = storeLinks(kerdiBand).map((l) => new URL(l.url).hostname);
    expect(hosts).toEqual(["www.rona.ca", "www.homedepot.ca", "www.canac.ca", "www.bmr.ca"]);
  });
});
