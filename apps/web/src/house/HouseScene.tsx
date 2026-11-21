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
  Box3,
  Color,
  DoubleSide,
  type Material,
  type Mesh,
  type MeshStandardMaterial,
  type Object3D,
  PMREMGenerator,
  Plane,
  type Scene,
  Vector3,
  type WebGLRenderer,
} from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { useI18n } from "../i18n";
import type { Selection } from "../ui/ItemSheet";
import houseUrl from "./house.glb?url";
import {
  FOOTPRINT,
  OPENINGS,
  ROOMS,
  type Rect,
  type Room,
  type RoomId,
  type SurfaceId,
  area,
  centre,
  findRoom,
  roomOpenings,
  sideLine,
} from "./model";

export interface HouseSceneProps {
  room: RoomId | null;
  surface: SurfaceId | null;
  /** The model object of the selected item, highlighted in the scene. */
  selected: string | null;
  /** Lower every wall and see through the floors, to show the pipes. */
  xray?: boolean;
  onRoom: (room: RoomId) => void;
  onSurface: (surface: SurfaceId) => void;
  onItem: (selection: Selection) => void;
}

const ACCENT = "#2f7d6d";
/** Height of the floor's click plane: just above the floor, below rugs and mats. */
const FLOOR_HIT = 0.006;

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
  xray: boolean,
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
    // showing the pipes lowers every wall; over the whole house only the far
    // outside walls stay up, so every room shows
    const keep = xray ? false : overview ? far && isOutside(wall) : !between;
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

/** An object in the model that is sold as an item (data/items.yaml). */
interface ItemNode {
  node: Object3D;
  item: string;
  /** Rooms it belongs to: one for furniture, both sides for a door or window. */
  rooms: RoomId[];
  materials: MeshStandardMaterial[];
}

function itemRooms(data: Record<string, unknown>): RoomId[] {
  if (typeof data.room === "string") return [data.room as RoomId];
  const opening = OPENINGS.find((o) => o.id === data.opening);
  if (!opening) return [];
  return ROOMS.filter((r) => roomOpenings(r).includes(opening)).map((r) => r.id);
}

/** Width, depth (the larger first) and height of an object, in centimetres,
 * measured in its own frame so an open door still reads as its real size. */
function localSize(node: Object3D): [number, number, number] {
  const box = new Box3();
  node.traverse((n) => {
    const mesh = n as Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry.computeBoundingBox();
    const bounds = mesh.geometry.boundingBox?.clone();
    if (!bounds) return;
    if (mesh !== node) bounds.applyMatrix4(mesh.matrix);
    box.union(bounds);
  });
  const size = box.getSize(new Vector3());
  const [wide, deep] = [size.x, size.z].sort((p, q) => q - p);
  return [wide ?? 0, deep ?? 0, size.y].map((m) => Math.round(m * 100)) as [number, number, number];
}

/** In the pipe view, shows the pipes, makes the floors nearly clear and the
 * pipes glow in their colours, so runs under the floor read as clearly as
 * those in the walls. */
function seeThrough(
  floors: Material[],
  pipes: MeshStandardMaterial[],
  pipeNodes: Object3D[],
  on: boolean,
) {
  // pipes live inside walls and floors: show them only in the pipe view
  for (const node of pipeNodes) node.visible = on;
  for (const material of floors) {
    material.transparent = on;
    material.opacity = on ? 0.12 : 1;
    material.depthWrite = !on;
    material.needsUpdate = true;
  }
  const white = new Color("#ffffff");
  for (const material of pipes) {
    // lighten dark ABS toward white so it shows on a dark floor; keep the
    // red and blue of the water lines saturated
    const dark = material.color.getHSL({ h: 0, s: 0, l: 0 }).l < 0.25;
    material.emissive.copy(material.color).lerp(white, dark ? 0.45 : 0);
    material.emissiveIntensity = on ? 0.7 : 0;
  }
}

/** Tints the hovered and the selected object towards the accent colour; an
 * emissive glow would not show on white porcelain or paint. */
function paint(items: ItemNode[], hovered: string | null, selected: string | null) {
  const accent = new Color(ACCENT);
  for (const { node, materials } of items) {
    const level = node.name === selected ? 0.55 : node.name === hovered ? 0.3 : 0;
    for (const material of materials) {
      const base = (material.userData.base as Color | undefined) ?? material.color.clone();
      material.userData.base = base;
      material.color.copy(base).lerp(accent, level);
    }
  }
}

/** The item a pointer event hit, skipping walls cut away above the hit point. */
function hitItem(event: ThreeEvent<PointerEvent | MouseEvent>, byNode: Map<Object3D, ItemNode>) {
  for (let n: Object3D | null = event.object; n; n = n.parent) {
    // the raycaster also hits hidden objects, such as pipes outside the pipe view
    if (!n.visible) return { hidden: true as const };
    const cut = n.userData.cut as Plane | undefined;
    if (cut && event.point.y > cut.constant + 0.01) return { hidden: true as const };
  }
  for (let n: Object3D | null = event.object; n; n = n.parent) {
    const found = byNode.get(n);
    if (found) return { item: found };
  }
  return { wall: wallLine(event.object) };
}

/**
 * The Blender model. Every piece of furniture, fixture, door and window is an
 * object tagged with its item, so a click opens what it is and where to buy
 * it; a click on a room's wall opens its walls. Walls on the camera's side of
 * the room in view are cut down, as in a dollhouse, and rise again as the
 * camera moves round.
 */
function Model({
  room,
  focus,
  selected,
  xray,
  onRoom,
  onSurface,
  onItem,
}: {
  room: RoomId | null;
  focus: [number, number];
  selected: string | null;
  /** lower every wall and see through the floors, to show the pipes */
  xray: boolean;
  onRoom: (room: RoomId) => void;
  onSurface: (surface: SurfaceId) => void;
  onItem: (selection: Selection) => void;
}) {
  const { scene } = useGLTF(houseUrl);
  const [hovered, setHovered] = useState<string | null>(null);
  const { model, walls, items, floors, pipes, pipeNodes } = useMemo(() => {
    const clone = scene.clone(true);
    const pieces: WallPiece[] = [];
    const floorMaterials: Material[] = [];
    const pipeMaterials: MeshStandardMaterial[] = [];
    const pipeNodes: Object3D[] = [];
    const tagged = (n: Object3D | null): boolean =>
      !!n && (typeof n.userData.item === "string" || tagged(n.parent));
    clone.traverse((node) => {
      const mesh = node as Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      if (/^(floor|shower)__/.test(mesh.name)) {
        const own = (m: Material) => {
          const copy = m.clone();
          floorMaterials.push(copy);
          return copy;
        };
        mesh.material = Array.isArray(mesh.material) ? mesh.material.map(own) : own(mesh.material);
        return;
      }
      const line = wallLine(mesh);
      if (!line && !tagged(mesh)) return;
      const plane = line ? new Plane(new Vector3(0, -1, 0), FULL_HEIGHT) : null;
      // each object gets its own materials so it can be cut or tinted alone
      const own = (m: Material) => {
        const copy = m.clone();
        if (plane) {
          copy.clippingPlanes = [plane];
          copy.clipShadows = true;
          copy.side = DoubleSide;
        }
        return copy;
      };
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(own) : own(mesh.material);
      if (mesh.parent && /__plumbing_/.test(`${mesh.name} ${mesh.parent.name}`))
        pipeMaterials.push(...([mesh.material].flat() as MeshStandardMaterial[]));
      if (line && plane) {
        mesh.userData.cut = plane;
        pieces.push({ ...line, plane });
      }
    });
    const found: ItemNode[] = [];
    clone.traverse((node) => {
      if (/__plumbing_/.test(node.name) && typeof node.userData.item === "string")
        pipeNodes.push(node);
      if (typeof node.userData.item !== "string") return;
      const materials: MeshStandardMaterial[] = [];
      node.traverse((n) => {
        const mesh = n as Mesh;
        if (mesh.isMesh) materials.push(...([mesh.material].flat() as MeshStandardMaterial[]));
      });
      found.push({ node, item: node.userData.item, rooms: itemRooms(node.userData), materials });
    });
    return {
      model: clone,
      walls: pieces,
      items: found,
      floors: floorMaterials,
      pipes: pipeMaterials,
      pipeNodes,
    };
  }, [scene]);
  const byNode = useMemo(() => new Map(items.map((i) => [i.node, i])), [items]);

  useFrame(({ camera }, delta) => moveCuts(walls, camera.position, focus, !room, xray, delta));
  useEffect(() => paint(items, hovered, selected), [items, hovered, selected]);
  useEffect(() => seeThrough(floors, pipes, pipeNodes, xray), [floors, pipes, pipeNodes, xray]);
  useEffect(() => () => cursor(false), []);

  const roomWall = (line: ReturnType<typeof wallLine>, point: Vector3): boolean => {
    if (!room || !line) return false;
    const rect = findRoom(room).rect;
    return (["north", "south", "west", "east"] as const).some((side) => {
      const s = sideLine(rect, side);
      const along = s.orient === "h" ? point.x : point.z;
      return (
        s.orient === line.orient &&
        Math.abs(s.coord - line.coord) < 1e-3 &&
        along >= s.from &&
        along <= s.to
      );
    });
  };

  return (
    <primitive
      object={model}
      onPointerMove={(e: ThreeEvent<PointerEvent>) => {
        const hit = hitItem(e, byNode);
        if ("hidden" in hit) return;
        e.stopPropagation();
        const name = "item" in hit && hit.item ? hit.item.node.name : null;
        if (name !== hovered) setHovered(name);
        cursor(!!name || roomWall(hit.wall ?? null, e.point));
      }}
      onPointerOut={() => {
        setHovered(null);
        cursor(false);
      }}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        const hit = hitItem(e, byNode);
        if ("hidden" in hit) return;
        if ("item" in hit && hit.item) {
          e.stopPropagation();
          const { node, item, rooms } = hit.item;
          const here = room && rooms.includes(room) ? room : null;
          const target = here ?? rooms[0];
          if (!target) return;
          if (here) onItem({ item, object: node.name, room: here, size: localSize(node) });
          else onRoom(target);
        } else if (roomWall(hit.wall ?? null, e.point)) {
          e.stopPropagation();
          onSurface("walls");
        }
      }}
    />
  );
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
          <Clickable
            rect={room.rect}
            y={FLOOR_HIT}
            active={false}
            onSelect={() => onRoom(room.id)}
          />
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
        y={FLOOR_HIT}
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

export default function HouseScene({
  room,
  surface,
  selected,
  xray = false,
  onRoom,
  onSurface,
  onItem,
}: HouseSceneProps) {
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
              room={room}
              focus={room ? centre(findRoom(room).rect) : centre(FOOTPRINT)}
              selected={selected}
              xray={xray}
              onRoom={onRoom}
              onSurface={onSurface}
              onItem={onItem}
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
