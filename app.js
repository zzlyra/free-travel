// app.js
import { AI_RECOMMENDED_SITES } from "./data.js";

// 全局变量
let map;
let markers = [];
let sites = [];

// i18n
const i18n = {
  zh: {
    tripSettingsTitle: "行程需求",
    startLocationLabel: "出发地点",
    startTimeLabel: "出发时间",
    endTimeLabel: "结束时间",
    sitesTitle: "景点列表",
    siteNameLabel: "景点名称",
    preferredTimeLabel: "推荐时间段",
    addSiteHint: "点击地图或用输入框添加景点",
    mapTitle: "地图与路线",
    itineraryTitle: "日程安排"
  },
  en: {
    tripSettingsTitle: "Trip settings",
    startLocationLabel: "Starting point",
    startTimeLabel: "Start time",
    endTimeLabel: "End time",
    sitesTitle: "Sites",
    siteNameLabel: "Site name",
    preferredTimeLabel: "Preferred time slot",
    addSiteHint: "Click map or use input to add site",
    mapTitle: "Map & route",
    itineraryTitle: "Itinerary"
  }
};

// 切换语言
function applyLanguage(lang) {
  const t = i18n[lang] || i18n.zh;
  Object.keys(t).forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = t[id];
  });
}

// 初始化
document.addEventListener("DOMContentLoaded", () => {
  const langSelect = document.getElementById("languageToggle");
  langSelect.addEventListener("change", e => applyLanguage(e.target.value));
  applyLanguage("zh");

  document.getElementById("addSiteFromMapBtn").addEventListener("click", addSiteFromMapCenter);
  document.getElementById("planRouteBtn").addEventListener("click", planRoute);
  document.getElementById("clearSitesBtn").addEventListener("click", clearSites);

  initMap();
});

// 初始化 Leaflet 地图
function initMap() {
  map = L.map("map").setView([35.681236, 139.767125], 12); // Tokyo 默认

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors"
  }).addTo(map);

  map.on("click", e => {
    const latLng = e.latlng;
    const nameInput = document.getElementById("siteNameInput");
    const name = nameInput.value.trim() || `景点 ${sites.length + 1} (${latLng.lat.toFixed(4)}, ${latLng.lng.toFixed(4)})`;
    const preferredTime = document.getElementById("sitePreferredTime").value;
    addSite(name, latLng.lat, latLng.lng, preferredTime);
  });
}

// 添加景点
function addSite(name, lat, lng, preferredTime = "any") {
  const id = Date.now().toString() + Math.random().toString(16).slice(2);
  const site = { id, name, lat, lng, preferredTime };
  sites.push(site);
  addMarker(site);
  renderSitesList();
}

// 以地图中心添加景点
function addSiteFromMapCenter() {
  if (!map) return;
  const center = map.getCenter();
  const nameInput = document.getElementById("siteNameInput");
  const name = nameInput.value.trim() || `景点 ${sites.length + 1} (${center.lat.toFixed(4)}, ${center.lng.toFixed(4)})`;
  const preferredTime = document.getElementById("sitePreferredTime").value;
  addSite(name, center.lat, center.lng, preferredTime);
}

// 添加标记
function addMarker(site) {
  const marker = L.marker([site.lat, site.lng]).addTo(map)
    .bindPopup(site.name)
    .openPopup();
  markers.push(marker);
}

// 清空所有
function clearSites() {
  sites = [];
  markers.forEach(m => map.removeLayer(m));
  markers = [];
  renderSitesList();
  document.getElementById("itineraryContainer").innerHTML = "";
  document.getElementById("summaryBadge").textContent = "";
}

// 渲染景点列表
function renderSitesList() {
  const list = document.getElementById("sitesList");
  list.innerHTML = "";
  if (!sites.length) {
    const li = document.createElement("li");
    li.className = "list-group-item small text-muted";
    li.textContent = "尚未添加景点 / No sites yet";
    list.appendChild(li);
    return;
  }
  sites.forEach((site, idx) => {
    const li = document.createElement("li");
    li.className = "list-group-item list-group-item-site d-flex justify-content-between align-items-center";
    li.innerHTML = `
      <div>
        <strong>${idx + 1}. ${site.name}</strong>
        <div class="text-muted small">${site.lat.toFixed(4)}, ${site.lng.toFixed(4)}</div>
      </div>
      <button class="btn btn-sm btn-outline-danger">×</button>
    `;
    li.querySelector("button").addEventListener("click", () => removeSite(site.id));
    list.appendChild(li);
  });
}

// 删除景点
function removeSite(id) {
  sites = sites.filter(s => s.id !== id);
  markers.forEach(m => map.removeLayer(m));
  markers = [];
  sites.forEach(addMarker);
  renderSitesList();
}

// 核心路线规划（OSRM）
async function planRoute() {
  if (!sites.length) { alert("请先添加至少一个景点"); return; }
  if (sites.length === 1) { alert("只有一个景点，无需规划"); return; }

  const coords = sites.map(s => `${s.lng},${s.lat}`).join(";");
  try {
    const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=true`);
    const data = await res.json();
    if (!data.routes || !data.routes.length) { alert("路线规划失败"); return; }

    const route = data.routes[0];
    drawRoute(route);
    buildItinerary(route);
  } catch (e) {
    console.error(e);
    alert("路线规划失败，请检查网络");
  }
}

// 绘制路线
let routeLayer = null;
function drawRoute(route) {
  if (routeLayer) map.removeLayer(routeLayer);
  routeLayer = L.geoJSON(route.geometry, { color: "#0d6efd", weight: 5 }).addTo(map);
  map.fitBounds(routeLayer.getBounds());
}

// 生成行程安排（简单示例：每个景点固定 90 分钟）
function buildItinerary(route) {
  const ESTIMATED_VISIT_MIN = 90;
  const container = document.getElementById("itineraryContainer");
  container.innerHTML = "";

  let currentTime = document.getElementById("startDateTime").value
    ? new Date(document.getElementById("startDateTime").value)
    : new Date();

  let totalSites = 0;

  sites.forEach((site, idx) => {
    const block = document.createElement("div");
    block.className = "mb-2";

    const startStr = formatTime(currentTime);
    const endTime = new Date(currentTime.getTime() + ESTIMATED_VISIT_MIN * 60 * 1000);
    const endStr = formatTime(endTime);

    block.innerHTML = `
      <div class="itinerary-item-time">${startStr} - ${endStr}</div>
      <div class="itinerary-item-title">${idx + 1}. ${site.name}</div>
    `;
    container.appendChild(block);

    currentTime = endTime;
    totalSites += 1;
  });

  document.getElementById("summaryBadge").textContent = `共 ${totalSites} 个景点 / ${totalSites} stops`;
}

// 格式化时间
function formatTime(date) {
  const h = date.getHours().toString().padStart(2, "0");
  const m = date.getMinutes().toString().padStart(2, "0");
  return `${h}:${m}`;
}
