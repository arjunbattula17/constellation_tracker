import { describe, it, expect } from "vitest";
import { validateCoordinates as serverValidate } from "../src/sky/validate";

const { validateCoordinates: clientValidate } = require("../public/validate.js");

// public/validate.js and src/sky/validate.ts are two independent implementations
// of the same range check (no bundler to share one module between server and the
// unbundled frontend — see docs/decisions.md). This guards them from silently
// drifting apart.
const SAMPLE_INPUTS: Array<[number, number]> = [
  [51.4769, -0.0005],
  [90, 180],
  [-90, -180],
  [91, 0],
  [-91, 0],
  [0, 181],
  [0, -181],
  [NaN, 0],
  [0, NaN],
  [45, 45],
  [90, -180],
  [-90, 180],
];

describe("client/server validateCoordinates parity", () => {
  it.each(SAMPLE_INPUTS)("agrees for (%s, %s)", (lat, lon) => {
    expect(clientValidate(lat, lon)).toEqual(serverValidate(lat, lon));
  });
});
