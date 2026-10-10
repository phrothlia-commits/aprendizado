// Service worker mínimo: torna o app instalável e abre o "esqueleto" offline.
// Dados continuam vindo do Supabase (revisão offline com sincronização é item desejável, pendente).
const CACHE = "trilha-v3";
const ESQUELETO = ["/", "/revisar", "/trilha", "/biblioteca", "/voce", "/cartoes", "/diario", "/icone-192.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ESQUELETO)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return;

  // Arquivos estáticos versionados: cache primeiro.
  if (url.pathname.startsWith("/_next/static/") || /\.(png|svg|ico|woff2?)$/.test(url.pathname)) {
    e.respondWith(
      caches.match(req).then(
        (r) =>
          r ||
          fetch(req).then((res) => {
            const copia = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copia));
            return res;
          }),
      ),
    );
    return;
  }

  // Páginas: rede primeiro, cache se offline.
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copia = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copia));
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match("/"))),
    );
  }
});
