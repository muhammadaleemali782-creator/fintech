// Common helper: amount hamesha ek positive, finite number honi chahiye
// Isse negative amount, NaN, Infinity, ya string-based tricks block ho jate hai
function isValidAmount(amount, min = 1, max = 1000000) {
  return (
    typeof amount === 'number' &&
    Number.isFinite(amount) &&
    amount >= min &&
    amount <= max
  );
}

// Loan tenure ke liye: positive integer, reasonable range (1 se 60 months)
function isValidTenure(tenure) {
  return (
    Number.isInteger(tenure) &&
    tenure >= 1 &&
    tenure <= 60
  );
}

module.exports = { isValidAmount, isValidTenure };
