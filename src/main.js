import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

let currentUser = null;
let editingId = null;

async function refreshUser() {
  const { data } = await supabase.auth.getUser();
  currentUser = data.user || null;
  const label = document.getElementById("userLabel");
  const authBtn = document.getElementById("authBtn");
  if (currentUser) {
    label.textContent = currentUser.email;
    authBtn.textContent = "Sign out";
  } else {
    label.textContent = "";
    authBtn.textContent = "Sign in";
  }
}

const authDialog = document.getElementById("authDialog");
document.getElementById("authBtn").onclick = async function () {
  if (currentUser) {
    await supabase.auth.signOut();
    await refreshUser();
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
  alert("Account created. Sign in.");
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
    .filter(function (g) { return showFull || !g.is_full; })
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
    card.innerHTML = "<h3>" + escapeHtml(g.title) + (g.is_full ? " (FULL)" : "") + "</h3>" +
      '<p class="meta">' + escapeHtml(g.system) + " · " + g.distance.toFixed(1) + " mi</p>" +
      "<p>" + escapeHtml(g.date) + " " + escapeHtml(g.time) + " · " + g.seats + " seats</p>" +
      "<p>" + escapeHtml(g.location) + "</p>";
    if (currentUser && g.user_id === currentUser.id) {
      card.innerHTML += g.is_full
        ? '<p><button type="button" class="edit-game">Edit</button> <button type="button" class="reopen-game">Reopen</button> <button type="button" class="delete-game">Delete</button></p>'
        : '<p><button type="button" class="edit-game">Edit</button> <button type="button" class="full-game">Mark full</button> <button type="button" class="delete-game">Delete</button></p>';
    }
    card.onclick = function (e) {
      const cls = e.target && e.target.classList;
      if (cls && cls.contains("edit-game")) {
        startEdit(g);
        return;
      }
      if (cls && cls.contains("delete-game")) {
        deleteGame(g.id);
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
    listEl.appendChild(card);
  });
}

async function loadGames() {
  let query = supabase.from("games").select("*").order("date");
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
  render();
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
    const res = await supabase.from("games").insert(row);
    error = res.error;
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
document.getElementById("filterSystem").onchange = render;
document.getElementById("filterMiles").onchange = render;
loadGames();
