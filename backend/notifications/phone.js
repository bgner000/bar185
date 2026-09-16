// Normalises common Australian mobile formats to E.164 (+61...) for SMS.
// Never guesses: anything that isn't clearly a valid AU mobile returns null
// rather than being coerced into one.
function normalizeAuMobile(rawInput) {
  if (typeof rawInput !== 'string') return null;

  const cleaned = rawInput.replace(/[\s-]/g, '');

  if (/^\+614\d{8}$/.test(cleaned)) {
    return cleaned;
  }

  if (/^614\d{8}$/.test(cleaned)) {
    return `+${cleaned}`;
  }

  if (/^04\d{8}$/.test(cleaned)) {
    return `+61${cleaned.slice(1)}`;
  }

  return null;
}

module.exports = { normalizeAuMobile };
