/**
 * Ground truth for the geodesy tests, generated with a Vincenty inverse
 * solution on the WGS-84 ellipsoid (see test/README.md). Vincenty is a
 * completely different algorithm from the local tangent-plane projection the
 * app uses, so agreement is a real check and not a restatement of the code.
 *
 * Coordinates sit at Veenker's latitude in Ames, IA, and span a putt through a
 * long par 5.
 */
export const GEO_FIXTURES = [
  { name: 'putt 3 m N', from: { lat: 42.035, lon: -93.645 }, to: { lat: 42.0350269949, lon: -93.645 }, meters: 2.998433 },
  { name: 'chip 25 m E', from: { lat: 42.035, lon: -93.645 }, to: { lat: 42.035, lon: -93.6446973366 }, meters: 25.06215 },
  { name: 'wedge 100 m NE', from: { lat: 42.035, lon: -93.645 }, to: { lat: 42.0356298816, lon: -93.6441525424 }, meters: 99.092021 },
  { name: 'drive 260 m SW', from: { lat: 42.035, lon: -93.645 }, to: { lat: 42.033335313, lon: -93.6472397094 }, meters: 261.888391 },
  { name: 'par5 500 m S', from: { lat: 42.035, lon: -93.645 }, to: { lat: 42.0305008458, lon: -93.645 }, meters: 499.738687 },
  { name: 'long 1200 m ENE', from: { lat: 42.035, lon: -93.645 }, to: { lat: 42.0376994925, lon: -93.6309564165 }, meters: 1200.894467 },
];
