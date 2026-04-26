# VeVit Earth — Design Specification

Interactive 3D globe application with live NASA EONET data, part of the VeVit ecosystem.

## Overview

**Purpose:** Visualize global natural events (wildfires, storms, earthquakes, etc.) from NASA EONET API on an interactive 3D globe.

**Tech Stack:**
- Pure static HTML/CSS/JS (no build step, matches VeVit ecosystem)
- CesiumJS for 3D globe (ESRI World Imagery, no token required)
- PHP proxy for EONET API caching (Wedos hosting)
- Tailwind CSS via CDN

**Design System:** VeVit Dark Neomorphic — matches existing VeVit projects

---

## Architecture

### File Structure

```
vevit-earth/
├── index.html                 # Single-page app entry
├── assets/
│   ├── css/
│   │   ├── style.css          # Core styles + design system
│   │   └── globe.css          # Cesium-specific overrides
│   └── js/
│       ├── app.js             # Main app initialization
│       ├── cesium-globe.js    # CesiumJS viewer + markers
│       ├── eonet-api.js       # EONET API client + caching
│       ├── ui-panels.js       # Left panel, detail panel, HUD
│       ├── geocoding.js       # Nominatim search
│       └── url-state.js       # History API + share links
├── api/
│   ├── eonet-proxy.php        # EONET API proxy with caching
│   └── cache/                 # Cached API responses (15min TTL)
│       └── .htaccess          # Deny direct access
└── vendor/
    └── cesium/                # CesiumJS library (CDN fallback)
```

### State Management

```javascript
window.VeVitEarth = {
  viewer: null,              // Cesium viewer instance
  events: [],                // All loaded EONET events
  activeEvent: null,         // Currently selected event
  lastUpdated: null,         // Timestamp of last successful fetch
  filters: {
    days: 30,
    categories: ['wildfires', 'severeStorms', 'volcanoes', 'earthquakes', 'floods'],
    sort: 'newest'
  },
  layers: {
    satellite: true,
    terrain: false,
    borders: false,
    clouds: false,
    populationHeatmap: false,
    nightLights: false,
    oceanCurrents: false,
    shippingRoutes: false
  },
  ui: {
    panelCollapsed: false,
    detailPanelOpen: false
  }
};
```

---

## Components

### 1. TopBar (64px fixed)

```
┌────────────────────────────────────────────────────────────────────┐
│ 🌍 VeVit Earth  │  [🔍 Hledat místo...          ]  │  47 ⚠️  │ ← Zpět │ 3D/2D │
└────────────────────────────────────────────────────────────────────┘
```

- **Logo:** "🌍 VeVit Earth" (Sora 600, left)
- **Search:** Nominatim autocomplete (center, debounce 400ms)
- **Event badge:** Count with pulse animation (right)
- **Back link:** "← Zpět na VeVit" → vevit.fun
- **3D/2D toggle:** Switches Cesium scene mode

### 2. Left Panel (320px, collapsible)

```
┌─────────────────────┐
│ Vrstvy mapy      [≡]│  ← Collapse button
├─────────────────────┤
│ ☑ Satellite imagery │
│ ☐ Terrain           │
│ ☐ Hranice států     │
│ ☐ Oblačnost         │
│ ...                 │
├─────────────────────┤
│ NASA EONET Events   │
│ [7d][30d][90d][Vše] │
│ ─────────────────── │
│ 🔥 Požáry      (12) │
│ ⛈ Bouře       (8)  │
│ ...                 │
│ ─────────────────── │
│ 🔥 wildfire_ca_543  │
│    California, US    │
│    před 2 dny       │
├─────────────────────┤
│ Statistiky          │
│ ▃▅▇▂▃ sparkline     │
│ Top: Požáry, Bouře  │
└─────────────────────┘
```

**Responsive behavior:**
- Mobile (<768px): Hidden by default, hamburger menu opens slide-out drawer
- Tablet (768-1024px): Collapsible, starts collapsed
- Desktop (>1024px): Visible, collapsible

**Event list:** Virtual scroll for >100 events

### 3. Detail Panel (400px slide-out from right)

Opens on event marker click:

```
                    ┌────────────────────────────────┐
                    │ ×                              │
                    │ 🔥 Požár                       │
                    │ wildfire_ca_543               │
                    │ ────────────────────────────── │
                    │ Začátek: 2024-04-02           │
                    │ Stav: Probíhá                  │
                    │ 📍 36.7783°N, 119.4179°W       │
                    │ [Kopírovat] [Fly to] [Sdílet]  │
                    │ ────────────────────────────── │
                    │ 🗺 Static map tile (OSM)       │
                    │ ────────────────────────────── │
                    │ Podobné eventy v oblasti:      │
                    │ • wildfire_nv_12 (230km)       │
                    └────────────────────────────────┘
```

**Static map:** OpenStreetMap static tile URL (no Leaflet instance):
```
https://staticmap.openstreetmap.de/staticmap.php?center={lat},{lon}&zoom=8&size=380x200
```

### 4. CesiumJS Globe (main area)

**Configuration:**
```javascript
new Cesium.Viewer('cesium-container', {
  terrainProvider: new Cesium.EllipsoidTerrainProvider(),
  imageryProvider: new Cesium.ArcGisMapServerImageryProvider({
    url: 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer'
  }),
  baseLayerPicker: false,
  geocoder: false,
  homeButton: false,
  sceneModePicker: false,
  navigationHelpButton: false,
  animation: false,
  timeline: false,
  fullscreenButton: false,
  infoBox: false,
  selectionIndicator: false,
  shadows: true,
  shouldAnimate: true
});
```

**Features:**
- Auto-rotate until user interaction
- Day/night terminator: `viewer.scene.globe.enableLighting = true`
- Event markers: Pulsing ellipse + point entity per event
- Camera flyTo on event selection

**Event marker structure:**
```javascript
{
  id: event.id,
  position: Cesium.Cartesian3.fromDegrees(lon, lat),
  ellipse: {
    semiMinorAxis: getRadius(event),
    semiMajorAxis: getRadius(event),
    material: color.withAlpha(0.3),
    outline: true,
    outlineColor: color
  },
  point: {
    pixelSize: 10,
    color: color,
    outlineColor: Cesium.Color.WHITE
  }
}
```

### 5. HUD Overlay (positioned over globe)

```
┌──────────────────────────────────────────────────────────┐
│                                            🧭 N         │
│  📍 48.5°N, 14.2°E                           │          │
│  Alt: 1,250,000m                             └──┘       │
│  🕐 UTC+1 (14:32)                                       │
│  Naposledy aktualizováno: před 5 min                     │
└──────────────────────────────────────────────────────────┘
```

**Timezone estimation:**
```javascript
// Simple longitude-based offset (not precise, for visual only)
const tzOffset = Math.round(longitude / 15);
const localTime = new Date(Date.now() + tzOffset * 3600000);
```

### 6. Minimap (200×120px, bottom-right)

- Leaflet 2D map synced to 3D camera
- Rectangle shows current viewport
- **Throttled sync:** Max 10 updates/second (100ms throttle)
- Click repositions 3D camera

---

## Design System

### CSS Variables

```css
:root {
  /* Base colors */
  --bg-base: #040d1a;
  --bg-surface: #0a1628;
  --bg-elevated: #0f1f35;
  --border: rgba(99, 179, 237, 0.12);
  
  /* Accent */
  --accent: #3b82f6;
  --accent-glow: rgba(59, 130, 246, 0.3);
  
  /* Text */
  --text-primary: #e2e8f0;
  --text-muted: #64748b;
  
  /* Event colors */
  --event-wildfires: #ef4444;
  --event-severeStorms: #8b5cf6;
  --event-volcanoes: #f97316;
  --event-earthquakes: #eab308;
  --event-floods: #06b6d4;
  --event-seaLakeIce: #93c5fd;
  --event-landslides: #a16207;
  --event-snow: #cbd5e1;
  --event-dustHaze: #d97706;
  --event-drought: #84cc16;
  --event-manOfOrigin: #ec4899;
}
```

### Neomorphic Panel Style

```css
.panel {
  background: linear-gradient(145deg, #0a1628, #0d1e38);
  box-shadow: 8px 8px 16px #020810, -4px -4px 12px #0f2444;
  border: 1px solid rgba(99, 179, 237, 0.1);
  border-radius: 16px;
  backdrop-filter: blur(12px);
}
```

---

## Data Flow

### EONET API Proxy

```
User Action → Frontend fetch → PHP Proxy → Cache check → EONET API → Response
                    │                           │
                    │                           ├─ Hit: Return cached JSON
                    │                           └─ Miss: Fetch, cache 15min, return
                    │
                    └─ /api/eonet-proxy.php?endpoint=events&days=30&category=wildfires
```

**Cache strategy (PHP):**
```php
$cacheKey = md5($endpoint . http_build_query($params));
$cacheFile = __DIR__ . "/cache/{$cacheKey}.json";
$ttl = 900; // 15 minutes

if (file_exists($cacheFile) && (time() - filemtime($cacheFile)) < $ttl) {
    header('Content-Type: application/json');
    header('Access-Control-Allow-Origin: *.vevit.fun');
    echo file_get_contents($cacheFile);
    exit;
}

// Fetch from EONET, cache result
$ch = curl_init("https://eonet.gsfc.nasa.gov/api/v3/{$endpoint}");
// ... cURL setup
$response = curl_exec($ch);
file_put_contents($cacheFile, $response);
echo $response;
```

**Error fallback (PHP):**
```php
if ($error) {
    $cachedFiles = glob(__DIR__ . "/cache/*.json");
    if (!empty($cachedFiles)) {
        // Find most recent by mtime, not filename
        usort($cachedFiles, function($a, $b) {
            return filemtime($b) - filemtime($a);
        });
        header('Content-Type: application/json');
        echo file_get_contents($cachedFiles[0]);
        exit;
    }
    http_response_code(503);
    echo json_encode(['error' => 'EONET API unavailable']);
}
```

### Event Data Structure

```javascript
{
  id: "EONET_543",
  title: "Wildfire - California",
  category: "wildfires",
  categoryIcon: "🔥",
  categoryColor: "#ef4444",
  coordinates: [-119.4179, 36.7783],  // [lon, lat] primary point
  geometryType: "Point",              // "Point"|"Polygon"|"LineString"
  allCoordinates: [],                 // Full geometry array for multi-point events
  dateStart: "2024-04-02",
  dateEnd: null,                       // null = ongoing
  source: "https://eonet.gsfc.nasa.gov/events/EONET_543",
  ageDays: 2                           // Days since dateStart for sorting
}
```

### URL State Synchronization

```javascript
// Reading on load
const params = new URLSearchParams(window.location.search);
// ?lat=48.5&lon=14.2&alt=1000000&event=EONET_543&layers=wildfires,earthquakes

// Writing on change (throttled)
history.replaceState(null, '', '?' + params.toString());
```

---

## Error Handling

### Frontend

```javascript
async function fetchEvents(params) {
  try {
    const response = await fetch(`/api/eonet-proxy.php?${params}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    window.VeVitEarth.lastUpdated = Date.now();
    return data;
  } catch (error) {
    // Fallback: localStorage cache (size-limited)
    const cached = localStorage.getItem('eonet_cache');
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed.events && parsed.events.length <= 50) {
        console.warn('EONET unavailable, using cached data');
        return parsed;
      }
    }
    showError('Nelze načíst data o událostech. Zkontrolujte připojení.');
    return { events: [] };
  }
}
```

### localStorage Safety

```javascript
function saveToCache(events) {
  const data = JSON.stringify({ events, timestamp: Date.now() });
  // Size check: only cache if < 200KB
  if (data.length < 200000) {
    try {
      localStorage.setItem('eonet_cache', data);
    } catch (e) {
      // QuotaExceededError - reduce to 50 most recent
      const reduced = events.slice(0, 50);
      localStorage.setItem('eonot_cache', JSON.stringify({ events: reduced, timestamp: Date.now() }));
    }
  } else {
    // Too large: cache only 50 most recent
    const reduced = events.slice(0, 50);
    localStorage.setItem('eonet_cache', JSON.stringify({ events: reduced, timestamp: Date.now() }));
  }
}
```

### Geocoding (non-critical)

```javascript
async function geocode(query) {
  try {
    const response = await fetch(nominatimUrl);
    return await response.json();
  } catch {
    console.warn('Geocoding unavailable');
    return [];
  }
}
```

---

## Performance

| Concern | Solution |
|---------|----------|
| EONET API load | PHP proxy cache 15min, localStorage backup |
| Marker rendering | Cluster nearby events at zoom < 5 |
| Camera throttle | Minimap sync 100ms (10×/sec) |
| Search debounce | Nominatim 400ms debounce |
| Detail panel image | Lazy-load static map on panel open |
| Event list | Virtual scroll for >100 events |
| Initial load | Parallel: Cesium + EONET fetch |

---

## Loading States

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│              🌍 VeVit Earth                              │
│                                                         │
│         Načítám 3D scénu...                              │
│         ▓▓▓▓▓▓▓▓░░░░░░░░░░  35%                         │
│                                                         │
│         ━━━━━━━━━━━━━━━━━━━━━                           │
│         Načítání dat z NASA EONET...                    │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**Phases:**
1. CesiumJS core library (CDN)
2. Terrain/imagery setup
3. EONET events fetch
4. Initial markers render

---

## Responsive Breakpoints

| Viewport | Behavior |
|----------|----------|
| Mobile (<768px) | Panel → hamburger → slide-out drawer, minimap hidden |
| Tablet (768-1024px) | Panel collapsible, minimap visible |
| Desktop (>1024px) | Full layout, panel visible |

---

## Event Categories (NASA EONET)

| ID | Label | Icon | Color |
|----|-------|------|-------|
| wildfires | Požáry | 🔥 | #ef4444 |
| severeStorms | Bouře | ⛈ | #8b5cf6 |
| volcanoes | Sopky | 🌋 | #f97316 |
| earthquakes | Zemětřesení | ⚡ | #eab308 |
| floods | Záplavy | 🌊 | #06b6d4 |
| seaLakeIce | Ledovce | 🧊 | #93c5fd |
| landslides | Sesuvy | 🌀 | #a16207 |
| snow | Sníh | ❄ | #cbd5e1 |
| dustHaze | Prach/Mlha | 🌫 | #d97706 |
| drought | Sucho | 🌵 | #84cc16 |
| manOfOrigin | Antropogenní | 🏭 | #ec4899 |

---

## Success Criteria

1. **Performance:** Initial load < 5s on 3G, globe interactive < 3s
2. **Accuracy:** EONET events displayed within 30s of data age (cache TTL)
3. **Usability:** Find and fly to any event < 3 clicks
4. **Responsiveness:** Full functionality on mobile (panel as drawer)
5. **Reliability:** Graceful degradation when EONET API unavailable