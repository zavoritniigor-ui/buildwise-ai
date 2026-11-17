import { CameraControls, ContactShadows, Html } from "@react-three/drei";
import { Canvas, type ThreeEvent } from "@react-three/fiber";
import { type RefObject, createContext, useContext, useEffect, useRef, useState } from "react";
import { useI18n } from "../i18n";
import {
  FOOTPRINT,
  ROOMS,
  type Rect,
  type Room,
  type RoomId,
  type SurfaceId,
  WALL_HEIGHT,
  WALL_THICKNESS,
  area,
  centre,
  findRoom,
  wallSegments,
} from "./model";

export interface HouseSceneProps {
  room: RoomId | null;
  surface: SurfaceId | null;
  onRoom: (room: RoomId) => void;
  onSurface: (surface: SurfaceId) => void;
}

const LOW_WALL = 1.0;
const CUT_WALL = 0.2;
const SLAB = 0.08;
const ACCENT = "#2f7d6d";
const WALL = "#f7f4ee";

function pointer(over: boolean) {
  document.body.style.cursor = over ? "pointer" : "auto";
}

/** Hover and click wiring shared by every clickable mesh. */
function useClickable(onSelect: () => void) {
  const [hovered, setHovered] = useState(false);
  useEffect(() => () => pointer(false), []);
  return {
    hovered,
    handlers: {
      onPointerOver: (e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        setHovered(true);
        pointer(true);
      },
      onPointerOut: () => {
        setHovered(false);
        pointer(false);
      },
      onClick: (e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        onSelect();
      },
    },
  };
}

function Slab({
  rect,
  color,
  y = 0,
  active,
  onSelect,
}: {
  rect: Rect;
  color: string;
  y?: number;
  active: boolean;
  onSelect?: () => void;
}) {
  const { hovered, handlers } = useClickable(onSelect ?? (() => undefined));
  const [cx, cz] = centre(rect);
  return (
    <mesh position={[cx, y + SLAB / 2, cz]} receiveShadow {...(onSelect ? handlers : {})}>
      <boxGeometry args={[rect.width - 0.02, SLAB, rect.depth - 0.02]} />
      <meshStandardMaterial color={active || hovered ? ACCENT : color} roughness={0.9} />
    </mesh>
  );
}

type Segment = [number, number, number, number];

function Wall({
  segment,
  height,
  opacity = 1,
  active = false,
  onSelect,
}: {
  segment: Segment;
  height: number;
  opacity?: number;
  active?: boolean;
  onSelect?: () => void;
}) {
  const { hovered, handlers } = useClickable(onSelect ?? (() => undefined));
  const [x1, z1, x2, z2] = segment;
  const horizontal = z1 === z2;
  const length = horizontal ? Math.abs(x2 - x1) : Math.abs(z2 - z1);
  return (
    <mesh
      position={[(x1 + x2) / 2, SLAB + height / 2, (z1 + z2) / 2]}
      castShadow
      receiveShadow
      {...(onSelect ? handlers : {})}
    >
      <boxGeometry
        args={
          horizontal
            ? [length + WALL_THICKNESS, height, WALL_THICKNESS]
            : [WALL_THICKNESS, height, length]
        }
      />
      <meshStandardMaterial
        color={active || hovered ? ACCENT : WALL}
        transparent={opacity < 1}
        opacity={opacity}
        roughness={0.95}
      />
    </mesh>
  );
}

const onEdge = (segment: Segment, rect: Rect) => {
  const [x1, z1, x2, z2] = segment;
  const within = (v: number, lo: number, hi: number) => v >= lo - 1e-6 && v <= hi + 1e-6;
  const xs = [rect.x, rect.x + rect.width];
  const zs = [rect.z, rect.z + rect.depth];
  if (z1 === z2)
    return (
      zs.includes(z1) && within(x1, xs[0] ?? 0, xs[1] ?? 0) && within(x2, xs[0] ?? 0, xs[1] ?? 0)
    );
  return (
    xs.includes(x1) && within(z1, zs[0] ?? 0, zs[1] ?? 0) && within(z2, zs[0] ?? 0, zs[1] ?? 0)
  );
};

/** The south and east walls face the camera and are cut down so the room shows. */
const facesCamera = (segment: Segment, rect: Rect) => {
  const [x1, z1, x2, z2] = segment;
  if (z1 === z2) return Math.abs(z1 - (rect.z + rect.depth)) < 1e-6;
  return Math.abs(x1 - (rect.x + rect.width)) < 1e-6 && x1 === x2;
};

/**
 * Labels are portalled into a layer next to the canvas. Without an explicit
 * portal, the first label could mount before the canvas was attached and
 * never appear.
 */
const LabelLayer = createContext<RefObject<HTMLDivElement | null> | null>(null);

function RoomLabel({ room, onSelect }: { room: Room; onSelect: () => void }) {
  const { t, language } = useI18n();
  const layer = useContext(LabelLayer);
  const [cx, cz] = centre(room.rect);
  return (
    <Html
      position={[cx, 0.3, cz]}
      center
      zIndexRange={[10, 0]}
      portal={(layer ?? undefined) as RefObject<HTMLElement> | undefined}
    >
      <button type="button" className="room-label" onClick={onSelect}>
        <span>{t.rooms[room.id]}</span>
        <small>{t.area(area(room.rect).toLocaleString(language))}</small>
      </button>
    </Html>
  );
}

function Overview({ onRoom }: { onRoom: (room: RoomId) => void }) {
  return (
    <group>
      {ROOMS.map((room) => (
        <group key={room.id}>
          <Slab
            rect={room.rect}
            color={room.color}
            active={false}
            onSelect={() => onRoom(room.id)}
          />
          <RoomLabel room={room} onSelect={() => onRoom(room.id)} />
        </group>
      ))}
      {wallSegments().map((s) => (
        <Wall key={s.join(",")} segment={s} height={LOW_WALL} />
      ))}
    </group>
  );
}

function RoomView({
  room,
  surface,
  onSurface,
}: {
  room: Room;
  surface: SurfaceId | null;
  onSurface: (surface: SurfaceId) => void;
}) {
  const others = ROOMS.filter((r) => r.id !== room.id);
  return (
    <group>
      {others.map((r) => (
        <Slab key={r.id} rect={r.rect} color={r.color} active={false} />
      ))}
      <Slab
        rect={room.rect}
        color={room.color}
        active={surface === "floor"}
        onSelect={() => onSurface("floor")}
      />
      {room.shower && room.surfaces.includes("shower") && (
        <Slab
          rect={room.shower}
          color="#bcd6e0"
          y={0.01}
          active={surface === "shower"}
          onSelect={() => onSurface("shower")}
        />
      )}
      {wallSegments().map((s) => {
        const mine = onEdge(s, room.rect);
        if (!mine) return <Wall key={s.join(",")} segment={s} height={LOW_WALL} opacity={0.35} />;
        const cut = facesCamera(s, room.rect);
        return (
          <Wall
            key={s.join(",")}
            segment={s}
            height={cut ? CUT_WALL : WALL_HEIGHT}
            active={surface === "walls"}
            onSelect={() => onSurface("walls")}
          />
        );
      })}
    </group>
  );
}

function Camera({ room }: { room: RoomId | null }) {
  const controls = useRef<CameraControls>(null);
  useEffect(() => {
    const c = controls.current;
    if (!c) return;
    if (room) {
      const { rect } = findRoom(room);
      const [cx, cz] = centre(rect);
      const reach = Math.max(rect.width, rect.depth);
      void c.setLookAt(cx + reach * 1.4, reach * 1.9 + 2, cz + reach * 1.9, cx, 0.4, cz, true);
    } else {
      const [cx, cz] = centre(FOOTPRINT);
      void c.setLookAt(cx + 6, 11, cz + 10, cx, 0, cz, true);
    }
  }, [room]);
  return (
    <CameraControls
      ref={controls}
      makeDefault
      minDistance={3}
      maxDistance={25}
      maxPolarAngle={Math.PI / 2.3}
    />
  );
}

export default function HouseScene({ room, surface, onRoom, onSurface }: HouseSceneProps) {
  const [cx, cz] = centre(FOOTPRINT);
  const labels = useRef<HTMLDivElement>(null);
  return (
    <div className="scene-stack">
      <LabelLayer.Provider value={labels}>
        <Canvas shadows camera={{ position: [cx + 6, 11, cz + 10], fov: 40 }} dpr={[1, 2]}>
          <hemisphereLight args={["#ffffff", "#d9d2c5", 1.1]} />
          <directionalLight
            position={[cx - 6, 14, cz - 4]}
            intensity={1.6}
            castShadow
            shadow-mapSize={[2048, 2048]}
            shadow-camera-left={-10}
            shadow-camera-right={10}
            shadow-camera-top={10}
            shadow-camera-bottom={-10}
          />
          <Camera room={room} />
          {room ? (
            <RoomView room={findRoom(room)} surface={surface} onSurface={onSurface} />
          ) : (
            <Overview onRoom={onRoom} />
          )}
          <ContactShadows position={[cx, -0.01, cz]} scale={24} blur={2.5} opacity={0.35} far={4} />
        </Canvas>
      </LabelLayer.Provider>
      <div ref={labels} className="label-layer" />
    </div>
  );
}
