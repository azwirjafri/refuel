// This file is public when deployed to GitHub Pages. Never put passwords,
// OAuth tokens, API keys, or service-account credentials here.
window.FUEL_DASHBOARD_CONFIG = {
  // Paste the CSV URL from Google Sheets: File > Share > Publish to web.
  // Leave blank to run the dashboard with the included demonstration data.
  sheetCsvUrl: "https://docs.google.com/spreadsheets/d/e/2PACX-1vRk55veXuXzJ9GsfTMwH7EsOonmQ57_V0w10qtlWLP744pIVKyILxTi2gx_usmlSciPypNJ_y-h_Jjc/pub?gid=0&single=true&output=csv",

  // DMY is appropriate for dates such as 21/07/2026.
  // Change to MDY if your Sheet exports dates as month/day/year.
  dateOrder: "DMY",

  currency: "MYR",
  locale: "en-MY",
  defaultPeriod: "1y",
  maxTableRows: 10
};
