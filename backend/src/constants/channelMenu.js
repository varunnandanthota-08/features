const CHANNEL_MENU_OPTIONS = Object.freeze({
  TELUGU: '1',
  HINDI: '2',
  ENGLISH: '3',
  SUPPORT: '4',
  EMERGENCY: '5'
});

const LANGUAGE_BY_OPTION = Object.freeze({
  [CHANNEL_MENU_OPTIONS.TELUGU]: 'te',
  [CHANNEL_MENU_OPTIONS.HINDI]: 'hi',
  [CHANNEL_MENU_OPTIONS.ENGLISH]: 'en'
});

function languageForMenuOption(value) {
  return LANGUAGE_BY_OPTION[String(value).trim()] || null;
}

function isMenuOption(value, option) {
  return String(value).trim() === option;
}

module.exports = {
  CHANNEL_MENU_OPTIONS,
  LANGUAGE_BY_OPTION,
  languageForMenuOption,
  isMenuOption
};
