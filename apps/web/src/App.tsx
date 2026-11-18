import { Suspense, lazy, useState } from "react";
import { LANGUAGES, type Language, useI18n } from "./i18n";
import { type RoomId, type SurfaceId, findRoom } from "./house/model";

import PlanView from "./house/PlanView";
import { supportsWebGL } from "./house/webgl";

import { SurfaceSheet } from "./ui/SurfaceSheet";

const HouseScene = lazy(() => import("./house/HouseScene"));
const has3D = supportsWebGL();

export function App() {
  const { t, language, setLanguage } = useI18n();
  const [room, setRoom] = useState<RoomId | null>(null);
  const [surface, setSurface] = useState<SurfaceId | null>(null);

  const selectRoom = (next: RoomId | null) => {
    setRoom(next);
    setSurface(null);
  };

  return (
    <div className="app">
      <Suspense fallback={<div className="scene-loading" aria-hidden="true" />}>
        <div className="scene">
          {has3D ? (
            <HouseScene room={room} surface={surface} onRoom={selectRoom} onSurface={setSurface} />
          ) : (
            <PlanView room={room} surface={surface} onRoom={selectRoom} onSurface={setSurface} />
          )}
        </div>
      </Suspense>

      <header className="topbar">
        <div className="brand">
          <strong>BuildWise</strong>
          <span>{t.tagline}</span>
        </div>
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
              onClick={() => setSurface(null)}
              aria-current={surface ? undefined : "page"}
            >
              {t.rooms[room]}
            </button>
          </>
        )}
        {room && surface && (
          <>
            <span aria-hidden="true">›</span>
            <span aria-current="page">{t.surfaces[surface]}</span>
          </>
        )}
      </nav>

      {!surface && (
        <p className="hint" role="status">
          {room ? t.chooseSurface : t.chooseRoom}
        </p>
      )}

      {room && !surface && (
        <div className="surface-picker" role="group" aria-label={t.chooseSurface}>
          {findRoom(room).surfaces.map((s) => (
            <button key={s} type="button" onClick={() => setSurface(s)}>
              {t.surfaces[s]}
            </button>
          ))}
        </div>
      )}

      {room && surface && (
        <SurfaceSheet room={room} surface={surface} onClose={() => setSurface(null)} />
      )}
    </div>
  );
}
