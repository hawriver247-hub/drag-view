import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  { auth: { persistSession: true, autoRefreshToken: true } }
);

let currentUser = null;
let editingId = null;

async function refreshUser() {
  const { data } = await supabase.auth.getUser();
  currentUser = data.user || null;
  const label = document.getElementById("userLabel");
  const authBtn = document.getElementById("authBtn");
  if (currentUser) {
    const me = profiles.find(function (x) { return x.id === currentUser.id; });
    label.textContent = me ? me.display_name : currentUser.email;
    authBtn.textContent = "Sign out";
    const meAdmin = profiles.find(function (x) { return x.id === currentUser.id; });
    isAdmin = !!(meAdmin && meAdmin.is_admin);
    if (meAdmin && meAdmin.is_banned) {
      alert("This account has been hidden.");
      supabase.auth.signOut();
    }
    const nameBtn = document.getElementById("nameBtn");
    if (nameBtn) nameBtn.style.display = "";
    const handle = currentUser.email.split("@")[0];
    supabase.from("profiles").upsert({ id: currentUser.id, display_name: handle });
  } else {
    label.textContent = "";
    authBtn.textContent = "Sign in";
    isAdmin = false;
    const nameBtnOff = document.getElementById("nameBtn");
    if (nameBtnOff) nameBtnOff.style.display = "none";
  }
}

const authDialog = document.getElementById("authDialog");
document.getElementById("authBtn").onclick = async function () {
  if (currentUser) {
    await supabase.auth.signOut();
    await supabase.auth.onAuthStateChange(function (_event, session) {
  currentUser = session && session.user ? session.user : null;
  refreshUser();
});
refreshUser();
    return;
  }
  document.getElementById("authForm").reset();
  authDialog.show();
};
document.getElementById("cancelAuth").onclick = function () { authDialog.close(); };

document.getElementById("signInBtn").onclick = async function (e) {
  e.preventDefault();
  const fd = new FormData(document.getElementById("authForm"));
  const { error } = await supabase.auth.signInWithPassword({
    email: String(fd.get("email")),
    password: String(fd.get("password"))
  });
  if (error) return alert(error.message);
  authDialog.close();
  await refreshUser();
};

document.getElementById("signUpBtn").onclick = async function () {
  const fd = new FormData(document.getElementById("authForm"));
  const { error } = await supabase.auth.signUp({
    email: String(fd.get("email")),
    password: String(fd.get("password"))
  });
  if (error) return alert(error.message);
  alert("Account created. Check your email and confirm, then sign in.");
};




function todayStr() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return d.getFullYear() + "-" + m + "-" + day;
}

function escapeHtml(str) {
  return String(str || "").replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}

let games = [];
let ratings = [];
let profiles = [];
let isAdmin = false;
let userPos = { lat: 35.7235, lng: -79.4625 };
let pendingPin = null;
let markers = [];

const map = L.map("map").setView([userPos.lat, userPos.lng], 10);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "&copy; OpenStreetMap",
  maxZoom: 19
}).addTo(map);

const youIcon = L.divIcon({
  className: "",
  html: '<div style="width:14px;height:14px;background:#4ea3ff;border:2px solid #fff;border-radius:50%"></div>',
  iconSize: [14, 14]
});
const gameIcon = L.divIcon({
  className: "",
  html: '<div style="font-size:22px;line-height:22px">d</div>',
  iconSize: [22, 22],
  iconAnchor: [11, 11]
});

const youMarker = L.marker([userPos.lat, userPos.lng], { icon: youIcon }).addTo(map).bindPopup("You (approx)");

function milesBetween(a, b) {
  const toRad = function (n) { return (n * Math.PI) / 180; };
  const R = 3958.8;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * R * Math.asin(Math.sqrt(s));
}

function filteredGames() {
  const system = document.getElementById("filterSystem").value;
  const miles = Number(document.getElementById("filterMiles").value);
  const showFull = document.getElementById("showFull") && document.getElementById("showFull").checked;
  return games
    .filter(function (g) { return !system || g.system === system; })
    .filter(function (g) {
      if (isAdmin) return true;
      const host = profiles.find(function (p) { return p.id === g.user_id; });
      return !(host && host.is_banned);
    })
    .filter(function (g) {
      const box = document.getElementById("gameSearch");
      const q = box && box.value ? box.value.trim().toLowerCase() : "";
      if (!q) return true;
      return String(g.title || "").toLowerCase().includes(q);
    })
    .filter(function (g) {
      const box = document.getElementById("playerSearch");
      const q = box && box.value ? box.value.trim().toLowerCase() : "";
      if (!q) return true;
      const names = [nameOf(g.user_id)];
      (g.game_players || []).forEach(function (p) { names.push(nameOf(p.user_id)); });
      return names.some(function (n) { return String(n).toLowerCase().includes(q); });
    })
    .filter(function (g) { return showFull || !g.is_full || isJoined(g); })
    .filter(function (g) {
      const showPast = document.getElementById("showPast") && document.getElementById("showPast").checked;
      return showPast || !g.is_complete || isJoined(g);
    })
    .map(function (g) { return Object.assign({}, g, { distance: milesBetween(userPos, g) }); })
    .filter(function (g) { return g.distance <= miles; })
    .sort(function (a, b) { return a.distance - b.distance; });
}

function popupHtml(g) {
  return "<h3>" + escapeHtml(g.title) + "</h3>" +
    "<p><b>" + escapeHtml(g.system) + "</b> · " + escapeHtml(g.date) + " " + escapeHtml(g.time) + "</p>" +
    "<p>" + escapeHtml(g.location) + "</p>" +
    "<p>Levels " + escapeHtml(g.levels || "any") + " · " + g.seats + " seat(s)" + (g.is_full ? " · FULL" : "") + "</p>" +
    "<p>" + escapeHtml(g.notes || "") + "</p>" +
    "<p><b>Join:</b> " + escapeHtml(g.contact) + "</p>";
}

function render() {
  const list = filteredGames();
  markers.forEach(function (m) { map.removeLayer(m); });
  markers = [];
  const listEl = document.getElementById("gameList");
  listEl.innerHTML = list.length ? "" : '<p class="hint" style="padding:0.5rem">No games in range. Host one.</p>';
  list.forEach(function (g) {
    const marker = L.marker([g.lat, g.lng], { icon: gameIcon }).addTo(map).bindPopup(popupHtml(g));
    markers.push(marker);
    const card = document.createElement("article");
    card.className = "card";
        const hostRate = avgFor(g.user_id);
    const rateText = hostRate ? (" · " + hostRate.avg.toFixed(1) + "★ (" + hostRate.n + ")") : "";
    card.innerHTML = "<h3>" + escapeHtml(g.title) + (g.is_complete ? " (DONE)" : g.is_full ? " (FULL)" : "") + "</h3>" +
      '<p class="meta">' + escapeHtml(g.system) + " · " + g.distance.toFixed(1) + " mi" + rateText + "</p>" +
      "<p>" + escapeHtml(g.date) + " " + escapeHtml(g.time) + " · " + playerCount(g) + "/" + g.seats + " seats" + (isJoined(g) ? " · Joined" : "") + "</p>" +
      "<p>" + escapeHtml(g.location) + "</p>";
    if (currentUser && g.user_id === currentUser.id) {
      card.innerHTML += g.is_full
        ? ('<p><button type="button" class="edit-game">Edit</button> <button type="button" class="reopen-game">Reopen</button> ' +
           (g.is_complete
             ? '<button type="button" class="reopen-complete">Reopen game</button> '
             : '<button type="button" class="complete-game">Game complete</button> ') +
           '<button type="button" class="delete-game">Delete</button></p>')
        : ('<p><button type="button" class="edit-game">Edit</button> <button type="button" class="full-game">Mark full</button> ' +
           (g.is_complete
             ? '<button type="button" class="reopen-complete">Reopen game</button> '
             : '<button type="button" class="complete-game">Game complete</button> ') +
           '<button type="button" class="delete-game">Delete</button></p>');
    } else if (currentUser && isJoined(g)) {
      const mine = myRatingFor(g.user_id);
      card.innerHTML += '<p><button type="button" class="leave-game">Leave</button> <button type="button" class="report-game">Report</button></p>';
      card.innerHTML += rateBlock(g);
      card.innerHTML += '<p class="rate-row">Rate host ' +
        [1,2,3,4,5].map(function (n) {
          return '<button type="button" class="rate-host" data-score="' + n + '">' + (mine >= n ? "★" : "☆") + "</button>";
        }).join("") + "</p>";
    } else if (!g.is_full) {
      card.innerHTML += '<p><button type="button" class="join-game">Join</button> <button type="button" class="report-game">Report</button></p>';
    }
    card.onclick = function (e) {
      const cls = e.target && e.target.classList;
      if (cls && cls.contains("rate-person")) {
        ratePerson(e.target.getAttribute("data-user"), g.id, Number(e.target.getAttribute("data-score")));
        return;
      }
      if (cls && cls.contains("rate-host")) {
        ratePerson(g.user_id, g.id, Number(e.target.getAttribute("data-score")));
        return;
      }
      if (cls && cls.contains("admin-delete-game")) {
        deleteGame(g.id);
        return;
      }
      if (cls && cls.contains("admin-ban-host")) {
        banUser(g.user_id);
        return;
      }
      if (cls && cls.contains("join-game")) {
        joinGame(g.id);
        return;
      }
      if (cls && cls.contains("leave-game")) {
        leaveGame(g.id);
        return;
      }
      if (cls && cls.contains("edit-game")) {
        startEdit(g);
        return;
      }
      if (cls && cls.contains("delete-game")) {
        deleteGame(g.id);
        return;
      }
      if (cls && cls.contains("complete-game")) {
        toggleComplete(g.id, true);
        return;
      }
      if (cls && cls.contains("reopen-complete")) {
        toggleComplete(g.id, false);
        return;
      }
      if (cls && cls.contains("full-game")) {
        toggleFull(g.id, true);
        return;
      }
      if (cls && cls.contains("reopen-game")) {
        toggleFull(g.id, false);
        return;
      }
      map.setView([g.lat, g.lng], 13);
      marker.openPopup();
    };
    
    if (isAdmin) {
      card.innerHTML += '<p><button type="button" class="admin-delete-game">Admin delete</button> <button type="button" class="admin-ban-host">Hide user</button></p>';
    }
    listEl.appendChild(card);
  });
}

async function loadGames() {
  await supabase.rpc("cleanup_old_games");
  let query = supabase.from("games").select("*, game_players(user_id)").order("date");
  const showPastEl = document.getElementById("showPast");
  const showPast = showPastEl && showPastEl.checked;
  if (!showPast) query = query.gte("date", todayStr());
  const { data, error } = await query;
  if (error) {
    console.error(error);
    alert("Could not load games: " + error.message);
    games = [];
  } else {
    games = data || [];
  }
  const rateRes = await supabase.from("ratings").select("rater_id, ratee_id, score");
  ratings = rateRes.data || [];
  const profRes = await supabase.from("profiles").select("id, display_name, is_admin, is_banned");
  profiles = profRes.data || [];
  render();
}







function nameOf(userId) {
  const hit = profiles.find(function (p) { return p.id === userId; });
  return hit ? hit.display_name : "Player";
}
function otherPeople(g) {
  const ids = {};
  if (g.user_id) ids[g.user_id] = true;
  (g.game_players || []).forEach(function (p) { ids[p.user_id] = true; });
  return Object.keys(ids).filter(function (id) { return currentUser && id !== currentUser.id; });
}
function starsHtml(userId) {
  const mine = myRatingFor(userId);
  return [1, 2, 3, 4, 5].map(function (n) {
    return '<button type="button" class="rate-person" data-user="' + userId + '" data-score="' + n + '">' + (mine >= n ? "★" : "☆") + "</button>";
  }).join("");
}
function rateBlock(g) {
  return otherPeople(g).map(function (id) {
    const tag = id === g.user_id ? " (host)" : "";
    return "<p>Rate " + escapeHtml(nameOf(id)) + tag + " " + starsHtml(id) + "</p>";
  }).join("");
}
function avgFor(userId) {
  const list = ratings.filter(function (r) { return r.ratee_id === userId; });
  if (!list.length) return null;
  let sum = 0;
  list.forEach(function (r) { sum += r.score; });
  return { avg: sum / list.length, n: list.length };
}

function myRatingFor(userId) {
  if (!currentUser) return 0;
  const hit = ratings.find(function (r) { return r.rater_id === currentUser.id && r.ratee_id === userId; });
  return hit ? hit.score : 0;
}

async function ratePerson(userId, gameId, score) {
  if (!currentUser) {
    authDialog.show();
    return;
  }
  if (userId === currentUser.id) return alert("You cannot rate yourself.");
  const { error } = await supabase.from("ratings").upsert({
    rater_id: currentUser.id,
    ratee_id: userId,
    game_id: gameId,
    score: score
  });
  if (error) return alert(error.message);
  await loadGames();
}

function isJoined(g) {
  if (!currentUser) return false;
  if (g.user_id === currentUser.id) return true;
  return (g.game_players || []).some(function (p) { return p.user_id === currentUser.id; });
}

function playerCount(g) {
  const ids = {};
  if (g.user_id) ids[g.user_id] = true;
  (g.game_players || []).forEach(function (p) { ids[p.user_id] = true; });
  return Object.keys(ids).length;
}

async function joinGame(id) {
  if (!currentUser) {
    authDialog.show();
    return;
  }
  const { error } = await supabase.from("game_players").insert({ game_id: id, user_id: currentUser.id });
  if (error) return alert(error.message);
  await loadGames();
}

async function leaveGame(id) {
  if (!currentUser) return;
  const { error } = await supabase.from("game_players").delete().eq("game_id", id).eq("user_id", currentUser.id);
  if (error) return alert(error.message);
  await loadGames();
}

function startEdit(g) {
  editingId = g.id;
  const f = document.getElementById("hostForm");
  f.title.value = g.title || "";
  f.system.value = g.system || "5e";
  f.date.value = String(g.date || "").slice(0, 10);
  f.time.value = g.time || "";
  f.levels.value = g.levels || "";
  f.seats.value = g.seats || 3;
  f.location.value = g.location || "";
  f.lat.value = g.lat;
  f.lng.value = g.lng;
  f.contact.value = g.contact || "";
  f.notes.value = g.notes || "";
  if (pendingPin) pendingPin.remove();
  pendingPin = L.marker([g.lat, g.lng]).addTo(map);
  dialog.show();
}


async function toggleComplete(id, done) {
  const { error } = await supabase.from("games").update({ is_complete: done, completed_at: done ? new Date().toISOString() : null }).eq("id", id);
  if (error) return alert(error.message);
  await loadGames();
}

async function toggleFull(id, isFull) {
  const { error } = await supabase.from("games").update({ is_full: isFull }).eq("id", id);
  if (error) return alert(error.message);
  await loadGames();
}

async function deleteGame(id) {
  if (!confirm("Delete this game?")) return;
  const { error } = await supabase.from("games").delete().eq("id", id);
  if (error) return alert(error.message);
  await loadGames();
}


async function goToPlace() {
  const q = document.getElementById("placeSearch").value.trim();
  if (!q) return alert("Type a city or zip.");
  const res = await fetch("https://photon.komoot.io/api/?limit=1&q=" + encodeURIComponent(q));
  const data = await res.json();
  const hit = data.features && data.features[0];
  if (!hit) return alert("Could not find that place.");
  const lng = hit.geometry.coordinates[0];
  const lat = hit.geometry.coordinates[1];
  setUserPos(lat, lng);
}

function setUserPos(lat, lng) {
  userPos = { lat: lat, lng: lng };
  youMarker.setLatLng([lat, lng]);
  map.setView([lat, lng], 11);
  render();
}

document.getElementById("locateBtn").onclick = function () {
  if (!navigator.geolocation) return alert("Geolocation not available");
  navigator.geolocation.getCurrentPosition(
    function (pos) { setUserPos(pos.coords.latitude, pos.coords.longitude); },
    function () { alert("Could not get location. Click the map instead."); }
  );
};


const nameDialog = document.getElementById("nameDialog");
if (document.getElementById("nameBtn")) {
  document.getElementById("nameBtn").onclick = function () {
    if (!currentUser) {
      authDialog.show();
      return;
    }
    const me = profiles.find(function (x) { return x.id === currentUser.id; });
    const form = document.getElementById("nameForm");
    form.display_name.value = me ? me.display_name : currentUser.email.split("@")[0];
    nameDialog.show();
  };
}
if (document.getElementById("cancelName")) {
  document.getElementById("cancelName").onclick = function () { nameDialog.close(); };
}
if (document.getElementById("saveName")) {
  document.getElementById("saveName").onclick = async function (e) {
    e.preventDefault();
    if (!currentUser) return;
    const name = String(new FormData(document.getElementById("nameForm")).get("display_name") || "").trim();
    if (!name) return alert("Enter a name.");
    const { error } = await supabase.from("profiles").upsert({ id: currentUser.id, display_name: name });
    if (error) return alert(error.message);
    nameDialog.close();
    await loadGames();
    await refreshUser();
  };
}


function setSearchMode(mode) {
  const gameWrap = document.getElementById("gameSearchWrap");
  const playerWrap = document.getElementById("playerSearchWrap");
  const gameBtn = document.getElementById("searchModeGame");
  const playerBtn = document.getElementById("searchModePlayer");
  const isGame = mode === "game";
  if (gameWrap) gameWrap.hidden = !isGame;
  if (playerWrap) playerWrap.hidden = isGame;
  if (gameBtn) gameBtn.classList.toggle("on", isGame);
  if (playerBtn) playerBtn.classList.toggle("on", !isGame);
  if (isGame) {
    const ps = document.getElementById("playerSearch");
    if (ps) ps.value = "";
    if (typeof renderPlayers === "function") renderPlayers();
  } else {
    const gs = document.getElementById("gameSearch");
    if (gs) gs.value = "";
  }
  render();
}

function renderPlayers() {
  const box = document.getElementById("playerResults");
  if (!box) return;
  const q = (document.getElementById("playerSearch") && document.getElementById("playerSearch").value || "").trim().toLowerCase();
  if (!q) {
    box.innerHTML = "";
    return;
  }
  const hits = profiles.filter(function (p) {
    return String(p.display_name || "").toLowerCase().includes(q);
  });
  box.innerHTML = hits.length
    ? hits.map(function (p) {
        const a = avgFor(p.id);
        return "<p><b>" + escapeHtml(p.display_name) + "</b> " + (a ? a.avg.toFixed(1) + "★ (" + a.n + ")" : "no ratings") + "</p>";
      }).join("")
    : "<p class=\"hint\">No players by that name.</p>";
}

const dialog = document.getElementById("hostDialog");
const form = document.getElementById("hostForm");

document.getElementById("hostBtn").onclick = function () {
  if (!currentUser) {
    authDialog.show();
    return;
  }
  editingId = null;
  pendingPin = null;
  form.reset();
  document.getElementById("latInput").value = "";
  document.getElementById("lngInput").value = "";
  dialog.show();
};
document.getElementById("cancelHost").onclick = function () { dialog.close(); };

map.on("click", function (e) {
  if (dialog.open) {
    if (pendingPin) pendingPin.remove();
    pendingPin = L.marker(e.latlng).addTo(map);
    document.getElementById("latInput").value = e.latlng.lat.toFixed(5);
    document.getElementById("lngInput").value = e.latlng.lng.toFixed(5);
    return;
  }
  setUserPos(e.latlng.lat, e.latlng.lng);
});

form.addEventListener("submit", async function (e) {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(form).entries());
  if (!data.lat || !data.lng) {
    alert("Click the map to set the location pin.");
    return;
  }
  const row = {
    title: data.title,
    system: data.system,
    date: data.date,
    time: data.time,
    levels: data.levels,
    seats: Number(data.seats),
    location: data.location,
    lat: Number(data.lat),
    lng: Number(data.lng),
    contact: data.contact,
    notes: data.notes,
    user_id: currentUser.id
  };
  let error;
  if (editingId) {
    const upd = Object.assign({}, row);
    delete upd.user_id;
    const res = await supabase.from("games").update(upd).eq("id", editingId);
    error = res.error;
  } else {
    const res = await supabase.from("games").insert(row).select("id").single();
    error = res.error;
    if (!error && res.data) {
      await supabase.from("game_players").insert({ game_id: res.data.id, user_id: currentUser.id });
    }
  }
  if (error) {
    alert("Could not save: " + error.message);
    return;
  }
  editingId = null;
  if (pendingPin) pendingPin.remove();
  dialog.close();
  await loadGames();
});


document.getElementById("placeBtn").onclick = goToPlace;
document.getElementById("placeSearch").addEventListener("keydown", function (e) {
  if (e.key === "Enter") {
    e.preventDefault();
    goToPlace();
  }
});

if (document.getElementById("showPast")) {
  document.getElementById("showPast").onchange = loadGames;
}
if (document.getElementById("showFull")) {
  document.getElementById("showFull").onchange = render;
}
if (document.getElementById("refreshBtn")) {
  document.getElementById("refreshBtn").onclick = function () { loadGames(); };
}

if (document.getElementById("playerSearch")) {
  document.getElementById("playerSearch").addEventListener("input", function () {
    renderPlayers();
    render();
  });
}

if (document.getElementById("gameSearch")) {
  document.getElementById("gameSearch").addEventListener("input", render);
}
setSearchMode("game");
document.getElementById("filterSystem").onchange = render;
document.getElementById("filterMiles").onchange = render;
loadGames();

/* search-switch-final */


document.getElementById("searchModeGame").onclick = function () {
  document.getElementById("gameSearchWrap").hidden = false;
  document.getElementById("playerSearchWrap").hidden = true;
  document.getElementById("searchModeGame").classList.add("on");
  document.getElementById("searchModePlayer").classList.remove("on");
  document.getElementById("playerSearch").value = "";
  if (typeof renderPlayers === "function") renderPlayers();
  render();
};
document.getElementById("searchModePlayer").onclick = function () {
  document.getElementById("gameSearchWrap").hidden = true;
  document.getElementById("playerSearchWrap").hidden = false;
  document.getElementById("searchModePlayer").classList.add("on");
  document.getElementById("searchModeGame").classList.remove("on");
  document.getElementById("gameSearch").value = "";
  render();
};
document.getElementById("gameSearchWrap").hidden = false;
document.getElementById("playerSearchWrap").hidden = true;


async function loadReports() {
  const box = document.getElementById("reportList");
  if (!box) return;
  const { data, error } = await supabase.from("reports").select("*").order("created_at", { ascending: false }).limit(50);
  if (error) {
    box.innerHTML = "<p class='hint'>" + escapeHtml(error.message) + "</p>";
    return;
  }
  const rows = data || [];
  box.innerHTML = rows.length ? rows.map(function (r) {
    const who = nameOf(r.user_id);
    const when = String(r.created_at || "").slice(0, 16).replace("T", " ");
    return "<article class='card'><h3>" + escapeHtml(r.kind) + "</h3><p class='meta'>" + escapeHtml(who) + " · " + escapeHtml(when) + "</p><p>" + escapeHtml(r.message) + "</p>" + (isAdmin ? "<p><button type='button' class='admin-delete-report' data-id='" + r.id + "'>Delete</button> " + (r.target_user_id ? "<button type='button' class='admin-ban-target' data-user='" + r.target_user_id + "'>Hide user</button>" : "") + (r.game_id ? " <button type='button' class='admin-delete-listed' data-game='" + r.game_id + "'>Delete table</button>" : "") + "</p>" : "") + "</article>";
  }).join("") : "<p class='hint'>No reports yet.</p>";
}

const reportDialog = document.getElementById("reportDialog");
if (document.getElementById("reportBtn")) {
  document.getElementById("reportBtn").onclick = async function () {
    await loadReports();
    reportDialog.show();
  };
}
if (document.getElementById("cancelReport")) {
  document.getElementById("cancelReport").onclick = function () { reportDialog.close(); };
}
if (document.getElementById("sendReport")) {
  document.getElementById("sendReport").onclick = async function (e) {
    e.preventDefault();
    if (!currentUser) {
      reportDialog.close();
      authDialog.show();
      return;
    }
    const fd = new FormData(document.getElementById("reportForm"));
    const message = String(fd.get("message") || "").trim();
    if (!message) return alert("Write a message.");
    const { error } = await supabase.from("reports").insert({
      user_id: currentUser.id,
      kind: String(fd.get("kind") || "bug"),
      message: message,
      game_id: String(fd.get("game_id") || "") || null,
      target_user_id: String(fd.get("target_user_id") || "") || null
    });
    if (error) return alert(error.message);
    document.getElementById("reportForm").reset();
    await loadReports();
  };
}



async function banUser(userId) {
  if (!isAdmin) return;
  if (!confirm("Hide this user and their tables?")) return;
  const { error } = await supabase.from("profiles").update({ is_banned: true }).eq("id", userId);
  if (error) return alert(error.message);
  await loadGames();
}



async function deleteReport(id) {
  const { error } = await supabase.from("reports").delete().eq("id", id);
  if (error) return alert(error.message);
  await loadReports();
}
document.getElementById("reportList") && document.getElementById("reportList").addEventListener("click", function (e) {
  if (e.target && e.target.classList.contains("admin-delete-report")) {
    deleteReport(e.target.getAttribute("data-id"));
  }
});


const dropPage = document.getElementById("dropPage");
const enterApp = document.getElementById("enterApp");
if (enterApp && dropPage) {
  enterApp.onclick = function () {
    dropPage.classList.add("off");
    if (window.map && map.invalidateSize) map.invalidateSize();
  };
}


(function () {
  var drop = document.getElementById("dropPage");
  var btn = document.getElementById("enterApp");
  if (!drop || !btn) return;
  btn.onclick = function () {
    drop.classList.add("off");
    setTimeout(function () {
      if (typeof map !== "undefined" && map.invalidateSize) {
        map.invalidateSize();
      }
    }, 150);
  };
})();


function openMap() {
  var drop = document.getElementById("dropPage");
  if (drop) drop.classList.add("off");
  setTimeout(function () {
    if (typeof map !== "undefined" && map.invalidateSize) map.invalidateSize();
  }, 150);
}

function updateDropAuth() {
  var enter = document.getElementById("enterApp");
  var form = document.getElementById("dropAuth");
  var who = document.getElementById("dropUser");
  if (!enter) return;
  if (currentUser) {
    if (form) form.hidden = true;
    enter.hidden = false;
    if (who) who.textContent = "Signed in as " + (currentUser.email || "");
  } else {
    if (form) form.hidden = false;
    enter.hidden = true;
    if (who) who.textContent = "";
  }
}

var dropSignIn = document.getElementById("dropSignIn");
var dropSignUp = document.getElementById("dropSignUp");
if (dropSignIn) {
  dropSignIn.onclick = async function () {
    var fd = new FormData(document.getElementById("dropAuth"));
    var { error } = await supabase.auth.signInWithPassword({
      email: String(fd.get("email") || ""),
      password: String(fd.get("password") || "")
    });
    if (error) return alert(error.message);
    await refreshUser();
    updateDropAuth();
    openMap();
  };
}
if (dropSignUp) {
  dropSignUp.onclick = async function () {
    var fd = new FormData(document.getElementById("dropAuth"));
    var { error } = await supabase.auth.signUp({
      email: String(fd.get("email") || ""),
      password: String(fd.get("password") || "")
    });
    if (error) return alert(error.message);
    alert("Account created. Check your email and confirm, then sign in.");
  };
}
if (document.getElementById("enterApp")) {
  document.getElementById("enterApp").onclick = openMap;
}

supabase.auth.onAuthStateChange(function () {
  updateDropAuth();
});
updateDropAuth();


if (document.getElementById("dropForgot")) {
  document.getElementById("dropForgot").onclick = async function () {
    var fd = new FormData(document.getElementById("dropAuth"));
    var email = String(fd.get("email") || "").trim();
    if (!email) return alert("Enter your email first.");
    var { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin
    });
    if (error) return alert(error.message);
    alert("Check your email for a reset link.");
  };
}

function showRecoveryForm() {
  var auth = document.getElementById("dropAuth");
  var np = document.getElementById("dropNewPass");
  var enter = document.getElementById("enterApp");
  if (auth) auth.hidden = true;
  if (np) np.hidden = false;
  if (enter) enter.hidden = true;
}

if (document.getElementById("dropSavePass")) {
  document.getElementById("dropSavePass").onclick = async function () {
    var fd = new FormData(document.getElementById("dropNewPass"));
    var password = String(fd.get("password") || "");
    if (password.length < 6) return alert("Password must be at least 6 characters.");
    var { error } = await supabase.auth.updateUser({ password: password });
    if (error) return alert(error.message);
    alert("Password saved. You are signed in.");
    if (document.getElementById("dropNewPass")) document.getElementById("dropNewPass").hidden = true;
    await refreshUser();
    if (typeof updateDropAuth === "function") updateDropAuth();
    if (typeof openMap === "function") openMap();
  };
}

supabase.auth.onAuthStateChange(function (event) {
  if (event === "PASSWORD_RECOVERY") showRecoveryForm();
});


/* full-complete-clicks */
document.addEventListener("click", function (e) {
  const t = e.target;
  if (!t || !t.classList) return;
  const card = t.closest("article.card");
  if (!card) return;
  const title = card.querySelector("h3") && card.querySelector("h3").textContent;
  const g = (games || []).find(function (x) {
    return title && title.indexOf(x.title) === 0;
  });
  if (!g) return;
  if (t.classList.contains("full-game")) {
    e.stopPropagation();
    toggleFull(g.id, true);
  } else if (t.classList.contains("reopen-game")) {
    e.stopPropagation();
    toggleFull(g.id, false);
  } else if (t.classList.contains("complete-game")) {
    e.stopPropagation();
    toggleComplete(g.id, true);
  } else if (t.classList.contains("reopen-complete")) {
    e.stopPropagation();
    toggleComplete(g.id, false);
  }
});


if (document.getElementById("dropResend")) {
  document.getElementById("dropResend").onclick = async function () {
    var fd = new FormData(document.getElementById("dropAuth"));
    var email = String(fd.get("email") || "").trim();
    if (!email) return alert("Enter your email first.");
    var { error } = await supabase.auth.resend({ type: "signup", email: email });
    if (error) return alert(error.message);
    alert("Confirmation email sent. Check spam too.");
  };
}


function openReport(kind, gameId, targetId, preset) {
  if (!currentUser) {
    if (typeof authDialog !== "undefined" && authDialog) authDialog.show();
    return;
  }
  const form = document.getElementById("reportForm");
  if (!form) return;
  form.reset();
  form.kind.value = kind || "complaint";
  document.getElementById("reportGameId").value = gameId || "";
  document.getElementById("reportTargetId").value = targetId || "";
  if (preset) form.message.value = preset;
  loadReports();
  document.getElementById("reportDialog").show();
}



document.addEventListener("click", function (e) {
  const el = e.target;
  if (!el || !el.classList || !el.classList.contains("report-game")) return;
  const card = el.closest("article.card");
  if (!card) return;
  const title = card.querySelector("h3") && card.querySelector("h3").textContent;
  const g = (games || []).find(function (x) { return title && title.indexOf(x.title) === 0; });
  if (!g) return;
  openReport("complaint", g.id, g.user_id, "Report about: " + g.title);
});


async function adminBanFromReport(userId) {
  if (!isAdmin || !userId) return;
  if (!confirm("Hide this user?")) return;
  const { error } = await supabase.from("profiles").update({ is_banned: true }).eq("id", userId);
  if (error) return alert(error.message);
  alert("User hidden.");
  await loadGames();
}


document.addEventListener("click", function (e) {
  const el = e.target;
  if (!el || !el.classList) return;
  if (el.classList.contains("admin-ban-target")) adminBanFromReport(el.getAttribute("data-user"));
  if (el.classList.contains("admin-delete-listed")) deleteGame(el.getAttribute("data-game"));
});
