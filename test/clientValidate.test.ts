import { describe, it, expect } from "vitest";

const { validateCoordinates } = require("../public/validate.js");

describe("validateCoordinates (client)", () => {
  it("accepts valid coordinates", () => {
    expect(validateCoordinates(51.4769, -0.0005)).toEqual({ valid: true });
  });

  it("accepts boundary values", () => {
    expect(validateCoordinates(90, 180)).toEqual({ valid: true });
    expect(validateCoordinates(-90, -180)).toEqual({ valid: true });
  });

  it("rejects latitude out of range", () => {
    const result = validateCoordinates(91, 0);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/latitude/);
  });

  it("rejects longitude out of range", () => {
    const result = validateCoordinates(0, 181);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/longitude/);
  });

  it("rejects NaN input", () => {
    const result = validateCoordinates(NaN, 0);
    expect(result.valid).toBe(false);
  });
});
