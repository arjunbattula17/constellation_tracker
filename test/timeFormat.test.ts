import { describe, it, expect } from "vitest";

const { formatRelativeTime } = require("../public/timeFormat.js");

describe("formatRelativeTime", () => {
  it("shows 'just now' for under a second", () => {
    expect(formatRelativeTime(0)).toBe("just now");
    expect(formatRelativeTime(999)).toBe("just now");
  });

  it("uses singular phrasing for exactly 1 second", () => {
    expect(formatRelativeTime(1000)).toBe("1 second ago");
  });

  it("uses plural phrasing for 2-59 seconds", () => {
    expect(formatRelativeTime(2000)).toBe("2 seconds ago");
    expect(formatRelativeTime(59000)).toBe("59 seconds ago");
  });

  it("switches to minutes at 60 seconds", () => {
    expect(formatRelativeTime(60000)).toBe("1 minute ago");
    expect(formatRelativeTime(125000)).toBe("2 minutes ago");
  });
});
