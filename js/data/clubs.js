/**
 * The bag.
 *
 * Ordered longest to shortest, which is both how a golfer thinks about clubs
 * and how they will be scanned on screen. `label` is what fits on a chip; `full`
 * is for anywhere there is room to be unambiguous.
 *
 * The putter is in the list for completeness but is never offered for
 * selection — a shot with lie `green` is a putt by definition, so the app
 * assigns it and saves the tap. That matters: the green is exactly where Matt
 * does not want to be handling the phone.
 */

export const CLUBS = [
  { id: 'driver', label: 'Dr', full: 'Driver' },
  { id: '3w', label: '3W', full: '3 wood' },
  { id: '3h', label: '3H', full: '3 hybrid' },
  { id: '4i', label: '4', full: '4 iron' },
  { id: '5i', label: '5', full: '5 iron' },
  { id: '6i', label: '6', full: '6 iron' },
  { id: '7i', label: '7', full: '7 iron' },
  { id: '8i', label: '8', full: '8 iron' },
  { id: '9i', label: '9', full: '9 iron' },
  { id: 'pw', label: 'PW', full: 'Pitching wedge' },
  { id: 'gw', label: 'GW', full: 'Gap wedge' },
  { id: 'sw', label: 'SW', full: 'Sand wedge' },
  { id: 'lw', label: 'LW', full: 'Lob wedge' },
  { id: 'putter', label: 'P', full: 'Putter' },
];

export const PUTTER = 'putter';

/** Clubs offered for selection — everything except the one the app assigns. */
export const SELECTABLE_CLUBS = CLUBS.filter((c) => c.id !== PUTTER);

const BY_ID = Object.fromEntries(CLUBS.map((c) => [c.id, c]));

export const clubById = (id) => BY_ID[id] ?? null;
export const clubLabel = (id) => BY_ID[id]?.label ?? '—';
export const clubFull = (id) => BY_ID[id]?.full ?? 'Unknown club';

/** Position in the bag, for sorting stats longest-to-shortest. */
export const clubOrder = (id) => {
  const i = CLUBS.findIndex((c) => c.id === id);
  return i < 0 ? CLUBS.length : i;
};
