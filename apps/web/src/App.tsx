import { StoreLinks } from "./StoreLinks";

const DEMO_PRODUCT = { manufacturer: "Schluter", name: "KERDI-BAND" };

export function App() {
  return (
    <main>
      <h1>BuildWise AI</h1>
      <p>Renovation planning with verified material compatibility.</p>
      <h2>Find in stores: {DEMO_PRODUCT.name}</h2>
      <StoreLinks product={DEMO_PRODUCT} />
    </main>
  );
}
