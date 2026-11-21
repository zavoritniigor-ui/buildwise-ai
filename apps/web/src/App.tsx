import { Suspense, lazy, useState } from "react";
import { LANGUAGES, type Language, useI18n } from "./i18n";
import { ROOMS, type RoomId, type SurfaceId, findRoom } from "./house/model";

import PlanView from "./house/PlanView";
import { supportsWebGL } from "./house/webgl";

import { CalculatorSheet } from "./ui/CalculatorSheet";
import { InventorySheet } from "./ui/InventorySheet";
import { ItemSheet, type Selection } from "./ui/ItemSheet";
import { SurfaceSheet } from "./ui/SurfaceSheet";
import { findItem } from "./knowledge";

const HouseScene = lazy(() => import("./house/HouseScene"));
const has3D = supportsWebGL();

export function App() {
  const { t, d, language, setLanguage } = useI18n();
  const [room, setRoom] = useState<RoomId | null>(null);
  const [surface, setSurface] = useState<SurfaceId | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [listing, setListing] = useState(false);
  const [xray, setXray] = useState(false);
  const [calculating, setCalculating] = useState(false);
  /** the product picked per slot, shared by every surface and list */
  const [picks, setPicks] = useState<Record<string, string>>({});
  const pick = (slot: string, product: string) => setPicks((p) => ({ ...p, [slot]: product }));
  /** the technology picked per "room.surface" */
  const [choices, setChoices] = useState<Record<string, string>>({});

  const selectRoom = (next: RoomId | null) => {
    setRoom(next);
    setSurface(null);
    setSelection(null);
    setListing(false);
  };
  const selectSurface = (next: SurfaceId | null) => {
    setSurface(next);
    setSelection(null);
    setListing(false);
  };
  const selectItem = (next: Selection) => {
    setRoom(next.room);
    setSurface(null);
    setSelection(next);
    setListing(false);
  };
  const itemName = selection && findItem(selection.item)?.name;
  const leaf = surface ? t.surfaces[surface] : itemName ? d(itemName) : null;

  return (
    <div className="app">
      <Suspense fallback={<div className="scene-loading" aria-hidden="true" />}>
        <div className="scene">
          {has3D ? (
            <HouseScene
              room={room}
              surface={surface}
              selected={selection?.object ?? null}
              xray={xray}
              onRoom={selectRoom}
              onSurface={selectSurface}
              onItem={selectItem}
            />
          ) : (
            <PlanView
              room={room}
              surface={surface}
              selected={null}
              onRoom={selectRoom}
              onSurface={selectSurface}
              onItem={selectItem}
            />
          )}
        </div>
      </Suspense>

      <header className="topbar">
        <div className="brand">
          <strong>BuildWise</strong>
          <span>{t.tagline}</span>
        </div>
        <div className="topbar-actions">
          <button
            type="button"
            className="calc-button"
            aria-expanded={calculating}
            onClick={() => setCalculating((open) => !open)}
          >
            {t.calculator}
          </button>
          <label className="language">
            <span className="visually-hidden">{t.language}</span>
            <select value={language} onChange={(e) => setLanguage(e.target.value as Language)}>
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      <nav className="crumbs" aria-label={t.house}>
        <button
          type="button"
          onClick={() => selectRoom(null)}
          aria-current={room ? undefined : "page"}
        >
          {t.house}
        </button>
        {room && (
          <>
            <span aria-hidden="true">›</span>
            <button
              type="button"
              onClick={() => selectSurface(null)}
              aria-current={leaf ? undefined : "page"}
            >
              {t.rooms[room]}
            </button>
          </>
        )}
        {room && leaf && (
          <>
            <span aria-hidden="true">›</span>
            <span aria-current="page">{leaf}</span>
          </>
        )}
      </nav>

      {!leaf && (
        <p className="hint" role="status">
          {room ? t.chooseSurface : t.chooseRoom}
        </p>
      )}

      {!leaf && (
        <div className="surface-picker" role="group" aria-label={room ? t.chooseSurface : t.house}>
          {room &&
            findRoom(room).surfaces.map((s) => (
              <button key={s} type="button" onClick={() => selectSurface(s)}>
                {t.surfaces[s]}
              </button>
            ))}
          {has3D && (
            <button
              type="button"
              className="list-button"
              aria-pressed={xray}
              onClick={() => setXray((on) => !on)}
            >
              {t.showPipes}
            </button>
          )}
          <button
            type="button"
            className="list-button"
            aria-expanded={listing}
            onClick={() => setListing((open) => !open)}
          >
            {room ? t.roomList : t.houseList}
          </button>
        </div>
      )}

      {listing && !leaf && !calculating && (
        <InventorySheet
          rooms={room ? [room] : ROOMS.map((r) => r.id)}
          title={room ? t.roomList : t.houseList}
          kicker={room ? t.rooms[room] : t.house}
          choices={choices}
          picks={picks}
          onClose={() => setListing(false)}
        />
      )}

      {room && surface && !calculating && (
        <SurfaceSheet
          room={room}
          surface={surface}
          chosen={choices[`${room}.${surface}`]}
          onChoose={(id) => setChoices((c) => ({ ...c, [`${room}.${surface}`]: id }))}
          picks={picks}
          onPick={pick}
          onClose={() => selectSurface(null)}
        />
      )}

      {selection && !calculating && (
        <ItemSheet selection={selection} onClose={() => setSelection(null)} />
      )}

      {calculating && (
        <CalculatorSheet picks={picks} onPick={pick} onClose={() => setCalculating(false)} />
      )}
    </div>
  );
}
