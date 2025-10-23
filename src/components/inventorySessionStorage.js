const STORAGE_KEY = 'lastClosedInventorySessions';

const safeParse = (raw) => {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (err) {
    console.warn('Failed to parse stored inventory sessions', err);
    return {};
  }
};

export const getLastClosedSessionId = (locationId) => {
  if (typeof window === 'undefined' || !locationId) return null;
  try {
    const map = safeParse(window.localStorage.getItem(STORAGE_KEY));
    const value = map[String(locationId)];
    return typeof value === 'string' && value ? value : null;
  } catch (err) {
    console.warn('Failed to read last closed session id', err);
    return null;
  }
};

export const rememberClosedSession = (locationId, sessionId) => {
  if (typeof window === 'undefined' || !locationId || !sessionId) return;
  try {
    const map = safeParse(window.localStorage.getItem(STORAGE_KEY));
    map[String(locationId)] = String(sessionId);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch (err) {
    console.warn('Failed to persist last closed session id', err);
  }
};

export const forgetClosedSession = (locationId) => {
  if (typeof window === 'undefined' || !locationId) return;
  try {
    const map = safeParse(window.localStorage.getItem(STORAGE_KEY));
    if (!(String(locationId) in map)) return;
    delete map[String(locationId)];
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch (err) {
    console.warn('Failed to clear last closed session id', err);
  }
};