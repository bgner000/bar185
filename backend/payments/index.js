const { chargeDeposit } = require('./providers/deposit');

// Single source of truth for the deposit amount -- referenced by
// server.js when creating a deposit-secured booking. AUD-only site, so no
// currency configuration beyond this constant.
const DEPOSIT_AMOUNT_CENTS = 1000; // A$10
const DEPOSIT_CURRENCY = 'AUD';

module.exports = {
  chargeDeposit,
  DEPOSIT_AMOUNT_CENTS,
  DEPOSIT_CURRENCY,
};
