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

(function () {
  const KEY = "dnd-notify-on";
  const SEEN = "dnd-seen-games";
  const notifyBtn = document.getElementById("notifyBtn");

  function on() {
    return localStorage.getItem(KEY) === "1";
  }
  function setLabel() {
    if (notifyBtn) notifyBtn.textContent = "Notify new tables: " + (on() ? "on" : "off");
  }
  setLabel();

  if (notifyBtn) {
    notifyBtn.onclick = async function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (!on()) {
        if (window.Notification && Notification.permission !== "granted") {
          await Notification.requestPermission();
        }
        localStorage.setItem(KEY, "1");
      } else {
        localStorage.setItem(KEY, "0");
      }
      setLabel();
    };
  }

  function seen() {
    try { return JSON.parse(localStorage.getItem(SEEN) || "[]"); } catch (e) { return []; }
  }
  function saveSeen(ids) {
    localStorage.setItem(SEEN, JSON.stringify(ids.slice(-200)));
  }

  function ping(title, body) {
    if (window.Notification && Notification.permission === "granted") {
      try { new Notification(title, { body: body || "A table opened near you." }); } catch (e) {}
    }
  }

  const _render = window.render;
  if (typeof _render === "function") {
    window.render = function () {
      const result = _render.apply(this, arguments);
      try {
        if (!on() || typeof games === "undefined") return result;
        const old = seen();
        const ids = (games || []).map(function (g) { return String(g.id); });
        if (old.length === 0) {
          saveSeen(ids);
          return result;
        }
        (games || []).forEach(function (g) {
          if (old.indexOf(String(g.id)) !== -1) return;
          if (currentUser && g.user_id === currentUser.id) return;
          const title = g.title || "New table";
          const miles = (typeof g.distance === "number") ? (g.distance.toFixed(1) + " mi") : "";
          ping("D&D Local: " + title, [g.system, g.date, miles].filter(Boolean).join(" · "));
        });
        saveSeen(ids);
      } catch (e) {}
      return result;
    };
  }
})();
