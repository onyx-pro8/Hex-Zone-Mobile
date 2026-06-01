import type { LatLng } from "@/lib/h3";
import type { MapZoneLayer, ZoneCircle } from "@/lib/zoneGeometry";

export type DashboardMapState = {
  center: LatLng;
  zoom?: number;
  /** "polygon" — tap to add ring vertices. "circle" — tap once center, again radius. "h3" — tap to toggle h3 cell. "marker" — tap to set anchor. "none" — read-only */
  drawMode: "polygon" | "circle" | "h3" | "marker" | "none";
  draftRing: LatLng[];
  /** Validated communal / government polygons (all rings). */
  previewRings?: LatLng[][];
  draftCircle: ZoneCircle | null;
  draftMarker: LatLng | null;
  selectedH3Cells: string[];
  h3Resolution: number;
  savedLayers: MapZoneLayer[];
  /** Color of the active draft outline. */
  draftColor: string;
  /** When true the draft circle is drawn solid (resolved cluster). */
  draftCircleSolid?: boolean;
  /** Auto-fit the map to this token; bumps to re-trigger the fit. */
  fitDraftToken?: number;
};

const ACCENT = "#FF2DAA";
const DRAFT = "#FFD83D";

export function buildDashboardMapHtml(): string {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=0" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <style>
    html, body, #map { height: 100%; margin: 0; padding: 0; background: #0A0A0F; }
    .leaflet-container { background: #0A0A0F !important; }
    .leaflet-control-attribution { font-size: 9px; background: rgba(10,10,15,0.6); color: #6E6E80; }
    .leaflet-control-attribution a { color: ${ACCENT}; }
    .leaflet-control-zoom { border: none !important; }
    .leaflet-control-zoom a { background: rgba(10,10,15,0.78) !important; color: #fff !important; border: 1px solid rgba(255,255,255,0.08) !important; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script src="https://unpkg.com/h3-js@4.1.0/dist/h3-js.umd.js" onerror="window.__h3LoadFailed=true"></script>
  <script>
    (function () {
      var ACCENT = '${ACCENT}';
      var DRAFT = '${DRAFT}';
      var map = null;
      var draftLayer = null;
      var savedLayerGroup = null;
      var h3DraftLayer = null;
      var markerLayer = null;
      var draftCircleObj = null;
      var draftCircleCenterMarker = null;
      var state = null;

      function post(msg) {
        if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
          window.ReactNativeWebView.postMessage(JSON.stringify(msg));
        }
      }

      function debug(label, payload) {
        try { post({ type: 'debug', label: String(label), payload: payload }); } catch (e) {}
      }

      function getH3() {
        if (typeof window.h3 === 'object' && window.h3) return window.h3;
        if (typeof window.h3js === 'object' && window.h3js) return window.h3js;
        return null;
      }

      function ensureH3Loaded(cb, attempt) {
        attempt = attempt || 0;
        var lib = getH3();
        if (lib && typeof lib.latLngToCell === 'function') return cb(lib);
        if (window.__h3LoadFailed) {
          debug('h3-load-failed', null);
          return cb(null);
        }
        if (attempt > 50) {
          debug('h3-load-timeout', null);
          return cb(null);
        }
        setTimeout(function () { ensureH3Loaded(cb, attempt + 1); }, 100);
      }

      var H3 = null;
      ensureH3Loaded(function (lib) {
        H3 = lib;
        if (state) applyState(state);
      });

      function clearGroup(g) { if (g) g.clearLayers(); }

      function renderDraftPolygon(points, color) {
        if (!points || points.length === 0) return;
        var latlngs = points.map(function (p) { return [p[0], p[1]]; });
        if (latlngs.length >= 2) {
          L.polyline(latlngs, { color: color, weight: 2, dashArray: '6 8' }).addTo(draftLayer);
        }
        if (latlngs.length >= 3) {
          var closed = latlngs.length >= 4 &&
            Math.abs(latlngs[0][0] - latlngs[latlngs.length - 1][0]) < 1e-7 &&
            Math.abs(latlngs[0][1] - latlngs[latlngs.length - 1][1]) < 1e-7;
          L.polygon(latlngs, {
            color: color,
            weight: 2,
            fillColor: color,
            fillOpacity: closed ? 0.22 : 0.12,
            dashArray: closed ? null : '8 6'
          }).addTo(draftLayer);
        }
        latlngs.forEach(function (ll, i) {
          L.circleMarker(ll, {
            radius: i === 0 ? 7 : 5,
            color: i === 0 ? color : ACCENT,
            fillColor: i === 0 ? color : '#fff',
            fillOpacity: 1,
            weight: 2
          }).addTo(draftLayer);
        });
      }

      function renderDraftCircle(circle, color, opts) {
        if (!circle || !circle.center) return;
        var solid = !!(opts && opts.solid);
        var r = Number(circle.radiusMeters) || 0;
        if (r > 0) {
          L.circle(circle.center, {
            radius: r,
            color: color,
            weight: solid ? 3 : 2,
            dashArray: solid ? null : '6 8',
            fillColor: color,
            fillOpacity: solid ? 0.22 : 0.16
          }).addTo(draftLayer);
        }
        L.circleMarker(circle.center, {
          radius: solid ? 7 : 6,
          color: '#fff',
          fillColor: color,
          fillOpacity: 1,
          weight: 2
        }).addTo(draftLayer);
      }

      function renderDraftMarker(marker, color) {
        if (!marker) return;
        L.circleMarker(marker, {
          radius: 8,
          color: color,
          fillColor: color,
          fillOpacity: 0.9,
          weight: 2
        }).addTo(draftLayer);
      }

      function renderH3Draft(cells, color) {
        clearGroup(h3DraftLayer);
        if (!cells || cells.length === 0) return;
        var lib = H3 || getH3();
        if (!lib || typeof lib.cellToBoundary !== 'function') {
          debug('h3-render-missing', { count: cells.length });
          return;
        }
        cells.forEach(function (cell) {
          try {
            var boundary = lib.cellToBoundary(cell);
            var ring = boundary.map(function (p) { return [p[0], p[1]]; });
            L.polygon(ring, {
              color: color,
              weight: 2,
              fillColor: color,
              fillOpacity: 0.42
            }).addTo(h3DraftLayer);
          } catch (e) {
            debug('h3-render-error', { cell: cell, err: String(e && e.message || e) });
          }
        });
      }

      function renderSavedLayers(layers) {
        clearGroup(savedLayerGroup);
        if (!layers || !layers.length) return;
        layers.forEach(function (layer) {
          var col = layer.color || ACCENT;
          (layer.rings || []).forEach(function (ring) {
            if (!ring || ring.length < 3) return;
            L.polygon(ring.map(function (p) { return [p[0], p[1]]; }), {
              color: col,
              weight: 2,
              fillColor: col,
              fillOpacity: 0.14
            }).addTo(savedLayerGroup);
          });
          (layer.circles || []).forEach(function (c) {
            if (!c || !c.center) return;
            L.circle(c.center, {
              radius: c.radiusMeters,
              color: col,
              weight: 2,
              fillColor: col,
              fillOpacity: 0.14
            }).addTo(savedLayerGroup);
          });
          var lib = H3 || getH3();
          if (lib && lib.cellToBoundary && (layer.h3Cells || []).length) {
            layer.h3Cells.forEach(function (cell) {
              try {
                var boundary = lib.cellToBoundary(cell);
                L.polygon(boundary.map(function (p) { return [p[0], p[1]]; }), {
                  color: col,
                  weight: 1,
                  fillColor: col,
                  fillOpacity: 0.22
                }).addTo(savedLayerGroup);
              } catch (e) {}
            });
          }
          if (layer.marker) {
            L.circleMarker(layer.marker, {
              radius: 6,
              color: col,
              fillColor: col,
              fillOpacity: 1,
              weight: 2
            }).addTo(savedLayerGroup);
          }
        });
      }

      function renderPreviewRings(rings, color) {
        if (!rings || !rings.length) return;
        rings.forEach(function (ring) {
          if (!ring || ring.length < 3) return;
          var latlngs = ring.map(function (p) { return [p[0], p[1]]; });
          L.polygon(latlngs, {
            color: color,
            weight: 2,
            dashArray: '8 6',
            fillColor: color,
            fillOpacity: 0.18
          }).addTo(draftLayer);
        });
      }

      var lastFitToken = 0;
      function applyState(next) {
        if (!map) return;
        var prev = state;
        state = next;
        var center = next.center || [40.7527, -73.9772];
        var zoom = next.zoom || 13;
        var centerChanged =
          !prev ||
          Math.abs((prev.center && prev.center[0]) - center[0]) > 0.0001 ||
          Math.abs((prev.center && prev.center[1]) - center[1]) > 0.0001;
        if (centerChanged) {
          map.setView(center, zoom, { animate: true });
        }
        renderSavedLayers(next.savedLayers || []);

        clearGroup(draftLayer);
        var color = next.draftColor || ACCENT;
        if (next.previewRings && next.previewRings.length) {
          renderPreviewRings(next.previewRings, color);
        } else if (next.drawMode === 'polygon' || (next.draftRing && next.draftRing.length)) {
          renderDraftPolygon(next.draftRing || [], color);
        }
        if (next.drawMode === 'circle' || next.draftCircle) {
          renderDraftCircle(next.draftCircle, color, { solid: !!next.draftCircleSolid });
        }
        if (next.drawMode === 'marker' || next.draftMarker) {
          renderDraftMarker(next.draftMarker, color);
        }
        renderH3Draft(next.selectedH3Cells || [], color);

        if (
          next.fitDraftToken &&
          next.fitDraftToken !== lastFitToken &&
          next.draftCircle &&
          next.draftCircle.center &&
          Number(next.draftCircle.radiusMeters) > 0
        ) {
          lastFitToken = next.fitDraftToken;
          try {
            var c = L.latLng(next.draftCircle.center[0], next.draftCircle.center[1]);
            var bounds = c.toBounds(Math.max(Number(next.draftCircle.radiusMeters) * 2.4, 200));
            map.fitBounds(bounds, { padding: [40, 40], maxZoom: 17, animate: true });
          } catch (e) {
            debug('fit-bounds-error', { err: String(e && e.message || e) });
          }
        }
      }

      window.__applyMapState = applyState;

      window.__requestDeviceLocation = function () {
        if (!navigator.geolocation) {
          post({ type: 'locationError', message: 'Geolocation is not available in this WebView.' });
          return;
        }
        navigator.geolocation.getCurrentPosition(
          function (pos) {
            post({
              type: 'location',
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              accuracy: pos.coords.accuracy
            });
          },
          function (err) {
            var msg = (err && err.message) ? err.message : 'Location permission denied or unavailable.';
            post({ type: 'locationError', message: msg });
          },
          { enableHighAccuracy: true, timeout: 20000, maximumAge: 60000 }
        );
      };

      function initMap() {
        map = L.map('map', { zoomControl: true, attributionControl: true })
          .setView([40.7527, -73.9772], 13);
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
          attribution: '&copy; OSM &copy; CARTO',
          subdomains: 'abcd',
          maxZoom: 19
        }).addTo(map);

        savedLayerGroup = L.layerGroup().addTo(map);
        h3DraftLayer = L.layerGroup().addTo(map);
        draftLayer = L.layerGroup().addTo(map);
        markerLayer = L.layerGroup().addTo(map);

        function handleTap(e) {
          if (!state) return;
          if (state.drawMode === 'none') return;
          var lat = e.latlng.lat, lng = e.latlng.lng;
          if (state.drawMode === 'h3') {
            var lib = H3 || getH3();
            if (!lib || typeof lib.latLngToCell !== 'function') {
              debug('h3-click-no-lib', null);
              post({ type: 'h3LoadError' });
              return;
            }
            try {
              var cell = lib.latLngToCell(lat, lng, state.h3Resolution || 9);
              post({ type: 'h3Toggle', cell: cell });
            } catch (err) {
              debug('h3-click-error', { err: String(err && err.message || err) });
            }
            return;
          }
          post({ type: 'mapClick', lat: lat, lng: lng });
        }
        map.on('click', handleTap);

        post({ type: 'ready' });
      }

      initMap();
    })();
  </script>
</body>
</html>`;
}
