/**
 * GitHub Pages -> Google Apps Script API configuration
 *
 * 1) Deploy Apps Script as Web app after adding Api.gs.
 * 2) Copy the /exec URL below.
 * 3) Keep the URL ending in /exec (not /dev).
 */
window.APP_CONFIG = Object.freeze({
  API_URL: 'PASTE_YOUR_APPS_SCRIPT_WEB_APP_EXEC_URL_HERE',
  REQUEST_TIMEOUT_MS: 120000,
  DEBUG_API: false
});
