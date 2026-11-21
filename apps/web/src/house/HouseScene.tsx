import { CameraControls, Html, useGLTF } from "@react-three/drei";
import { Canvas, type ThreeEvent, useFrame, useThree } from "@react-three/fiber";
import {
  type RefObject,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  DoubleSide,
  type Material,
  type Mesh,
  type Object3D,
  PMREMGenerator,
  Plane,
  type Scene,
  Vector3,
  type WebGLRenderer,
} from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
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

/** Height walls are cut down to when they stand between the camera and the room. */
const CUT_HEIGHT = 0.3;
const FULL_HEIGHT = 2.7;

interface WallPiece {
  orient: "h" | "v";
  coord: number;
  plane: Plane;
}

/** The wall line a Blender object belongs to, read from its name (wall__h_4500__…). */
function wallLine(node: Object3D | null): Pick<WallPiece, "orient" | "coord"> | null {
  for (let n = node; n; n = n.parent) {
    const match = /^wall__([hv])_(\d+)/.exec(n.name);
    if (match) return { orient: match[1] as "h" | "v", coord: Number(match[2]) / 1000 };
  }
  return null;
}

/**
 * Lowers the walls between the camera and the focus point and raises the rest,
 * easing towards the target so the cut follows the camera smoothly.
 */
function moveCuts(
  walls: WallPiece[],
  eye: Vector3,
  focus: [number, number],
  overview: boolean,
  delta: number,
) {
  const step = Math.min(1, delta * 6);
  for (const wall of walls) {
    const focusAt = wall.orient === "h" ? focus[1] : focus[0];
    const eyeAt = wall.orient === "h" ? eye.z : eye.x;
    const offset = wall.coord - focusAt;
    const toward = eyeAt - focusAt;
    const between =
      Math.abs(offset) > 0.3 && offset * toward > 0 && Math.abs(toward) > Math.abs(offset);
    // Over the whole house only the far outside walls stay up, so every room shows.
    const far = offset * toward < 0 && Math.abs(offset) > 0.3;
    const keep = overview ? far && isOutside(wall) : !between;
    const target = keep ? FULL_HEIGHT : CUT_HEIGHT;
    wall.plane.constant += (target - wall.plane.constant) * step;
  }
}

function isOutside({ orient, coord }: WallPiece): boolean {
  const [low, high] =
    orient === "h"
      ? [FOOTPRINT.z, FOOTPRINT.z + FOOTPRINT.depth]
      : [FOOTPRINT.x, FOOTPRINT.x + FOOTPRINT.width];
  return Math.abs(coord - low) < 1e-3 || Math.abs(coord - high) < 1e-3;
}

/** Soft image-based light made on the spot, so metal, glass and mirrors read. */
function light(gl: WebGLRenderer, scene: Scene): () => void {
  gl.localClippingEnabled = true;
  const pmrem = new PMREMGenerator(gl);
  const room = new RoomEnvironment();
  const texture = pmrem.fromScene(room, 0.04).texture;
  scene.environment = texture;
  scene.environmentIntensity = 0.45;
  return () => {
    scene.environment = null;
    texture.dispose();
    room.dispose();
    pmrem.dispose();
  };
}

/**
 * The Blender model, shown as a picture only; clicks are handled by the planes.
 * Walls on the camera's side of the room in view are cut down, as in a
 * dollhouse, and rise again as the camera moves round.
 */
function Model({ focus, overview }: { focus: [number, number]; overview: boolean }) {
  const { scene } = useGLTF(houseUrl);
  const { model, walls } = useMemo(() => {
    const clone = scene.clone(true);
    const pieces: WallPiece[] = [];
    clone.traverse((node) => {
      const mesh = node as Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const line = wallLine(mesh);
      if (!line) return;
      const plane = new Plane(new Vector3(0, -1, 0), FULL_HEIGHT);
      const own = (m: Material) => {
        const copy = m.clone();
        copy.clippingPlanes = [plane];
        copy.clipShadows = true;
        copy.side = DoubleSide;
        return copy;
      };
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(own) : own(mesh.material);
      pieces.push({ ...line, plane });
    });
    return { model: clone, walls: pieces };
  }, [scene]);

  useFrame(({ camera }, delta) => moveCuts(walls, camera.position, focus, overview, delta));

  return <primitive object={model} />;
}

function Environment() {
  const { gl, scene } = useThree();
  useEffect(() => light(gl, scene), [gl, scene]);
  return null;
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
          <Environment />
          <hemisphereLight args={["#ffffff", "#d9d2c5", 0.7]} />
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
            <Model
              focus={room ? centre(findRoom(room).rect) : centre(FOOTPRINT)}
              overview={!room}
            />
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
