(function () {
  const moreBtn = document.getElementById("moreBtn");
  const moreMenu = document.getElementById("moreMenu");
  if (moreBtn && moreMenu) {
    moreBtn.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      moreMenu.classList.toggle("open");
    });
    moreMenu.addEventListener("click", function (e) {
      e.stopPropagation();
    });
    document.addEventListener("click", function (e) {
      if (!e.target.closest(".more-wrap")) moreMenu.classList.remove("open");
    });
  }

  const sheetBtn = document.getElementById("sheetToggle");
  const sheet = document.getElementById("sheet");
  if (!sheetBtn) return;

  function syncArrow() {
    const closed = document.body.classList.contains("sheet-closed");
    sheetBtn.textContent = closed ? "▲" : "▼";
    sheetBtn.setAttribute("aria-label", closed ? "Open list" : "Close list");
    setTimeout(function () {
      if (typeof map !== "undefined" && map && map.invalidateSize) map.invalidateSize();
    }, 280);
  }

  sheetBtn.addEventListener("click", function (e) {
    e.preventDefault();
    e.stopPropagation();
    document.body.classList.toggle("sheet-closed");
    syncArrow();
  });

  syncArrow();
})();
