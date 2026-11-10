/**
 * GitHub Pages -> Google Apps Script API configuration
 *
 * 1) Deploy Apps Script as Web app after adding Api.gs.
 * 2) Copy the /exec URL below.
 * 3) Keep the URL ending in /exec (not /dev).
 */
window.APP_CONFIG = Object.freeze({
  API_URL: 'https://script.google.com/macros/s/AKfycby6ClqMqTQHyVsfK_v610WbG9O4titi5UjJAEv873nFSID2g4mAwBP8ji_XkrqVTV_7Zg/exec',
  REQUEST_TIMEOUT_MS: 120000,
  DEBUG_API: false
});
