import { expect, test } from "vitest";
import { inventory } from "./inventory";
import { itemPurchase } from "./knowledge";
import { ROOMS } from "./house/model";

const amounts = (rooms: Parameters<typeof inventory>[0]) =>
  Object.fromEntries(inventory(rooms).map((l) => [l.item.id, l.amount]));

test("the bathroom list counts each fixture, device and opening", () => {
  expect(amounts(["bathroom"])).toMatchObject({
    interior_door: 1,
    door_lever: 1,
    window: 1,
    window_sill: 1,
    baseboard: 7.78,
    bathroom_vanity: 1,
    vanity_top: 1,
    bathroom_faucet: 1,
    toilet: 1,
    shower_glass_panel: 1,
    shower_valve: 1,
    rain_shower_head: 1,
    linear_drain: 1,
    gfci_receptacle: 1,
    // one for the light and one for the fan (9.32.3.7.(6))
    light_switch: 2,
    ceiling_light: 1,
    baseboard_heater: 1,
    thermostat: 1,
    bathroom_exhaust_fan: 1,
    bathroom_mirror: 1,
    towel_bar: 1,
  });
});

test("kitchen cabinets and counter are measured in metres, pulls counted", () => {
  const kitchen = amounts(["kitchen"]);
  expect(kitchen.base_cabinet).toBe(4.45); // 2.54 + 1.91
  expect(kitchen.countertop).toBe(4.45);
  expect(kitchen.wall_cabinet).toBe(2.3); // 0.99 + 0.655 + 0.655
  expect(kitchen.cabinet_pull).toBe(7);
  expect(kitchen.gfci_receptacle).toBe(4);
  expect(kitchen.door_casing).toBe(1);
});

test("a door between two rooms is bought once for the whole house", () => {
  const house = amounts(ROOMS.map((r) => r.id));
  expect(house.interior_door).toBe(3);
  expect(house.entry_door).toBe(1);
  expect(house.window).toBe(6);
  expect(house.smoke_co_alarm).toBe(2);
});

test("the bathroom list includes the plumbing rough-in", () => {
  const bathroom = amounts(["bathroom"]);
  expect(bathroom.abs_pipe_3).toBe(4.22);
  expect(bathroom.pex_pipe_1_2).toBe(6.93);
  expect(bathroom.p_trap).toBe(1);
});

test("pipe and cable come in the chosen brand's coils and lengths", () => {
  const lines = Object.fromEntries(inventory(["bathroom"]).map((l) => [l.item.id, l]));
  const sold = (id: string, picks = {}) => {
    const line = lines[id];
    return line ? itemPurchase(id, line.amount, picks) : undefined;
  };
  // ABS 1-1/2 in: 10.53 m in 12 ft (3.66 m) lengths
  expect(sold("abs_pipe_1_1_2")).toMatchObject({
    packages: 3,
    package: { size: 3.66, kind: "length" },
    product: { id: "ipex-abs-cell-core" },
  });
  expect(sold("abs_pipe_3")?.packages).toBe(2);
  // PEX in 100 ft (30.48 m) coils
  expect(sold("pex_pipe_1_2")).toMatchObject({ packages: 1, product: { id: "sharkbite-pex-b" } });
  expect(sold("pex_pipe_3_4", { "pex-pipe": "uponor-aquapex-white" })?.search).toBe(
    "Uponor AquaPEX 3/4 100 ft",
  );
  expect(sold("baseboard")).toBeUndefined();
});

test("Uponor PEX-a swaps the crimp rings for ProPEX expansion rings", () => {
  const crimp = Object.fromEntries(inventory(["bathroom"]).map((l) => [l.item.id, l.amount]));
  expect(crimp.pex_crimp_ring).toBe(27);
  expect(crimp.pex_expansion_ring).toBeUndefined();
  const pexA = Object.fromEntries(
    inventory(["bathroom"], { "pex-pipe": "uponor-aquapex-white" }).map((l) => [
      l.item.id,
      l.amount,
    ]),
  );
  expect(pexA.pex_crimp_ring).toBeUndefined();
  expect(pexA.pex_expansion_ring).toBe(27);
});
