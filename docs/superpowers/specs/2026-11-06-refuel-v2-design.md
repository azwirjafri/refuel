# Refuel V2 — Monthly Budgeting Design

## Intent

Create a visually fresh V2 of the existing dependency-free Refuel dashboard. Make monthly budgeting the primary task: understand the latest month, compare spending with earlier months, and spot what is driving changes. Keep all work isolated from `main` and do not merge it.

## Goals

- Establish an editorial budget-ledger aesthetic: warm paper surfaces, strong typographic hierarchy, compact data displays, and restrained green/coral accents.
- Lead with latest-month spending, its comparison to the prior month, and average monthly spending in the selected period.
- Provide useful monthly trends for spending, fuel price, and refuel frequency.
- Add budget-relevant KPIs: average cost per refuel and average refuels per active month.
- Add a clear monthly comparison chart and a secondary Car vs Motor breakdown.
- Retain the existing filters, accessible recent-records table, live Google Sheets connection, and demonstration-data fallback.
- Make charts readable and interactive on desktop and mobile, with textual summaries for assistive technology.

## Non-goals

- No editable budgets, accounts, authentication, persistence, or new backend.
- No fuel-economy or cost-per-kilometre claims: the source has no distance or odometer data.
- No third-party runtime dependencies or new charting framework.
- No merge into `main`.

## Constraints

- Preserve the static HTML/CSS/JavaScript architecture and existing CSV schema.
- Preserve the existing configuration and data parser behavior.
- All displayed figures must derive from filtered source data; comparisons must clearly identify their period.
- Controls must remain keyboard accessible, have visible focus, and respect reduced motion.
- Chart colors cannot be the only means of identifying categories.

## Approaches

1. **Editorial budget ledger — selected.** A calm, spacious budgeting workspace with a prominent monthly summary and clear supporting analytics. Best fit for repeated monthly budgeting.
2. **Dark financial cockpit.** More dramatic and dense, but less approachable for routine household budgeting.
3. **Minimal financial utility.** Compact and functional, but too similar in spirit to the existing dashboard to provide a fresh experience.

## Design

### Layout

- Slim application header with Refuel branding and live-data status.
- Compact toolbar containing period presets, date range, vehicle and fuel filters.
- Monthly overview hero: latest month spend, change from previous month, and selected-period average monthly spend.
- Supporting KPI row: litres, average price/L, refuels, average cost/refuel, and days between refuels.
- Large monthly spend chart with metric switching and a compact monthly comparison panel.
- Secondary vehicle/fuel cost breakdown and recent-refuels table.
- Responsive single-column mobile layout with no horizontal page scrolling.

### Visual language

- Warm off-white background and raised cream panels.
- Dark forest text, fresh green primary accents, coral for attention and comparisons.
- Editorial serif display type paired with a highly readable system sans-serif for data and controls.
- Thin rules, subtle shadows, modest radii, and restrained transitions rather than decorative dashboard effects.

### Behavior

- Preserve the selected-period model and current Google Sheet loading behavior.
- Monthly hero uses the most recent month with data inside the current filters.
- Previous-month comparison uses the immediately preceding calendar month with matching vehicle/fuel filters, including when it falls outside the selected range. Because the sheet is maintained monthly rather than daily, the latest month is labeled “Latest recorded month” and comparisons use recorded totals without implying live progress.
- Average monthly spend divides selected-period spend by the number of calendar months containing matching records, including a partial latest month.
- The large chart switches among monthly spending, weighted fuel price, and refuel frequency. The compact comparison panel complements it with latest-month and previous-month KPI comparisons rather than duplicating the trend.
- The secondary breakdown has explicit Vehicle and Fuel type modes; Vehicle is the default.
- Recent records remain limited to the selected period and matching vehicle/fuel filters.
- Average days between refuels uses adjacent visits within the filtered results and shows an unavailable state when fewer than two visits exist.
- Empty, loading, invalid-data, and unavailable-comparison states receive explicit labels.

### Builder choices

- Extend the existing canvas chart implementation rather than introduce a dependency.
- Add focused tests for new budget calculations.
- Preserve V1 behavior where it does not conflict with the V2 information hierarchy.
