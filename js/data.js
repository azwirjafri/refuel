const HEADER_ALIASES = {
  date: ["date", "refueldate", "dateofrefuel"],
  liters: ["liters", "litres", "liter", "litre"],
  totalCost: ["totalcost", "cost", "totalamount", "amountpaid"],
  pricePerLiter: ["pricel", "priceperliter", "priceperlitre", "price/l", "price/liter"],
  vehicle: ["vehicle", "vehicletype"],
  fuelType: ["fueltype", "fuel"],
  fullTank: ["fulltank", "isfulltank"],
  month: ["month"],
  year: ["year"]
};

function normalizeHeader(value) {
  return String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9/]/g, "");
}

export function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"' && quoted && next === '"') {
      field += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(field);
      field = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(field);
      field = "";
      if (row.some(cell => cell.trim() !== "")) rows.push(row);
      row = [];
    } else {
      field += char;
    }
  }

  row.push(field);
  if (row.some(cell => cell.trim() !== "")) rows.push(row);
  if (rows.length < 2) return [];

  const headers = rows[0].map(normalizeHeader);
  return rows.slice(1).map(values => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
}

function getValue(row, field) {
  const aliases = HEADER_ALIASES[field];
  for (const alias of aliases) {
    const normalized = normalizeHeader(alias);
    if (Object.hasOwn(row, normalized)) return row[normalized];
  }
  return "";
}

function hasField(row, field) {
  return HEADER_ALIASES[field].some(alias => Object.hasOwn(row, normalizeHeader(alias)));
}

export function dateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : NaN;
  const cleaned = String(value ?? "")
    .replace(/\s/g, "")
    .replace(/[^0-9,.-]/g, "")
    .replace(/,(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".");
  return Number.parseFloat(cleaned);
}

export function parseDate(value, dateOrder = "DMY") {
  const full = String(value ?? "").trim();
  if (!full) return null;
  const raw = full.replace(/[T\s]+\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?\s*(?:[ap]m)?\s*(?:z|[+-]\d{2}:?\d{2})?$/i, "");
  if (!raw) return null;

  const isoMatch = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (isoMatch) return safeDate(+isoMatch[1], +isoMatch[2], +isoMatch[3]);

  const parts = raw.match(/^(\d{1,2})[\s/.\-](\d{1,2})[\s/.\-](\d{4})$/);
  if (parts) {
    const first = +parts[1];
    const second = +parts[2];
    const day = dateOrder === "MDY" ? second : first;
    const month = dateOrder === "MDY" ? first : second;
    return safeDate(+parts[3], month, day);
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

function safeDate(year, month, day) {
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}

function titleCase(value, fallback) {
  const text = String(value ?? "").trim();
  if (!text) return fallback;
  return text.toLowerCase().replace(/\b\w/g, char => char.toUpperCase());
}

export function normalizeRows(rawRows, dateOrder = "DMY") {
  const valid = [];
  const issues = [];
  const hasFullTankData = rawRows.some(row => hasField(row, "fullTank"));

  rawRows.forEach((row, index) => {
    const date = parseDate(getValue(row, "date"), dateOrder);
    const liters = parseNumber(getValue(row, "liters"));
    const totalCost = parseNumber(getValue(row, "totalCost"));
    let pricePerLiter = parseNumber(getValue(row, "pricePerLiter"));

    if (!date || !Number.isFinite(liters) || liters <= 0 || !Number.isFinite(totalCost) || totalCost < 0) {
      issues.push(`Row ${index + 2} has an invalid date, litres, or total cost.`);
      return;
    }

    if (!Number.isFinite(pricePerLiter) || pricePerLiter <= 0) pricePerLiter = totalCost / liters;
    const fullTankRaw = String(getValue(row, "fullTank")).trim().toLowerCase();

    valid.push({
      id: `${dateKey(date)}-${index}`,
      date,
      liters,
      totalCost,
      pricePerLiter,
      vehicle: titleCase(getValue(row, "vehicle"), "Unspecified"),
      fuelType: String(getValue(row, "fuelType") || "Unspecified").trim().toUpperCase(),
      fullTank: ["yes", "y", "true", "1"].includes(fullTankRaw),
      month: String(getValue(row, "month") || "").trim(),
      year: Number.parseInt(getValue(row, "year"), 10) || date.getFullYear()
    });
  });

  valid.sort((a, b) => a.date - b.date);
  return { rows: valid, issues, hasFullTankData };
}

export function filterRows(rows, filters) {
  return rows.filter(row => {
    const inDateRange = (!filters.from || row.date >= filters.from) && (!filters.to || row.date <= filters.to);
    const vehicleMatch = filters.vehicle === "all" || row.vehicle === filters.vehicle;
    const fuelMatch = filters.fuel === "all" || row.fuelType === filters.fuel;
    return inDateRange && vehicleMatch && fuelMatch;
  });
}

export function aggregateByMonth(rows, range = {}) {
  const monthMap = new Map();
  rows.forEach(row => {
    const key = `${row.date.getFullYear()}-${String(row.date.getMonth() + 1).padStart(2, "0")}`;
    if (!monthMap.has(key)) {
      monthMap.set(key, {
        key,
        date: new Date(row.date.getFullYear(), row.date.getMonth(), 1),
        cost: 0,
        liters: 0,
        visits: 0,
        hasData: true
      });
    }
    const month = monthMap.get(key);
    month.cost += row.totalCost;
    month.liters += row.liters;
    month.visits += 1;
  });

  const dates = [...monthMap.values()].map(month => month.date).sort((a, b) => a - b);
  const startSource = range.from || dates[0];
  const endSource = range.to || dates[dates.length - 1];
  if (!startSource || !endSource) return [];

  const cursor = new Date(startSource.getFullYear(), startSource.getMonth(), 1);
  const end = new Date(endSource.getFullYear(), endSource.getMonth(), 1);

  const months = [];
  while (cursor <= end) {
    const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
    const month = monthMap.get(key) || { key, date: new Date(cursor), cost: 0, liters: 0, visits: 0, hasData: false };
    const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
    months.push({
      ...month,
      perDay: month.cost / daysInMonth,
      price: month.liters ? month.cost / month.liters : 0
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return months;
}

export function calculateSummary(rows) {
  const totalCost = rows.reduce((sum, row) => sum + row.totalCost, 0);
  const totalLiters = rows.reduce((sum, row) => sum + row.liters, 0);
  const fullTanks = rows.filter(row => row.fullTank).length;
  return {
    totalCost,
    totalLiters,
    averagePrice: totalLiters ? totalCost / totalLiters : 0,
    count: rows.length,
    fullTankRate: rows.length ? fullTanks / rows.length : 0
  };
}

export function groupCost(rows, field) {
  const totals = new Map();
  rows.forEach(row => totals.set(row[field], (totals.get(row[field]) || 0) + row.totalCost));
  return [...totals.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}

function shiftYear(date, years) {
  const year = date.getFullYear() + years;
  const month = date.getMonth();
  const day = Math.min(date.getDate(), new Date(year, month + 1, 0).getDate());
  return new Date(year, month, day);
}

export function previousPeriodRange(from, to) {
  return { from: shiftYear(from, -1), to: shiftYear(to, -1) };
}

export function hasComparableHistory(rows, from, to) {
  if (!from || !to || !rows.length) return false;
  const earliest = rows.reduce((min, row) => row.date < min ? row.date : min, rows[0].date);
  return shiftYear(from, -1) >= new Date(earliest.getFullYear(), earliest.getMonth(), earliest.getDate());
}

export function previousPeriod(rows, from, to, vehicle = "all", fuel = "all") {
  if (!from || !to) return [];
  const range = previousPeriodRange(from, to);
  return filterRows(rows, { ...range, vehicle, fuel });
}

export function findNewVehicles(currentRows, previousRows) {
  const before = new Set(previousRows.map(row => row.vehicle));
  const added = new Set();
  currentRows.forEach(row => {
    if (!before.has(row.vehicle)) added.add(row.vehicle);
  });
  return [...added].sort();
}

export function decomposeCostChange(current, previous) {  const costDelta = current.totalCost - previous.totalCost;
  const volumeEffect = (current.totalLiters - previous.totalLiters) * previous.averagePrice;
  const priceEffect = (current.averagePrice - previous.averagePrice) * current.totalLiters;
  return { costDelta, volumeEffect, priceEffect };
}

export function summarizeByVehicle(rows) {
  const totalCost = rows.reduce((sum, row) => sum + row.totalCost, 0);
  const groups = new Map();
  rows.forEach(row => {
    if (!groups.has(row.vehicle)) groups.set(row.vehicle, []);
    groups.get(row.vehicle).push(row);
  });

  return [...groups.entries()]
    .map(([label, vehicleRows]) => {
      const cost = vehicleRows.reduce((sum, row) => sum + row.totalCost, 0);
      const liters = vehicleRows.reduce((sum, row) => sum + row.liters, 0);
      const first = new Date(vehicleRows[0].date);
      const last = new Date(vehicleRows[vehicleRows.length - 1].date);
      const days = Math.max(1, (last - first) / 86400000);
      return {
        label,
        cost,
        liters,
        visits: vehicleRows.length,
        costShare: totalCost ? cost / totalCost : 0,
        visitsShare: rows.length ? vehicleRows.length / rows.length : 0,
        averagePrice: liters ? cost / liters : 0,
        costPerVisit: cost / vehicleRows.length,
        litersPerDay: liters / days,
        costPerDay: cost / days
      };
    })
    .sort((a, b) => b.cost - a.cost);
}

export function computeBurnRate(rows) {
  const sorted = [...rows].sort((a, b) => a.date - b.date);
  const fullTanks = sorted.filter(row => row.fullTank);
  if (fullTanks.length < 2) return null;

  let liters = 0;
  let days = 0;
  let samples = 0;
  for (let i = 1; i < fullTanks.length; i += 1) {
    const start = fullTanks[i - 1];
    const end = fullTanks[i];
    const gap = (end.date - start.date) / 86400000;
    if (!gap || gap > 45) continue;
    const between = sorted.filter(row => row.date > start.date && row.date < end.date);
    const filled = end.liters + between.reduce((sum, row) => sum + row.liters, 0);
    liters += filled;
    days += gap;
    samples += 1;
  }
  if (!samples) return null;
  return { litersPerDay: liters / days, samples };
}

export function rollingAverage(values, window = 3) {
  return values.map((_, index) => {
    if (index < window - 1) return null;
    let total = 0;
    for (let offset = index - window + 1; offset <= index; offset += 1) {
      const value = values[offset];
      if (value === null || value === undefined) return null;
      total += value;
    }
    return total / window;
  });
}

export function findDataWarnings(rows) {
  const warnings = [];

  const sameDay = new Map();
  rows.forEach(row => {
    const key = `${dateKey(row.date)}|${row.vehicle}`;
    if (!sameDay.has(key)) sameDay.set(key, []);
    sameDay.get(key).push(row);
  });
  sameDay.forEach(group => {
    if (group.length > 1) {
      warnings.push({
        type: "duplicate",
        count: group.length - 1,
        message: `${group.length} refuels were recorded for ${group[0].vehicle} on ${dateKey(group[0].date)}.`
      });
    }
  });

  const groups = new Map();
  rows.forEach(row => {
    if (!groups.has(row.vehicle)) groups.set(row.vehicle, []);
    groups.get(row.vehicle).push(row);
  });
  groups.forEach((vehicleRows, vehicle) => {
    if (vehicleRows.length < 6) return;
    const sorted = vehicleRows.map(row => row.liters).sort((a, b) => a - b);
    const quarter = (percent) => {
      const position = (sorted.length - 1) * percent;
      const lower = Math.floor(position);
      const upper = Math.ceil(position);
      return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
    };
    const q1 = quarter(0.25);
    const q3 = quarter(0.75);
    const spread = q3 - q1;
    const low = q1 - 1.5 * spread;
    let count = 0;
    vehicleRows.forEach(row => {
      if (row.liters < low) count += 1;
    });
    if (count) {
      warnings.push({
        type: "outlier",
        count,
        message: `${count} ${vehicle} refuel${count === 1 ? " was" : "s were"} much smaller than usual and may be partial fills.`
      });
    }
  });

  return warnings;
}
