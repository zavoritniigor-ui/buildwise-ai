import { CameraControls, Html, useGLTF } from "@react-three/drei";
import { Canvas, type ThreeEvent } from "@react-three/fiber";
import {
  type RefObject,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Mesh } from "three";
import { useI18n } from "../i18n";
import houseUrl from "./house.glb?url";
import {
  FOOTPRINT,
  ROOMS,
  type Rect,
  type Room,
  type RoomId,
  type SurfaceId,
  area,
  centre,
  findRoom,
} from "./model";

export interface HouseSceneProps {
  room: RoomId | null;
  surface: SurfaceId | null;
  onRoom: (room: RoomId) => void;
  onSurface: (surface: SurfaceId) => void;
}

const ACCENT = "#2f7d6d";

useGLTF.preload(houseUrl);

function cursor(over: boolean) {
  document.body.style.cursor = over ? "pointer" : "auto";
}

/**
 * Labels are portalled into a layer next to the canvas so the first one does
 * not mount before the canvas is attached.
 */
const LabelLayer = createContext<RefObject<HTMLDivElement | null> | null>(null);

/** The Blender model, shown as a picture only; clicks are handled by the planes. */
function Model() {
  const { scene } = useGLTF(houseUrl);
  const model = useMemo(() => {
    const clone = scene.clone(true);
    clone.traverse((node) => {
      const mesh = node as Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
    return clone;
  }, [scene]);
  return <primitive object={model} />;
}

/**
 * An invisible plane over a floor rect that catches clicks and, when active or
 * hovered, tints the surface. The 3D model stays untouched.
 */
function Clickable({
  rect,
  y,
  active,
  onSelect,
}: {
  rect: Rect;
  y: number;
  active: boolean;
  onSelect: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [cx, cz] = centre(rect);
  useEffect(() => () => cursor(false), []);
  return (
    <mesh
      position={[cx, y, cz]}
      rotation={[-Math.PI / 2, 0, 0]}
      onPointerOver={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        setHovered(true);
        cursor(true);
      }}
      onPointerOut={() => {
        setHovered(false);
        cursor(false);
      }}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        onSelect();
      }}
    >
      <planeGeometry args={[rect.width, rect.depth]} />
      <meshBasicMaterial
        color={ACCENT}
        transparent
        opacity={active || hovered ? 0.28 : 0}
        depthWrite={false}
      />
    </mesh>
  );
}

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
          <Clickable rect={room.rect} y={0.02} active={false} onSelect={() => onRoom(room.id)} />
          <RoomLabel room={room} onSelect={() => onRoom(room.id)} />
        </group>
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
  return (
    <group>
      <Clickable
        rect={room.rect}
        y={0.02}
        active={surface === "floor"}
        onSelect={() => onSurface("floor")}
      />
      {room.shower && room.surfaces.includes("shower") && (
        <Clickable
          rect={room.shower}
          y={0.05}
          active={surface === "shower"}
          onSelect={() => onSurface("shower")}
        />
      )}
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
            intensity={1.7}
            castShadow
            shadow-mapSize={[2048, 2048]}
            shadow-camera-left={-12}
            shadow-camera-right={12}
            shadow-camera-top={12}
            shadow-camera-bottom={-12}
          />
          <Camera room={room} />
          <group>
            <Model />
            {room ? (
              <RoomView room={findRoom(room)} surface={surface} onSurface={onSurface} />
            ) : (
              <Overview onRoom={onRoom} />
            )}
          </group>
        </Canvas>
      </LabelLayer.Provider>
      <div ref={labels} className="label-layer" />
    </div>
  );
}
