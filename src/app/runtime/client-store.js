import { CLIENT_CONFIG_KEY } from '../constants.js';

export function createClientStore(storageKey = CLIENT_CONFIG_KEY) {
  const key = storageKey || CLIENT_CONFIG_KEY;
  const safeParse = (raw) => {
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (error) {
      console.warn('Nepavyko perskaityti saugomos konfigūracijos, naudojamas tuščias objektas.', error);
      return {};
    }
  };

  return {
    load() {
      try {
        return safeParse(window.localStorage.getItem(key));
      } catch (error) {
        console.warn('localStorage neprieinamas, grįžtama į tuščią konfigūraciją.', error);
        return {};
      }
    },
    save(value = {}) {
      try {
        const payload = JSON.stringify(value || {});
        window.localStorage.setItem(key, payload);
        return true;
      } catch (error) {
        console.warn('Nepavyko įrašyti konfigūracijos.', error);
        return false;
      }
    },
    clear() {
      try {
        window.localStorage.removeItem(key);
        return true;
      } catch (error) {
        console.warn('Nepavyko išvalyti konfigūracijos.', error);
        return false;
      }
    },
  };
}
