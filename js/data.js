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
  const raw = String(value ?? "").trim();
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
      id: `${date.toISOString().slice(0, 10)}-${index}`,
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
  return { rows: valid, issues };
}

export function filterRows(rows, filters) {
  return rows.filter(row => {
    const inDateRange = (!filters.from || row.date >= filters.from) && (!filters.to || row.date <= filters.to);
    const vehicleMatch = filters.vehicle === "all" || row.vehicle === filters.vehicle;
    const fuelMatch = filters.fuel === "all" || row.fuelType === filters.fuel;
    return inDateRange && vehicleMatch && fuelMatch;
  });
}

export function aggregateByMonth(rows) {
  const monthMap = new Map();
  rows.forEach(row => {
    const key = `${row.date.getFullYear()}-${String(row.date.getMonth() + 1).padStart(2, "0")}`;
    if (!monthMap.has(key)) {
      monthMap.set(key, { key, date: new Date(row.date.getFullYear(), row.date.getMonth(), 1), cost: 0, liters: 0, visits: 0 });
    }
    const month = monthMap.get(key);
    month.cost += row.totalCost;
    month.liters += row.liters;
    month.visits += 1;
  });

  return [...monthMap.values()]
    .sort((a, b) => a.date - b.date)
    .map(month => ({ ...month, price: month.liters ? month.cost / month.liters : 0 }));
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

export function previousPeriod(rows, from, to, vehicle = "all", fuel = "all") {
  if (!from || !to) return [];
  const duration = to.getTime() - from.getTime();
  const previousTo = new Date(from);
  previousTo.setDate(previousTo.getDate() - 1);
  const previousFrom = new Date(previousTo.getTime() - duration);
  return filterRows(rows, { from: previousFrom, to: previousTo, vehicle, fuel });
}
