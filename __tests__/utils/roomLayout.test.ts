import { layoutRooms, placesFor } from '../../src/utils/roomLayout';

const room = (id: string, parent: string | null = null, icon: string | null = null) =>
  ({ id, name: id, parent_room_id: parent, icon, household_id: 'h', normalized_name: id, ha_area_id: null, device_count: 0, node_count: 0, created_at: '', updated_at: '' }) as any;

describe('layoutRooms', () => {
  it('makes floors of marked or parent rooms, and groups the rest last', () => {
    const rooms = [room('up', null, 'floor'), room('bed', 'up'), room('closet', 'bed'), room('kitchen'), room('down'), room('den', 'down'), room('empty', null, 'floor')];
    const groups = layoutRooms(rooms);
    expect(groups.map((g) => g.floor?.id ?? null)).toEqual(['up', 'down', 'empty', null]);
    expect(groups[0].rooms.map((r) => r.id)).toEqual(['bed', 'closet']);
    expect(groups[2].rooms).toEqual([]);
    expect(groups[3].rooms.map((r) => r.id)).toEqual(['kitchen']);
  });

  it('has a single unnamed group for a home without floors', () => {
    const groups = layoutRooms([room('a'), room('b')]);
    expect(groups).toHaveLength(1);
    expect(groups[0].floor).toBeNull();
  });

  it('never moves a room under itself or its own rooms', () => {
    const rooms = [room('up', null, 'floor'), room('bed', 'up'), room('closet', 'bed'), room('kitchen')];
    expect(placesFor(rooms[1], rooms).map((r) => r.id)).toEqual(['up', 'kitchen']);
  });
});
