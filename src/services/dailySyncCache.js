const CACHE_PREFIX = "ubsDashboardDailySync:";

function storageKey(scopeKey) {
  return `${CACHE_PREFIX}${scopeKey}`;
}

export function loadDashboardDailySnapshot(scopeKey, dayKey) {
  if (!scopeKey || !dayKey) return null;
  try {
    const raw = localStorage.getItem(storageKey(scopeKey));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.dayKey !== dayKey) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveDashboardDailySnapshot(scopeKey, payload) {
  if (!scopeKey || !payload) return;
  try {
    localStorage.setItem(storageKey(scopeKey), JSON.stringify(payload));
  } catch {
    // Ignore storage errors (quota, private mode, etc.)
  }
}

export function clearDashboardDailySnapshot(scopeKey) {
  if (!scopeKey) return;
  try {
    localStorage.removeItem(storageKey(scopeKey));
  } catch {
    // ignore
  }
}

