import test from "node:test";
import assert from "node:assert/strict";
import {
  parseDate,
  normalizeRows,
  previousPeriod,
  previousPeriodRange,
  hasComparableHistory,
  findNewVehicles,
  decomposeCostChange,
  aggregateByMonth,
  summarizeByVehicle,
  computeBurnRate,
  rollingAverage,
  findDataWarnings
} from "../js/data.js";

test("compares year to date with the same window last year", () => {
  const range = previousPeriodRange(new Date(2026, 0, 1), new Date(2026, 8, 29));
  assert.equal(range.from.toDateString(), new Date(2025, 0, 1).toDateString());
  assert.equal(range.to.toDateString(), new Date(2025, 8, 29).toDateString());
});

test("compares a three month window with the same months last year", () => {
  const range = previousPeriodRange(new Date(2026, 6, 1), new Date(2026, 8, 29));
  assert.equal(range.from.toDateString(), new Date(2025, 6, 1).toDateString());
  assert.equal(range.to.toDateString(), new Date(2025, 8, 29).toDateString());
});

test("clamps a leap day when shifting a year back", () => {
  const range = previousPeriodRange(new Date(2024, 1, 29), new Date(2024, 1, 29));
  assert.equal(range.from.toDateString(), new Date(2023, 1, 28).toDateString());
});

test("previousPeriod returns rows from the aligned year-earlier window", () => {
  const rows = [
    { date: new Date(2025, 7, 1), vehicle: "Car", fuelType: "RON95", liters: 10, totalCost: 20 },
    { date: new Date(2026, 7, 1), vehicle: "Car", fuelType: "RON95", liters: 20, totalCost: 40 }
  ];
  const previous = previousPeriod(rows, new Date(2026, 0, 1), new Date(2026, 8, 30));
  assert.equal(previous.length, 1);
  assert.equal(previous[0].liters, 10);
});

test("hasComparableHistory rejects windows that start before the data", () => {
  const rows = [{ date: new Date(2024, 6, 31) }, { date: new Date(2026, 8, 29) }];
  assert.equal(hasComparableHistory(rows, new Date(2026, 0, 1), new Date(2026, 8, 29)), true);
  assert.equal(hasComparableHistory(rows, new Date(2024, 6, 31), new Date(2026, 8, 29)), false);
});

test("findNewVehicles reports vehicles with no records in the previous period", () => {
  const current = [
    { vehicle: "Car" },
    { vehicle: "Motor" }
  ];
  const previous = [{ vehicle: "Motor" }];
  assert.deepEqual(findNewVehicles(current, previous), ["Car"]);
  assert.deepEqual(findNewVehicles(current, current), []);
});

test("splits a cost change into volume and price effects", () => {
  const previous = { totalCost: 100, totalLiters: 50, averagePrice: 2 };
  const current = { totalCost: 180, totalLiters: 100, averagePrice: 1.8 };
  const split = decomposeCostChange(current, previous);
  assert.equal(split.costDelta, 80);
  assert.ok(Math.abs(split.volumeEffect - 100) < 1e-9);
  assert.ok(Math.abs(split.priceEffect + 20) < 1e-9);
  assert.ok(Math.abs(split.volumeEffect + split.priceEffect - split.costDelta) < 1e-9);
});

test("aggregateByMonth fills months without records", () => {
  const rows = [
    { date: new Date(2026, 0, 5), vehicle: "Car", fuelType: "RON95", liters: 10, totalCost: 20, fullTank: true },
    { date: new Date(2026, 2, 10), vehicle: "Car", fuelType: "RON95", liters: 20, totalCost: 40, fullTank: true }
  ];
  const months = aggregateByMonth(rows, { from: new Date(2026, 0, 1), to: new Date(2026, 2, 31) });
  assert.equal(months.length, 3);
  assert.equal(months[0].hasData, true);
  assert.equal(months[1].hasData, false);
  assert.equal(months[1].visits, 0);
  assert.equal(months[0].perDay, 20 / 31);
});

test("aggregateByMonth fills gaps when no range is supplied", () => {
  const rows = [
    { date: new Date(2026, 0, 5), vehicle: "Car", fuelType: "RON95", liters: 10, totalCost: 20, fullTank: true },
    { date: new Date(2026, 2, 10), vehicle: "Car", fuelType: "RON95", liters: 20, totalCost: 40, fullTank: true }
  ];
  assert.equal(aggregateByMonth(rows).length, 3);
});

test("summarizes each vehicle separately", () => {
  const rows = [
    { date: new Date(2026, 0, 1), vehicle: "Car", liters: 20, totalCost: 40, fullTank: true },
    { date: new Date(2026, 0, 11), vehicle: "Car", liters: 10, totalCost: 20, fullTank: true },
    { date: new Date(2026, 0, 2), vehicle: "Motor", liters: 2, totalCost: 4, fullTank: true },
    { date: new Date(2026, 0, 12), vehicle: "Motor", liters: 2, totalCost: 4, fullTank: true }
  ];
  const vehicles = summarizeByVehicle(rows);
  assert.equal(vehicles.length, 2);
  assert.equal(vehicles[0].label, "Car");
  assert.equal(vehicles[0].cost, 60);
  assert.equal(vehicles[0].visits, 2);
  assert.equal(vehicles[0].litersPerDay, 3);
  assert.ok(Math.abs(vehicles[0].costShare + vehicles[1].costShare - 1) < 1e-9);
});

test("computes tank-to-tank burn from full tanks and partial fills", () => {
  const rows = [
    { date: new Date(2026, 0, 1), vehicle: "Car", liters: 10, totalCost: 20, fullTank: true },
    { date: new Date(2026, 0, 6), vehicle: "Car", liters: 5, totalCost: 10, fullTank: false },
    { date: new Date(2026, 0, 11), vehicle: "Car", liters: 10, totalCost: 20, fullTank: true }
  ];
  const burn = computeBurnRate(rows);
  assert.ok(Math.abs(burn.litersPerDay - 1.5) < 1e-9);
  assert.equal(burn.samples, 1);
});

test("computeBurnRate returns null without two full tanks", () => {
  const rows = [{ date: new Date(2026, 0, 1), vehicle: "Car", liters: 10, totalCost: 20, fullTank: true }];
  assert.equal(computeBurnRate(rows), null);
});

test("computeBurnRate keeps earlier samples when a long gap follows them", () => {
  const rows = [
    { date: new Date(2026, 0, 1), vehicle: "Car", liters: 10, totalCost: 20, fullTank: true },
    { date: new Date(2026, 0, 3), vehicle: "Car", liters: 10, totalCost: 20, fullTank: true },
    { date: new Date(2026, 2, 20), vehicle: "Car", liters: 40, totalCost: 80, fullTank: true },
    { date: new Date(2026, 2, 25), vehicle: "Car", liters: 20, totalCost: 40, fullTank: true }
  ];
  const burn = computeBurnRate(rows);
  assert.equal(burn.samples, 2);
  assert.ok(Math.abs(burn.litersPerDay - 30 / 7) < 1e-9);
});

test("rollingAverage ignores the leading gap and averages the window", () => {
  assert.deepEqual(rollingAverage([1, 2, 3, 4], 2), [null, 1.5, 2.5, 3.5]);
  assert.deepEqual(rollingAverage([1, 2, 3, 4], 3), [null, null, 2, 3]);
});

test("rollingAverage breaks across months without data", () => {
  assert.deepEqual(rollingAverage([1, null, 3, 5], 2), [null, null, null, 4]);
});

test("flags duplicate fills on the same day and vehicle", () => {
  const rows = [
    { date: new Date(2026, 0, 1), vehicle: "Car", liters: 20, totalCost: 40, fullTank: true },
    { date: new Date(2026, 0, 1), vehicle: "Car", liters: 5, totalCost: 10, fullTank: false }
  ];
  const warnings = findDataWarnings(rows);
  assert.equal(warnings.filter(warning => warning.type === "duplicate").length, 1);
});

test("flags unusually small fills for a vehicle", () => {
  const rows = Array.from({ length: 12 }, (_, index) => ({
    date: new Date(2026, 0, index + 1),
    vehicle: "Car",
    liters: 24 + index * 0.1,
    totalCost: 48,
    fullTank: true
  }));
  rows.push({ date: new Date(2026, 1, 1), vehicle: "Car", liters: 4, totalCost: 8, fullTank: false });
  const warnings = findDataWarnings(rows);
  assert.equal(warnings.filter(warning => warning.type === "outlier").length, 1);
});

test("parses a date that carries a time component", () => {
  assert.equal(parseDate("31/12/2021 00:00:00", "DMY").toDateString(), new Date(2021, 11, 31).toDateString());
});

test("builds a record id from the local calendar date", () => {
  const { rows } = normalizeRows([{ date: "31/12/2021", liters: "2.645", totalcost: "5.42", vehicle: "Motor" }], "DMY");
  assert.equal(rows[0].id, "2021-12-31-0");
});

test("normalizeRows reports whether full tank data exists", () => {
  const withoutColumn = normalizeRows([{ date: "31/12/2021", liters: "2", totalcost: "4", vehicle: "Motor" }], "DMY");
  assert.equal(withoutColumn.hasFullTankData, false);
  assert.equal(withoutColumn.rows[0].fullTank, false);

  const withColumn = normalizeRows(
    [{ date: "31/12/2021", liters: "2", totalcost: "4", vehicle: "Motor", fulltank: "Yes" }],
    "DMY"
  );
  assert.equal(withColumn.hasFullTankData, true);
  assert.equal(withColumn.rows[0].fullTank, true);
});
