// Applies the saved theme before first paint (external file: the CSP forbids inline scripts).
(function () {
  try {
    var saved = localStorage.getItem("ys-theme");
    var dark = saved === "dark" || ((!saved || saved === "system") && matchMedia("(prefers-color-scheme: dark)").matches);
    if (dark) document.documentElement.classList.add("dark");
  } catch (e) {}
})();
