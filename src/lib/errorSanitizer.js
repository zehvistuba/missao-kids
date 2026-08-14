const EMAIL_ADDRESS = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;
const JWT = /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}(?:\.[A-Za-z0-9_-]{10,})?\b/g;
const LONG_TOKEN = /\b[A-Za-z0-9_-]{32,}\b/g;
const PAYMENT_CARD = /\b(?:\d[ -]*?){13,19}\b/g;
const BRAZILIAN_DOCUMENT = /\b\d{3}[.\s-]?\d{3}[.\s-]?\d{3}[-.\s]?\d{2}\b/g;
const PHONE_NUMBER = /(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{2}\)?[\s.-]?)?\d{4,5}[\s.-]?\d{4}\b/g;
const LONG_NUMBER = /\b\d{6,}\b/g;
const URL_QUERY = /(https?:\/\/[^\s?]+)\?[^\s]+/gi;

export function sanitizeErrorText(value, maxLength = 500) {
  const withoutControlCharacters = Array.from(String(value ?? ""), (character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127 ? " " : character;
  }).join("");

  return withoutControlCharacters
    .replace(URL_QUERY, "$1?[redacted]")
    .replace(EMAIL_ADDRESS, "[email]")
    .replace(UUID, "[id]")
    .replace(JWT, "[token]")
    .replace(LONG_TOKEN, "[token]")
    .replace(PAYMENT_CARD, "[payment]")
    .replace(BRAZILIAN_DOCUMENT, "[document]")
    .replace(PHONE_NUMBER, "[phone]")
    .replace(LONG_NUMBER, "[number]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

export function normalizeReportField(value, maxLength = 80) {
  return sanitizeErrorText(value, maxLength)
    .toLowerCase()
    .replace(/[^a-z0-9._:/-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, maxLength);
}

function fnv1a(value, seed) {
  let hash = seed >>> 0;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function createReportKey(parts) {
  const input = parts
    .map((part) => sanitizeErrorText(part, 800).toLowerCase())
    .filter(Boolean)
    .join("|");
  return `${fnv1a(input, 0x811c9dc5)}${fnv1a(input, 0x9e3779b9)}`;
}
