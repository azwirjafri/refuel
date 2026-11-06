# Refuel — Monthly Fuel Budget

A lightweight, dependency-free dashboard for personal fuel spending. Refuel reads a published Google Sheets CSV and turns your refuel history into a clear monthly budget view.

## Features

- Latest recorded month spending and previous-month comparison
- Average monthly spend, average cost per refuel, and refuels per active month
- Monthly spending, fuel-price, and refuel-frequency charts
- Optional three-month rolling average
- Vehicle or fuel-type cost breakdown
- Per-vehicle spending and tank-to-tank fuel-use summaries
- Duration presets, custom dates, and vehicle/fuel filters
- Collapsible mobile filter panel
- Data-quality warnings for duplicate and unusually small refuels
- Responsive layout, keyboard-accessible controls, and reduced-motion support
- No accounts, analytics, cookies, API keys, or third-party runtime dependencies

## Monthly data updates

The dashboard is designed for sheets updated monthly rather than continuously. The overview is labeled **Latest recorded month**, and comparisons use recorded totals without implying live month-to-date progress. The period label shows the latest refuel date included in the current view.

## 1. Prepare the Google Sheet

The first row must contain these headers:

```text
Date, Liters, Total Cost, Price/L, Vehicle, Fuel Type, Full Tank, Month, Year
```

`Liters`/`Litres` and common spacing differences are accepted. `Price/L` may be blank because the dashboard can calculate it from total cost divided by litres.

Recommended date format: `DD/MM/YYYY`. If the sheet exports `MM/DD/YYYY`, change `dateOrder` in `config.js` to `MDY`.

## 2. Publish only the dashboard tab

A published CSV is publicly accessible. Use a separate sanitized tab if the workbook contains private information.

1. Create a tab containing only the dashboard columns.
2. Select **File → Share → Publish to web**.
3. Choose that individual tab, not the entire spreadsheet.
4. Select **Comma-separated values (.csv)** and click **Publish**.
5. Copy the generated URL, which usually resembles:

   ```text
   https://docs.google.com/spreadsheets/d/e/PUBLISHED_ID/pub?gid=0&single=true&output=csv
   ```

6. Paste it into `config.js`:

   ```js
   sheetCsvUrl: "https://docs.google.com/spreadsheets/d/e/.../pub?gid=0&single=true&output=csv",
   ```

Never put credentials, tokens, or API keys in `config.js`.

## 3. Preview locally

Opening `index.html` directly will not load CSV files because browsers restrict local file access. Start a static server from the project folder:

```powershell
python -m http.server 8000
```

Then open `http://localhost:8000`.

If `sheetCsvUrl` is blank or the published sheet cannot be loaded, the included demonstration data is shown.

## 4. Publish with GitHub Pages

1. Push the project to a public GitHub repository.
2. Open **Settings → Pages** in that repository.
3. Under **Build and deployment**, select **Deploy from a branch**.
4. Choose `main` and `/ (root)`, then save.
5. GitHub provides a URL such as `https://YOUR-NAME.github.io/REPOSITORY/`.

The dashboard reads updates from the published sheet when opened. Google may take several minutes to refresh its published CSV after the sheet changes.

## Configuration

Safe-to-publish settings are in `config.js`:

| Setting | Purpose |
|---|---|
| `sheetCsvUrl` | Published Google Sheets CSV URL |
| `dateOrder` | `DMY` or `MDY` for slash-formatted dates |
| `currency` | ISO currency code, default `MYR` |
| `locale` | Number and date locale, default `en-MY` |
| `defaultPeriod` | `3m`, `6m`, `ytd`, `1y`, or `all` |
| `maxTableRows` | Maximum recent records displayed |

## Data privacy

- Publishing a sheet tab makes its data publicly accessible.
- Visitors can inspect and download the CSV even if a column is not displayed.
- Do not publish registration numbers, payment information, receipt identifiers, precise locations, or private notes.
- If exact refuel dates are sensitive, publish monthly aggregated rows instead of transaction-level data.
- To remove access, stop publishing the sheet tab and remove copied data from the website.

## Tests

Run the data parser and calculation tests with Node's built-in test runner. No package installation is required:

```powershell
npm test
```

Coverage includes CSV parsing, header normalization, date parsing, month aggregation, comparisons, vehicle summaries, rolling averages, budget calculations, and data-quality warnings.
