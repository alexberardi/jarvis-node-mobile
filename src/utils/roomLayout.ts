import type { Room } from '../types/SmartHome';

/** A room is marked a floor with this icon (no server change: rooms already carry an icon). */
export const FLOOR_ICON = 'floor';

export interface FloorGroup {
  /** null: rooms that aren't on any floor. */
  floor: Room | null;
  rooms: Room[];
}

/**
 * Rooms as floors: a top-level room marked a floor, or holding other rooms, is a floor, and
 * every room under it (at any depth) is on it. Other top-level rooms form one unnamed group,
 * listed last. Rooms stay in the server's order.
 */
export function layoutRooms(rooms: Room[]): FloorGroup[] {
  const byId = new Map(rooms.map((r) => [r.id, r]));
  const topOf = (r: Room): Room => {
    let cur = r;
    const seen = new Set<string>();
    while (cur.parent_room_id && byId.has(cur.parent_room_id) && !seen.has(cur.id)) {
      seen.add(cur.id);
      cur = byId.get(cur.parent_room_id)!;
    }
    return cur;
  };
  const tops = rooms.filter((r) => !r.parent_room_id || !byId.has(r.parent_room_id));
  const hasChildren = new Set(rooms.filter((r) => r.parent_room_id).map((r) => r.parent_room_id));
  const isFloor = (r: Room) => r.icon === FLOOR_ICON || hasChildren.has(r.id);
  const floors: FloorGroup[] = tops
    .filter(isFloor)
    .map((f) => ({ floor: f, rooms: rooms.filter((r) => r.id !== f.id && topOf(r).id === f.id) }));
  const loose = tops.filter((r) => !isFloor(r));
  return loose.length > 0 ? [...floors, { floor: null, rooms: loose }] : floors;
}

/** Rooms a room may be moved under: floors and rooms other than itself and its descendants. */
export function placesFor(room: Room, rooms: Room[]): Room[] {
  const banned = new Set([room.id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const r of rooms) {
      if (r.parent_room_id && banned.has(r.parent_room_id) && !banned.has(r.id)) {
        banned.add(r.id);
        grew = true;
      }
    }
  }
  return rooms.filter((r) => !banned.has(r.id));
}

export type Rect = { x: number; y: number; width: number; height: number };

/** The key of the drop target under a point (window coordinates), or null. */
export function hitTest(rects: Record<string, Rect>, x: number, y: number): string | null {
  for (const [key, r] of Object.entries(rects)) {
    if (x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height) return key;
  }
  return null;
}
