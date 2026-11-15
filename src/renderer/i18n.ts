import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import ar from './locales/ar.json'
import en from './locales/en.json'
import fr from './locales/fr.json'

const savedLanguage = window.localStorage.getItem('planning-ofppt-language')
const initialLanguage =
  savedLanguage === 'en' || savedLanguage === 'ar' ? savedLanguage : 'fr'

void i18n.use(initReactI18next).init({
  resources: {
    fr: { translation: fr },
    en: { translation: en },
    ar: { translation: ar },
  },
  lng: initialLanguage,
  fallbackLng: 'fr',
  interpolation: {
    escapeValue: false,
  },
})

export default i18n
