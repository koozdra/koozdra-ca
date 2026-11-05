// Matches Chart.js text and grid colours to the site's light or dark theme.
// Load it right after chart.js and before the page's own chart code.
if (window.Chart) {
  const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  Chart.defaults.color = dark ? "#9c9cab" : "#5d5d68";
  Chart.defaults.borderColor = dark ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.08)";
  Chart.defaults.font.family = "Inter, ui-sans-serif, system-ui, sans-serif";
}
