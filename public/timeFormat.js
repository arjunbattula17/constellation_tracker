function formatRelativeTime(ms) {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 1) return "just now";
  if (seconds === 1) return "1 second ago";
  if (seconds < 60) return `${seconds} seconds ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes === 1) return "1 minute ago";
  return `${minutes} minutes ago`;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { formatRelativeTime };
}
