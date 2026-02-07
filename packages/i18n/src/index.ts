import * as Localization from 'expo-localization';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './locales/en/translation.json';
import it from './locales/it/translation.json';

const resources = {
  en: { translation: en },
  it: { translation: it },
};

type SupportedLanguage = keyof typeof resources;

const getDeviceLanguage = (): SupportedLanguage => {
  try {
    const locales = Localization.getLocales();
    const locale = locales[0];
    const langCode = locale?.languageCode ?? 'en';
    return langCode in resources ? (langCode as SupportedLanguage) : 'en';
  } catch {
    return 'en';
  }
};

i18n.use(initReactI18next).init({
  resources,
  lng: getDeviceLanguage(),
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false,
  },
  react: {
    useSuspense: false,
  },
});

export default i18n;
export const changeLanguage = (lng: SupportedLanguage) => i18n.changeLanguage(lng);
export { useTranslation } from 'react-i18next';
export type { SupportedLanguage };
