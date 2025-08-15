/**
 * Date utility functions for consistent timezone handling
 * Uses local timezone instead of UTC to fix date mismatch issues
 */

/**
 * Convert date to YYYY-MM-DD format using local timezone
 * @param {Date|string} d - Date object or date string
 * @returns {string} Date in YYYY-MM-DD format
 */
function ymd(d = new Date()) {
  const date = new Date(d);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Get today's date in YYYY-MM-DD format using local timezone
 * @returns {string} Today's date in YYYY-MM-DD format
 */
function today() {
  return ymd(new Date());
}

/**
 * Get yesterday's date in YYYY-MM-DD format using local timezone
 * @returns {string} Yesterday's date in YYYY-MM-DD format
 */
function yesterday() {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  return ymd(date);
}

/**
 * Get tomorrow's date in YYYY-MM-DD format using local timezone
 * @returns {string} Tomorrow's date in YYYY-MM-DD format
 */
function tomorrow() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return ymd(date);
}

/**
 * Add days to a date
 * @param {Date|string} d - Starting date
 * @param {number} days - Number of days to add (can be negative)
 * @returns {string} Resulting date in YYYY-MM-DD format
 */
function addDays(d, days) {
  const date = new Date(d);
  date.setDate(date.getDate() + days);
  return ymd(date);
}

/**
 * Get first day of month
 * @param {Date|string} d - Date in the month
 * @returns {string} First day of month in YYYY-MM-DD format
 */
function firstOfMonth(d = new Date()) {
  const date = new Date(d);
  date.setDate(1);
  return ymd(date);
}

/**
 * Get last day of month
 * @param {Date|string} d - Date in the month
 * @returns {string} Last day of month in YYYY-MM-DD format
 */
function lastOfMonth(d = new Date()) {
  const date = new Date(d);
  date.setMonth(date.getMonth() + 1);
  date.setDate(0);
  return ymd(date);
}

/**
 * Check if a date string is valid YYYY-MM-DD format
 * @param {string} dateStr - Date string to validate
 * @returns {boolean} True if valid format
 */
function isValidDate(dateStr) {
  if (typeof dateStr !== 'string') return false;
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  
  const [, year, month, day] = match;
  const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
  
  return date.getFullYear() === parseInt(year) &&
         date.getMonth() === parseInt(month) - 1 &&
         date.getDate() === parseInt(day);
}

/**
 * Get current time in HH:MM format using local timezone
 * @returns {string} Current time in HH:MM format
 */
function currentTime() {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

module.exports = {
  ymd,
  today,
  yesterday,
  tomorrow,
  addDays,
  firstOfMonth,
  lastOfMonth,
  isValidDate,
  currentTime
};
