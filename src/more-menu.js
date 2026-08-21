(function () {
  const btn = document.getElementById("moreBtn");
  const menu = document.getElementById("moreMenu");
  if (!btn || !menu) return;
  function toggle(e) {
    e.preventDefault();
    e.stopPropagation();
    menu.classList.toggle("open");
  }
  btn.addEventListener("click", toggle);
  btn.addEventListener("touchend", toggle, { passive: false });
  menu.addEventListener("click", function (e) { e.stopPropagation(); });
  document.addEventListener("click", function (e) {
    if (!e.target.closest(".more-wrap")) menu.classList.remove("open");
  });
})();
