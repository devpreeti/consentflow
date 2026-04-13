let currentLang = 'en';

export function setLang(lang) {
  currentLang = lang || 'en';
}

export function getLang() {
  return currentLang;
}
