/**
 * GitHub Pages -> Google Apps Script API configuration
 *
 * 1) Deploy Apps Script as Web app after adding Api.gs.
 * 2) Copy the /exec URL below.
 * 3) Keep the URL ending in /exec (not /dev).
 */
window.APP_CONFIG = Object.freeze({
  API_URL: 'https://script.google.com/macros/s/AKfycbxrMKJ-YGL9m7tMqQ_HuwYhgL4KNZDlUZMN3UyxaVD5DcPxKqc4wou37YJwgPaJfBUOzg/exec',
  REQUEST_TIMEOUT_MS: 120000,
  DEBUG_API: false
});
