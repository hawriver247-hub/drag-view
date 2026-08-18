import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

let currentUser = null;

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
  return games
    .filter(function (g) { return !system || g.system === system; })
    .map(function (g) { return Object.assign({}, g, { distance: milesBetween(userPos, g) }); })
    .filter(function (g) { return g.distance <= miles; })
    .sort(function (a, b) { return a.distance - b.distance; });
}

function popupHtml(g) {
  return "<h3>" + escapeHtml(g.title) + "</h3>" +
    "<p><b>" + escapeHtml(g.system) + "</b> · " + escapeHtml(g.date) + " " + escapeHtml(g.time) + "</p>" +
    "<p>" + escapeHtml(g.location) + "</p>" +
    "<p>Levels " + escapeHtml(g.levels || "any") + " · " + g.seats + " seat(s)</p>" +
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
    card.innerHTML = "<h3>" + escapeHtml(g.title) + "</h3>" +
      '<p class="meta">' + escapeHtml(g.system) + " · " + g.distance.toFixed(1) + " mi</p>" +
      "<p>" + escapeHtml(g.date) + " " + escapeHtml(g.time) + " · " + g.seats + " seats</p>" +
      "<p>" + escapeHtml(g.location) + "</p>";
    card.onclick = function () {
      map.setView([g.lat, g.lng], 13);
      marker.openPopup();
    };
    listEl.appendChild(card);
  });
}

async function loadGames() {
  const { data, error } = await supabase.from("games").select("*").order("date");
  if (error) {
    console.error(error);
    alert("Could not load games: " + error.message);
    games = [];
  } else {
    games = data || [];
  }
  render();
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
  const { error } = await supabase.from("games").insert(row);
  if (error) {
    alert("Could not post: " + error.message);
    return;
  }
  if (pendingPin) pendingPin.remove();
  dialog.close();
  await loadGames();
});

document.getElementById("filterSystem").onchange = render;
document.getElementById("filterMiles").onchange = render;
loadGames();
