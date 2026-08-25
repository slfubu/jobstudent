/**
 * Compatibility bridge for Google Apps Script HTML-Service code.
 *
 * Existing application code can keep using:
 *   google.script.run
 *     .withSuccessHandler(fn)
 *     .withFailureHandler(fn)
 *     .serverFunction(arg1, arg2);
 *
 * On GitHub Pages this bridge converts the call to an HTTPS POST request
 * to the Apps Script Web App endpoint defined in config.js.
 */
(function () {
  'use strict';

  function getConfig() {
    return window.APP_CONFIG || {};
  }

  function getApiUrl() {
    const url = String(getConfig().API_URL || '').trim();
    if (!url || url.indexOf('PASTE_YOUR_APPS_SCRIPT') !== -1) {
      throw new Error('ยังไม่ได้ตั้งค่า Apps Script API URL ใน assets/js/config.js');
    }
    if (!/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec(?:\?.*)?$/.test(url)) {
      console.warn('APP_CONFIG.API_URL ไม่ใช่รูปแบบ /exec ที่คาดไว้:', url);
    }
    return url;
  }

  function normalizeError(error) {
    if (error && typeof error === 'object' && error.message) return error;
    return new Error(typeof error === 'string' ? error : 'Unknown API error');
  }

  async function postToAppsScript(action, args) {
    const config = getConfig();
    const controller = new AbortController();
    const timeoutMs = Number(config.REQUEST_TIMEOUT_MS || 120000);
    const timer = setTimeout(function () { controller.abort(); }, timeoutMs);

    try {
      const response = await fetch(getApiUrl(), {
        method: 'POST',
        redirect: 'follow',
        // text/plain is intentional. It keeps this a CORS "simple request"
        // and avoids an OPTIONS preflight that Apps Script Web Apps do not
        // provide a normal handler for.
        headers: {
          'Content-Type': 'text/plain;charset=utf-8'
        },
        body: JSON.stringify({
          action: String(action),
          args: Array.isArray(args) ? args : []
        }),
        signal: controller.signal,
        cache: 'no-store',
        credentials: 'omit'
      });

      if (!response.ok) {
        throw new Error('API HTTP ' + response.status + ' ' + response.statusText);
      }

      const raw = await response.text();
      let payload;
      try {
        payload = JSON.parse(raw);
      } catch (parseError) {
        throw new Error('API ตอบกลับมาไม่ใช่ JSON: ' + raw.slice(0, 180));
      }

      if (!payload || payload.ok !== true) {
        const message = payload && payload.error && payload.error.message
          ? payload.error.message
          : 'Apps Script API returned an error';
        const err = new Error(message);
        if (payload && payload.error && payload.error.name) err.name = payload.error.name;
        throw err;
      }

      if (config.DEBUG_API) {
        console.debug('[GAS API]', action, payload.result);
      }
      return payload.result;
    } finally {
      clearTimeout(timer);
    }
  }

  function createRunner(successHandler, failureHandler) {
    return new Proxy({}, {
      get: function (_target, property) {
        // Avoid accidental Promise/thenable detection.
        if (property === 'then') return undefined;

        if (property === 'withSuccessHandler') {
          return function (handler) {
            return createRunner(handler, failureHandler);
          };
        }

        if (property === 'withFailureHandler') {
          return function (handler) {
            return createRunner(successHandler, handler);
          };
        }

        return function () {
          const args = Array.prototype.slice.call(arguments);
          postToAppsScript(String(property), args)
            .then(function (result) {
              if (typeof successHandler === 'function') successHandler(result);
            })
            .catch(function (error) {
              const normalized = normalizeError(error);
              if (typeof failureHandler === 'function') {
                failureHandler(normalized);
              } else {
                console.error('[Apps Script API]', property, normalized);
                // Match google.script.run behavior closely: don't interrupt
                // unrelated UI code when no failure handler was supplied.
              }
            });
        };
      }
    });
  }

  window.GAS_API = Object.freeze({
    call: postToAppsScript,
    getUrl: getApiUrl
  });

  window.google = window.google || {};
  window.google.script = window.google.script || {};
  window.google.script.run = createRunner(null, null);
})();
