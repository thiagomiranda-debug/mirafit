const CACHE_NAME = "mirafit-v2";
const GIF_CACHE = "mirafit-gifs-v1";
const MAX_GIF_CACHE = 100; // máximo de GIFs armazenados

// Recursos do app shell para cache imediato
const APP_SHELL = [
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/fallback-exercise.svg",
];

// Instala o SW e faz cache do app shell
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

// Limpa caches antigos na ativação
self.addEventListener("activate", (event) => {
  const VALID = [CACHE_NAME, GIF_CACHE];
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => !VALID.includes(k)).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Limita tamanho do cache de GIFs (FIFO)
async function trimCache(cacheName, maxItems) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length > maxItems) {
    for (let i = 0; i < keys.length - maxItems; i++) {
      await cache.delete(keys[i]);
    }
  }
}

// Estratégia de cache:
// - /_next/: NUNCA cachear (gerenciado pelo Next.js, muda a cada build)
// - API routes: network-only
// - GIFs de exercícios: cache-first com limite de tamanho
// - Assets estáticos (icons, manifest): cache-first
// - Páginas HTML: network-only (Next.js gerencia routing)
self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Ignora requisições não-GET
  if (request.method !== "GET") return;

  // Ignora protocolos não-http (chrome-extension, etc.)
  const url = new URL(request.url);
  if (!url.protocol.startsWith("http")) return;

  // NUNCA cachear assets do Next.js — causa JS obsoleto e trava o Chrome
  if (url.pathname.startsWith("/_next/")) return;

  // API routes: sempre rede
  if (url.pathname.startsWith("/api/")) return;

  // Requisições de navegação (HTML): sempre rede, sem cache
  if (request.mode === "navigate") return;

  // GIFs do GitHub (exercícios): cache-first com limite
  if (url.hostname === "raw.githubusercontent.com" && url.pathname.endsWith(".gif")) {
    event.respondWith(
      caches.open(GIF_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        try {
          const response = await fetch(request);
          if (response.ok) {
            cache.put(request, response.clone());
            trimCache(GIF_CACHE, MAX_GIF_CACHE);
          }
          return response;
        } catch {
          return new Response("", { status: 408 });
        }
      })
    );
    return;
  }

  // Assets estáticos do app (icons, manifest, SVGs): cache-first
  if (url.origin === self.location.origin && /\.(png|svg|ico|json|webmanifest)$/.test(url.pathname)) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        try {
          const response = await fetch(request);
          if (response.ok) cache.put(request, response.clone());
          return response;
        } catch {
          return new Response("", { status: 408 });
        }
      })
    );
    return;
  }

  // Tudo o mais: direto para a rede, sem interceptar
});
