import { describe, it, expect } from "vitest";
import { dayKey, dayLabel, isDifferentDay } from "./day";

// A fixed local-midnight reference: 2025-04-03 00:00:00 local time.
// We construct it via Date to respect the test machine's local TZ.
function localMidnight(year: number, month: number, day: number): number {
  return new Date(year, month - 1, day, 0, 0, 0, 0).getTime();
}

describe("dayKey", () => {
  it("returns YYYY-MM-DD for a known local midnight", () => {
    const ts = localMidnight(2025, 4, 3);
    expect(dayKey(ts)).toBe("2025-04-03");
  });

  it("returns YYYY-MM-DD for end of same day (23:59:59.999)", () => {
    const ts = localMidnight(2025, 4, 3) + 86_399_999;
    expect(dayKey(ts)).toBe("2025-04-03");
  });

  it("rolls over to next day at midnight", () => {
    const ts = localMidnight(2025, 4, 4);
    expect(dayKey(ts)).toBe("2025-04-04");
  });

  it("pads month and day with leading zeros", () => {
    const ts = localMidnight(2025, 1, 5);
    expect(dayKey(ts)).toBe("2025-01-05");
  });
});

describe("isDifferentDay", () => {
  it("returns false for two timestamps on the same day", () => {
    const a = localMidnight(2025, 4, 3) + 1000;
    const b = localMidnight(2025, 4, 3) + 50_000;
    expect(isDifferentDay(a, b)).toBe(false);
  });

  it("returns true for timestamps on adjacent days", () => {
    const a = localMidnight(2025, 4, 3) + 86_399_000;
    const b = localMidnight(2025, 4, 4) + 1000;
    expect(isDifferentDay(a, b)).toBe(true);
  });

  it("returns false for the same timestamp", () => {
    const ts = localMidnight(2025, 6, 15) + 12345;
    expect(isDifferentDay(ts, ts)).toBe(false);
  });
});

describe("dayLabel", () => {
  it("returns 'Today' for today's key", () => {
    const nowMs = localMidnight(2025, 4, 3) + 3_600_000;
    const key = dayKey(nowMs);
    expect(dayLabel(key, nowMs)).toBe("Today");
  });

  it("returns 'Yesterday' for yesterday's key", () => {
    const nowMs = localMidnight(2025, 4, 3) + 3_600_000;
    const yesterdayKey = dayKey(nowMs - 86_400_000);
    expect(dayLabel(yesterdayKey, nowMs)).toBe("Yesterday");
  });

  it("returns formatted date string for older dates", () => {
    const nowMs = localMidnight(2025, 4, 3) + 3_600_000;
    const oldKey = "2025-01-15";
    const result = dayLabel(oldKey, nowMs);
    // Should contain the year and not be Today/Yesterday.
    expect(result).not.toBe("Today");
    expect(result).not.toBe("Yesterday");
    expect(result).toContain("2025");
  });
});
