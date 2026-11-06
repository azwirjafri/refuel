# Fuel Ledger Dashboard

A lightweight, dependency-free dashboard for petrol refuel data stored in Google Sheets. It is designed for GitHub Pages and performs all filtering and chart rendering in the browser.

## Features

- Duration presets and custom date range
- Vehicle and fuel-type filters
- Monthly cost, litres, price-per-litre, and cost-per-day chart
- Optional three-month rolling average on the chart
- Like-for-like comparison against the same months one year earlier
- Cost-change explanation split into volume and price effects
- Per-vehicle summary with spend share, litres, refuels, and fuel used per day
- Dynamic summary and previous-period comparison
- Fuel or vehicle cost breakdown
- Data-quality notes for duplicate and unusually small refuels
- Latest matching refuel records
- Responsive layout, accessible controls, and reduced-motion support
- No analytics, cookies, API keys, or third-party runtime dependencies

## How the comparison works

The dashboard compares the selected period with **the same calendar months one year
earlier**, then explains any change in spending as a combination of two effects:

- **Volume effect** — litres bought changed.
- **Price effect** — the price per litre changed.

Together they add up to the total change, so an increase caused by driving more is not
mistaken for an increase caused by fuel getting more expensive.

Two cases are handled explicitly rather than showing a misleading percentage:

- If the sheet has no records a year before the selected period, the comparison is
  replaced with "Not enough history to compare".
- If a vehicle has refuels in the selected period but none in the comparison period,
  the analysis states that part of the change comes from a change in what is driven.

Months with no refuel records are drawn as gaps instead of being silently omitted, so
infrequent fill periods do not look like continuous history.

## 1. Prepare the Google Sheet


The first row must contain these headers:

```text
Date, Liters, Total Cost, Price/L, Vehicle, Fuel Type, Full Tank, Month, Year
```

The spelling is flexible for `Liters`/`Litres` and common spacing differences. `Price/L` can be blank because the dashboard can calculate it from total cost divided by litres.

Recommended date format: `DD/MM/YYYY`. If your Sheet exports `MM/DD/YYYY`, change `dateOrder` in `config.js` to `MDY`.

## 2. Publish only the dashboard tab

GitHub Pages cannot securely read a private Google Sheet directly. The published CSV is public, so use a separate sanitized tab if your workbook contains private information.

1. In Google Sheets, create a tab containing only the nine dashboard columns.
2. Select **File → Share → Publish to web**.
3. Choose that individual tab, not the entire spreadsheet.
4. Select **Comma-separated values (.csv)** and click **Publish**.
5. Copy the generated URL. It normally resembles:

   ```text
   https://docs.google.com/spreadsheets/d/e/PUBLISHED_ID/pub?gid=0&single=true&output=csv
   ```

6. Open `config.js` and paste the URL:

   ```js
   sheetCsvUrl: "https://docs.google.com/spreadsheets/d/e/.../pub?gid=0&single=true&output=csv",
   ```

Do not put credentials, tokens, or API keys in `config.js`. Everything in a GitHub Pages repository and website should be treated as public.

## 3. Preview locally

Opening `index.html` directly will not load CSV files because browsers restrict local file access. Start any static file server from this directory, for example:

```powershell
python -m http.server 8000
```

Then open `http://localhost:8000`.

If `sheetCsvUrl` is blank, the included demonstration data is shown.

## 4. Publish on GitHub Pages

1. Create a new public GitHub repository.
2. Push the contents of this folder to the repository's `main` branch.
3. In the repository, open **Settings → Pages**.
4. Under **Build and deployment**, select **Deploy from a branch**.
5. Choose `main` and `/ (root)`, then save.
6. GitHub will provide a URL such as `https://YOUR-NAME.github.io/REPOSITORY/`.

Updates to the Google Sheet are read when the dashboard is opened. Google may take several minutes to refresh a published CSV after the Sheet changes.

## Configuration

All safe-to-publish settings are in `config.js`:

| Setting | Purpose |
|---|---|
| `sheetCsvUrl` | Published Google Sheets CSV URL |
| `dateOrder` | `DMY` or `MDY` for slash-formatted dates |
| `currency` | ISO currency code, default `MYR` |
| `locale` | Number and date locale, default `en-MY` |
| `defaultPeriod` | `3m`, `6m`, `ytd`, `1y`, or `all` |
| `maxTableRows` | Maximum recent records displayed |

## Data privacy

- Publishing a Sheet tab makes that tab's data publicly accessible.
- Visitors can inspect and download the CSV even if a column is not rendered on screen.
- Do not publish registration numbers, payment information, receipt identifiers, precise locations, or private notes.
- If exact refuel dates are sensitive, publish monthly aggregated rows instead of transaction-level data.
- To remove access, stop publishing the Sheet tab and remove any copied data from the website.

## Tests

The data parser, comparison, and calculation tests use Node's built-in test runner and
require no package installation:

```powershell
npm test
```

Coverage includes CSV parsing, header normalisation, date parsing (including timestamps),
local-date record IDs, month gap filling, like-for-like comparison windows, cost
decomposition, per-vehicle summaries, tank-to-tank fuel use, rolling averages, and
data-quality warnings.

"# refuel" 
