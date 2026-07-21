import test from "node:test";
import assert from "node:assert/strict";
import {
  parseCSV,
  normalizeRows,
  filterRows,
  aggregateByMonth,
  calculateSummary
} from "../js/data.js";

test("parses quoted CSV fields and escaped quotes", () => {
  const rows = parseCSV('Date,Vehicle,Note\n21/07/2026,"Car, family","He said ""full"""');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].vehicle, "Car, family");
  assert.equal(rows[0].note, 'He said "full"');
});

test("normalizes the requested sheet columns", () => {
  const raw = parseCSV("Date,Liters,Total Cost,Price/L,Vehicle,Fuel Type,Full Tank,Month,Year\n21/07/2026,20,41.40,2.07,car,RON95,yes,July,2026");
  const { rows, issues } = normalizeRows(raw, "DMY");
  assert.equal(issues.length, 0);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].date.getDate(), 21);
  assert.equal(rows[0].vehicle, "Car");
  assert.equal(rows[0].fuelType, "RON95");
  assert.equal(rows[0].fullTank, true);
});

test("calculates a weighted average price", () => {
  const rows = [
    { liters: 10, totalCost: 20, fullTank: true },
    { liters: 20, totalCost: 60, fullTank: false }
  ];
  const summary = calculateSummary(rows);
  assert.equal(summary.totalLiters, 30);
  assert.equal(summary.totalCost, 80);
  assert.equal(summary.averagePrice, 80 / 30);
  assert.equal(summary.fullTankRate, 0.5);
});

test("filters records and groups monthly totals", () => {
  const rows = [
    { date: new Date(2026, 0, 1), vehicle: "Car", fuelType: "RON95", liters: 10, totalCost: 20 },
    { date: new Date(2026, 0, 20), vehicle: "Motor", fuelType: "RON95", liters: 5, totalCost: 10 },
    { date: new Date(2026, 1, 2), vehicle: "Car", fuelType: "RON97", liters: 10, totalCost: 25 }
  ];
  const filtered = filterRows(rows, {
    from: new Date(2026, 0, 1),
    to: new Date(2026, 0, 31),
    vehicle: "all",
    fuel: "all"
  });
  const monthly = aggregateByMonth(filtered);
  assert.equal(filtered.length, 2);
  assert.equal(monthly.length, 1);
  assert.equal(monthly[0].cost, 30);
  assert.equal(monthly[0].liters, 15);
});
