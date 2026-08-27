/**
 * Safe wrapper for localStorage to prevent crashes in restricted environments
 * (like some in-app browsers or private modes).
 */
export const storage = {
  get(key, defaultValue = null) {
    try {
      const item = localStorage.getItem(key);
      if (item === null) return defaultValue;
      try {
        return JSON.parse(item);
      } catch {
        return item;
      }
    } catch (e) {
      console.warn(`LocalStorage access failed for key "${key}":`, e);
      return defaultValue;
    }
  },

  set(key, value) {
    try {
      const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
      localStorage.setItem(key, stringValue);
      return true;
    } catch (e) {
      console.warn(`LocalStorage set failed for key "${key}":`, e);
      return false;
    }
  },

  remove(key) {
    try {
      localStorage.removeItem(key);
      return true;
    } catch (e) {
      console.warn(`LocalStorage remove failed for key "${key}":`, e);
      return false;
    }
  }
};
