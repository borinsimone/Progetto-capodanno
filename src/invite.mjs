const key = "capodanno-pending-invite";

export function captureInvite(browser = window) {
  const params = new URLSearchParams(browser.location.hash.slice(1));
  const code = params.get("invite");
  if (code !== null) {
    browser.history.replaceState(null, "", browser.location.pathname + browser.location.search);
    if (/^[A-Za-z0-9_-]{8,128}$/.test(code)) {
      browser.sessionStorage.setItem(key, code);
    } else {
      browser.sessionStorage.removeItem(key);
    }
  }
  return browser.sessionStorage.getItem(key) || "";
}

export function clearInvite(browser = window) {
  browser.sessionStorage.removeItem(key);
}
