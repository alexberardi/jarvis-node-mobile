/**
 * Geometry of a screen's floating action button, shared by the FAB's style and
 * the list it floats over, so the list's bottom padding can't drift from the
 * FAB's real footprint.
 *
 * No safe-area inset: these FABs sit on bottom-tab screens, whose content ends
 * at the tab bar, and the tab bar already pads the bottom inset.
 */
export const FAB_SIZE = 56; // Paper's default (medium) FAB
export const FAB_OFFSET = 24; // FAB distance from the screen's bottom edge
export const FAB_GAP = 16; // space kept between the last item and the FAB

export const fabStyle = { position: 'absolute' as const, right: 16, bottom: FAB_OFFSET };

/** Bottom padding for a list under the FAB: scrolled to the end, nothing sits beneath it. */
export const fabListPaddingBottom = FAB_OFFSET + FAB_SIZE + FAB_GAP;
