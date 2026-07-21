import {
  parseCSV,
  normalizeRows,
  filterRows,
  aggregateByMonth,
  calculateSummary,
  groupCost,
  previousPeriod
} from "./data.js";
import { TrendChart } from "./chart.js";

const config = {
  sheetCsvUrl: "",
  dateOrder: "DMY",
  currency: "MYR",
  locale: "en-MY",
  defaultPeriod: "1y",
  maxTableRows: 10,
  ...(window.FUEL_DASHBOARD_CONFIG || {})
};

const elements = {
  sourceBadge: document.querySelector("#source-badge"),
  updatedAt: document.querySelector("#updated-at"),
  footerSource: document.querySelector("#footer-source"),
  periodLabel: document.querySelector("#period-label"),
  notice: document.querySelector("#notice"),
  presets: document.querySelector("#period-presets"),
  dateFrom: document.querySelector("#date-from"),
  dateTo: document.querySelector("#date-to"),
  vehicle: document.querySelector("#vehicle-filter"),
  fuel: document.querySelector("#fuel-filter"),
  reset: document.querySelector("#reset-filters"),
  metric: document.querySelector("#metric-select"),
  totalCost: document.querySelector("#total-cost"),
  costContext: document.querySelector("#cost-context"),
  totalLiters: document.querySelector("#total-liters"),
  litersContext: document.querySelector("#liters-context"),
  averagePrice: document.querySelector("#average-price"),
  refuelCount: document.querySelector("#refuel-count"),
  fullTankRate: document.querySelector("#full-tank-rate"),
  analysisCopy: document.querySelector("#analysis-copy"),
  insightList: document.querySelector("#insight-list"),
  breakdownList: document.querySelector("#breakdown-list"),
  recordCount: document.querySelector("#record-count"),
  recordsBody: document.querySelector("#records-body")
};

const formatters = {
  currency: value => new Intl.NumberFormat(config.locale, {
    style: "currency",
    currency: config.currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value),
  compactCurrency: value => new Intl.NumberFormat(config.locale, {
    style: "currency",
    currency: config.currency,
    notation: "compact",
    maximumFractionDigits: 1
  }).format(value),
  number: (value, digits = 0) => new Intl.NumberFormat(config.locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  }).format(value),
  date: value => new Intl.DateTimeFormat(config.locale, { day: "numeric", month: "short", year: "numeric" }).format(value),
  shortMonth: value => new Intl.DateTimeFormat(config.locale, { month: "short" }).format(value),
  longMonth: value => new Intl.DateTimeFormat(config.locale, { month: "long", year: "numeric" }).format(value)
};

const chart = new TrendChart(
  document.querySelector("#chart-canvas"),
  document.querySelector("#chart-tooltip"),
  document.querySelector("#chart-fallback"),
  formatters
);

const state = {
  rows: [],
  filtered: [],
  activePeriod: config.defaultPeriod,
  minDate: null,
  maxDate: null,
  source: "demo"
};

init();

async function init() {
  bindEvents();
  try {
    const result = await loadData();
    state.rows = result.rows;
    state.source = result.source;
    if (!state.rows.length) throw new Error("No valid records were found.");
    state.minDate = new Date(state.rows[0].date);
    state.maxDate = new Date(state.rows[state.rows.length - 1].date);
    configureFilters();
    applyPeriod(config.defaultPeriod);
    setSourceStatus(result.source);
    if (result.issues.length) {
      showNotice(`${result.issues.length} row${result.issues.length === 1 ? " was" : "s were"} skipped because required values were invalid.`);
    }
  } catch (error) {
    showFatal(error instanceof Error ? error.message : "The dashboard could not load its data.");
  }
}

async function loadData() {
  const sourceUrl = String(config.sheetCsvUrl || "").trim();
  let source = "demo";
  let response;

  if (sourceUrl) {
    let parsedUrl;
    try {
      parsedUrl = new URL(sourceUrl);
    } catch {
      throw new Error("The Google Sheets CSV URL in config.js is not valid.");
    }
    if (parsedUrl.protocol !== "https:" || parsedUrl.hostname !== "docs.google.com") {
      throw new Error("For safety, sheetCsvUrl must be an HTTPS docs.google.com published CSV URL.");
    }
    parsedUrl.searchParams.set("dashboard_cache", Math.floor(Date.now() / 300000).toString());
    try {
      response = await fetch(parsedUrl, { cache: "no-store", credentials: "omit" });
      if (!response.ok) throw new Error(`Google Sheets returned ${response.status}.`);
      source = "google";
    } catch (error) {
      response = await fetch("data/sample.csv", { cache: "no-store" });
      showNotice(`The Google Sheet could not be loaded, so demonstration data is shown. ${error.message}`);
    }
  } else {
    response = await fetch("data/sample.csv", { cache: "no-store" });
  }

  if (!response.ok) throw new Error("The CSV data file could not be loaded.");
  const csv = await response.text();
  const rawRows = parseCSV(csv.replace(/^\uFEFF/, ""));
  const normalized = normalizeRows(rawRows, config.dateOrder);
  return { ...normalized, source };
}

function bindEvents() {
  elements.presets.addEventListener("click", event => {
    const button = event.target.closest("button[data-period]");
    if (button) applyPeriod(button.dataset.period);
  });

  elements.dateFrom.addEventListener("change", applyCustomDates);
  elements.dateTo.addEventListener("change", applyCustomDates);
  elements.vehicle.addEventListener("change", render);
  elements.fuel.addEventListener("change", render);
  elements.metric.addEventListener("change", renderChart);
  elements.reset.addEventListener("click", () => {
    elements.vehicle.value = "all";
    elements.fuel.value = "all";
    elements.metric.value = "cost";
    applyPeriod(config.defaultPeriod);
  });
}

function configureFilters() {
  elements.dateFrom.min = toInputDate(state.minDate);
  elements.dateFrom.max = toInputDate(state.maxDate);
  elements.dateTo.min = toInputDate(state.minDate);
  elements.dateTo.max = toInputDate(state.maxDate);

  fillSelect(elements.vehicle, [...new Set(state.rows.map(row => row.vehicle))].sort(), "All vehicles");
  fillSelect(elements.fuel, [...new Set(state.rows.map(row => row.fuelType))].sort(), "All fuel types");
}

function fillSelect(select, values, allLabel) {
  select.replaceChildren();
  select.append(new Option(allLabel, "all"));
  values.forEach(value => select.append(new Option(value, value)));
}

function applyPeriod(period) {
  const from = new Date(state.maxDate);
  const to = new Date(state.maxDate);
  if (period === "3m") from.setMonth(from.getMonth() - 2, 1);
  if (period === "6m") from.setMonth(from.getMonth() - 5, 1);
  if (period === "1y") from.setMonth(from.getMonth() - 11, 1);
  if (period === "ytd") from.setMonth(0, 1);
  if (period === "all") from.setTime(state.minDate.getTime());

  state.activePeriod = period;
  elements.dateFrom.value = toInputDate(from < state.minDate ? state.minDate : from);
  elements.dateTo.value = toInputDate(to);
  updatePresetButtons();
  render();
}

function applyCustomDates() {
  state.activePeriod = null;
  if (elements.dateFrom.value && elements.dateTo.value && elements.dateFrom.value > elements.dateTo.value) {
    if (document.activeElement === elements.dateFrom) elements.dateTo.value = elements.dateFrom.value;
    else elements.dateFrom.value = elements.dateTo.value;
  }
  updatePresetButtons();
  render();
}

function updatePresetButtons() {
  elements.presets.querySelectorAll("button[data-period]").forEach(button => {
    button.setAttribute("aria-pressed", String(button.dataset.period === state.activePeriod));
  });
}

function render() {
  if (!state.rows.length) return;
  const filters = currentFilters();
  state.filtered = filterRows(state.rows, filters);
  const summary = calculateSummary(state.filtered);
  const previous = calculateSummary(previousPeriod(state.rows, filters.from, filters.to, filters.vehicle, filters.fuel));
  renderPeriodLabel(filters, summary.count);
  renderSummary(summary, previous);
  renderChart();
  renderAnalysis(summary, previous);
  renderBreakdown(summary);
  renderRecords();
}

function currentFilters() {
  return {
    from: fromInputDate(elements.dateFrom.value),
    to: fromInputDate(elements.dateTo.value),
    vehicle: elements.vehicle.value,
    fuel: elements.fuel.value
  };
}

function renderPeriodLabel(filters, count) {
  const from = filters.from ? formatters.date(filters.from) : "first record";
  const to = filters.to ? formatters.date(filters.to) : "latest record";
  const qualifiers = [];
  if (filters.vehicle !== "all") qualifiers.push(filters.vehicle);
  if (filters.fuel !== "all") qualifiers.push(filters.fuel);
  const qualifierText = qualifiers.length ? ` · ${qualifiers.join(" · ")}` : "";
  elements.periodLabel.textContent = `${from} – ${to} · ${count} refuel${count === 1 ? "" : "s"}${qualifierText}`;
}

function renderSummary(summary, previous) {
  elements.totalCost.textContent = formatters.currency(summary.totalCost);
  elements.totalLiters.textContent = `${formatters.number(summary.totalLiters, 1)} L`;
  elements.averagePrice.textContent = `${formatters.currency(summary.averagePrice)} / L`;
  elements.refuelCount.textContent = formatters.number(summary.count);
  elements.fullTankRate.textContent = summary.count ? `${Math.round(summary.fullTankRate * 100)}% were full tanks` : "No refuels selected";
  elements.litersContext.textContent = summary.count ? `Across ${summary.count} refuel${summary.count === 1 ? "" : "s"}` : "No fuel in this period";

  if (previous.totalCost > 0) {
    const change = percentageChange(summary.totalCost, previous.totalCost);
    elements.costContext.textContent = `${signedPercent(change)} vs previous period`;
  } else {
    elements.costContext.textContent = "Selected period";
  }
}

function renderChart() {
  const monthly = aggregateByMonth(state.filtered);
  chart.setData(monthly, elements.metric.value);
}

function renderAnalysis(summary, previous) {
  elements.insightList.replaceChildren();
  if (!summary.count) {
    elements.analysisCopy.textContent = "There are no refuel records matching this combination of dates and filters.";
    addInsight("—", "Try a wider period");
    return;
  }

  const months = aggregateByMonth(state.filtered);
  const peak = months.reduce((best, month) => month.cost > best.cost ? month : best, months[0]);
  const costChange = previous.totalCost > 0 ? percentageChange(summary.totalCost, previous.totalCost) : null;
  const spendSentence = costChange === null
    ? `You spent ${formatters.currency(summary.totalCost)} on ${formatters.number(summary.totalLiters, 1)} litres across ${summary.count} refuel${summary.count === 1 ? "" : "s"}.`
    : `You spent ${formatters.currency(summary.totalCost)} on fuel, ${comparisonPhrase(costChange)} in the previous comparable period.`;
  const peakSentence = `${formatters.longMonth(peak.date)} was the highest-spend month at ${formatters.currency(peak.cost)}.`;
  elements.analysisCopy.textContent = `${spendSentence} ${peakSentence}`;

  addInsight(formatters.currency(summary.averagePrice), "Average price per litre");
  addInsight(formatters.currency(summary.count ? summary.totalCost / summary.count : 0), "Average cost per refuel");
  addInsight(`${Math.round(summary.fullTankRate * 100)}%`, "Full-tank refuels");
}

function addInsight(value, label) {
  const item = document.createElement("div");
  item.className = "insight";
  const strong = document.createElement("strong");
  strong.textContent = value;
  const span = document.createElement("span");
  span.textContent = label;
  item.append(strong, span);
  elements.insightList.append(item);
}

function renderBreakdown(summary) {
  elements.breakdownList.replaceChildren();
  if (!summary.count) {
    const empty = document.createElement("p");
    empty.className = "period-label";
    empty.textContent = "No cost breakdown is available.";
    elements.breakdownList.append(empty);
    return;
  }

  let groups = groupCost(state.filtered, "fuelType");
  if (groups.length === 1 && new Set(state.filtered.map(row => row.vehicle)).size > 1) {
    groups = groupCost(state.filtered, "vehicle");
  }
  groups.forEach(group => {
    const share = summary.totalCost ? group.value / summary.totalCost : 0;
    const item = document.createElement("div");
    item.className = "breakdown-item";
    const label = document.createElement("span");
    label.className = "breakdown-label";
    label.textContent = group.label;
    const value = document.createElement("span");
    value.className = "breakdown-value";
    value.textContent = `${Math.round(share * 100)}% · ${formatters.currency(group.value)}`;
    const track = document.createElement("div");
    track.className = "breakdown-track";
    track.setAttribute("role", "img");
    track.setAttribute("aria-label", `${group.label}: ${Math.round(share * 100)} percent of selected cost`);
    const fill = document.createElement("div");
    fill.className = "breakdown-fill";
    fill.style.setProperty("--share", `${Math.max(2, share * 100)}%`);
    track.append(fill);
    item.append(label, value, track);
    elements.breakdownList.append(item);
  });
}

function renderRecords() {
  elements.recordsBody.replaceChildren();
  const newest = [...state.filtered].sort((a, b) => b.date - a.date).slice(0, config.maxTableRows);
  elements.recordCount.textContent = state.filtered.length
    ? `Showing ${newest.length} of ${state.filtered.length}`
    : "No matching records";

  if (!newest.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 6;
    cell.textContent = "No refuels match the current filters.";
    row.append(cell);
    elements.recordsBody.append(row);
    return;
  }

  newest.forEach(record => {
    const row = document.createElement("tr");
    const cells = [
      formatters.date(record.date),
      record.vehicle,
      record.fuelType,
      `${formatters.number(record.liters, 1)} L`,
      formatters.currency(record.pricePerLiter),
      formatters.currency(record.totalCost)
    ];
    cells.forEach((value, index) => {
      const cell = document.createElement("td");
      cell.textContent = value;
      if (index >= 3) cell.className = "number";
      row.append(cell);
    });
    elements.recordsBody.append(row);
  });
}

function setSourceStatus(source) {
  const now = new Date();
  elements.updatedAt.textContent = `Loaded ${new Intl.DateTimeFormat(config.locale, { hour: "2-digit", minute: "2-digit" }).format(now)}`;
  if (source === "google") {
    elements.sourceBadge.textContent = "Google Sheet live";
    elements.sourceBadge.classList.remove("demo");
    elements.footerSource.textContent = "Data loaded from Google Sheets";
  } else {
    elements.sourceBadge.textContent = "Demo data";
    elements.sourceBadge.classList.add("demo");
    elements.footerSource.textContent = "Connect your Sheet in config.js";
    showNotice("Demonstration data is shown. Publish your dashboard tab as CSV, then paste its URL into config.js.");
  }
}

function showNotice(message) {
  elements.notice.textContent = message;
  elements.notice.hidden = false;
}

function showFatal(message) {
  elements.sourceBadge.textContent = "Data unavailable";
  elements.sourceBadge.classList.add("demo");
  showNotice(message);
  elements.periodLabel.textContent = "Check the data connection and reload the page.";
}

function toInputDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function fromInputDate(value) {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function percentageChange(current, previous) {
  return previous ? (current - previous) / previous : 0;
}

function signedPercent(value) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${Math.round(value * 100)}%`;
}

function comparisonPhrase(value) {
  const amount = Math.abs(Math.round(value * 100));
  if (amount < 1) return "about the same as";
  return `${amount}% ${value > 0 ? "higher than" : "lower than"}`;
}
