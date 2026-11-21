import { expect, test } from "vitest";
import { inventory } from "./inventory";
import { ROOMS } from "./house/model";

const amounts = (rooms: Parameters<typeof inventory>[0]) =>
  Object.fromEntries(inventory(rooms).map((l) => [l.item.id, l.amount]));

test("the bathroom list counts each fixture, device and opening", () => {
  expect(amounts(["bathroom"])).toEqual({
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
    light_switch: 1,
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
