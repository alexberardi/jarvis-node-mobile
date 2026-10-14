import { FAB_GAP, FAB_SIZE, fabListPaddingBottom, fabStyle } from '../../src/theme/fab';

describe('FAB list clearance', () => {
  it('pads the list past the FAB top edge, with a gap', () => {
    const fabTop = fabStyle.bottom + FAB_SIZE;
    expect(fabListPaddingBottom).toBe(fabTop + FAB_GAP);
    expect(fabListPaddingBottom).toBeGreaterThan(fabTop);
  });
});
