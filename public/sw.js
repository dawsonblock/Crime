// Saskatoon Safety Map & Dashboard - PWA Service Worker
// Enables complete offline accessibility and map caching in remote Saskatchewan areas

const STATIC_CACHE_NAME = "saskatoon-safety-static-v2";
const TILE_CACHE_NAME = "saskatoon-safety-tiles-v2";
const API_CACHE_NAME = "saskatoon-safety-api-v2";

const CRITICAL_ASSETS = [
  "/",
  "/index.html",
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css",
  "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png"
];

// Perform install & cache the critical app shell
self.addEventListener("install", (event) => {
  console.log("[Service Worker] Installation Phase initiated.");
  event.waitUntil(
    caches.open(STATIC_CACHE_NAME).then((cache) => {
      console.log("[Service Worker] Pre-caching critical application shell.");
      return cache.addAll(CRITICAL_ASSETS);
    }).then(() => {
      return self.skipWaiting();
    })
  );
});

// Activate & remove stale legacy caches
self.addEventListener("activate", (event) => {
  console.log("[Service Worker] Activation Phase completed.");
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (
            cache !== STATIC_CACHE_NAME &&
            cache !== TILE_CACHE_NAME &&
            cache !== API_CACHE_NAME
          ) {
            console.log(`[Service Worker] Pruning legacy cached bundle: ${cache}`);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => {
      return self.clients.claim();
    })
  );
});

// Handle incoming resource requests (Routing interceptor)
self.addEventListener("fetch", (event) => {
  const { request } = event;
  let url;
  try {
    url = new URL(request.url);
  } catch (err) {
    return; // Bypass invalid URLs
  }

  // Only handle HTTP/HTTPS protocols (skip chrome-extension, data:, about:, etc.)
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return;
  }

  // Skip non-GET requests (e.g. reported bulletins, geofencing reports)
  if (request.method !== "GET") {
    return;
  }

  // 1. API INCIDENT DATA RECIPIENT STRATEGY: Network-First (with offline cache fallback)
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          // If response is valid, write a copy to the local API cache
          if (networkResponse && networkResponse.ok) {
            const responseClone = networkResponse.clone();
            caches.open(API_CACHE_NAME).then((cache) => {
              cache.put(request, responseClone).catch(() => {});
            });
          }
          return networkResponse;
        })
        .catch(() => {
          // If network is offline, fetch the previously cached JSON data
          console.log(`[Service Worker] Connection offline. Serving cached api endpoint: ${url.pathname}`);
          return caches.match(request).then((cachedResponse) => {
            if (cachedResponse) {
              return cachedResponse;
            }
            // If completely un-cached offline state, return a structured fallback response
            return new Response(
              JSON.stringify({
                error: "You are currently offline. Local cache for this request is empty.",
                offline: true,
                events: []
              }),
              {
                headers: { "Content-Type": "application/json" }
              }
            );
          });
        })
    );
    return;
  }

  // 2. MAP TILE ASSETS STRATEGY: Cache-First (with background network upgrade)
  // Caches OpenStreetMap tiles, CartoDB basemaps, or other Map Tile resources
  const isMapTile = 
    url.hostname.includes("tile.openstreetmap.org") || 
    url.hostname.includes("basemaps.cartocdn.com") ||
    (url.pathname.includes(".png") && (url.pathname.includes("/tile/") || url.pathname.includes("/rastertiles/")));

  if (isMapTile) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) {
          // Return immediately for stellar offline performance!
          // Still fetch in background optionally to refresh tile details occasionally (Stale-While-Revalidate style)
          fetch(request).then((networkResponse) => {
            if (networkResponse && networkResponse.ok) {
              caches.open(TILE_CACHE_NAME).then((cache) => {
                cache.put(request, networkResponse).catch(() => {});
              });
            }
          }).catch(() => {/* Ignore background download failures if offline */});
          
          return cachedResponse;
        }

        // Cache miss: download from tile provider, store, and return
        return fetch(request).then((networkResponse) => {
          if (networkResponse && networkResponse.ok) {
            const responseClone = networkResponse.clone();
            caches.open(TILE_CACHE_NAME).then((cache) => {
              cache.put(request, responseClone).catch(() => {});
            });
          }
          return networkResponse;
        });
      })
    );
    return;
  }

  // 3. STATIC RESOURCES, CSS, SCRIPTS STRATEGY: Stale-While-Revalidate
  // Returns cached compiled files instantly to enable quick offline load, while checking background upgrades.
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        // Stale-While-Revalidate: Return cached, but query updated from network in background
        fetch(request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.ok) {
              const responseClone = networkResponse.clone();
              caches.open(STATIC_CACHE_NAME).then((cache) => {
                cache.put(request, responseClone).catch(() => {});
              });
            }
          })
          .catch(() => {});
        return cachedResponse;
      }

      // Cache miss: fetch from network and propagate failures naturally (avoiding returning undefined)
      return fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.ok) {
            const responseClone = networkResponse.clone();
            caches.open(STATIC_CACHE_NAME).then((cache) => {
              cache.put(request, responseClone).catch(() => {});
            });
          }
          return networkResponse;
        })
        .catch((err) => {
          // If offline and request is HTML document navigation, return cached root as a fallback
          if (request.mode === "navigate") {
            return caches.match("/").then((fallback) => fallback || Promise.reject(err));
          }
          throw err; // Propagate the fetch error so the browser registers a real network failure (not custom undefined crashes)
        });
    })
  );
});
