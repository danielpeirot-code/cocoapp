const CACHE_NAME = "coco-campo-v152";
// Bibliotecas de CDN com versão fixa na URL (Firebase, Chart.js, XLSX, jsPDF). Ficam num cache à parte,
// que NÃO é apagado a cada versão do app: depois da 1ª vez, o app abre sem esperar baixar tudo de novo
// e abre até sem internet.
const CDN_CACHE = "coco-campo-cdn-v1";
const LIMITE_REDE_MS = 3000; // sinal fraco: espera a rede no máximo isso antes de usar o que está guardado
const APP_SHELL = [
  "./",
  "manifest.json",
  "icon-192.png",
  "icon-512.png",
  "icon-192-maskable.png",
  "icon-512-maskable.png",
  "coqueiro.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME && k !== CDN_CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

function ehBibliotecaCdn(url) {
  return (url.hostname === "www.gstatic.com" && url.pathname.startsWith("/firebasejs/"))
    || (url.hostname === "cdnjs.cloudflare.com" && url.pathname.startsWith("/ajax/libs/"));
}

// Cache primeiro: se já tem guardado, usa na hora; senão busca, guarda e usa.
function cachePrimeiro(request) {
  return caches.open(CDN_CACHE).then((cache) =>
    cache.match(request).then((guardado) => {
      if (guardado) return guardado;
      return fetch(request).then((res) => {
        if (res && (res.ok || res.type === "opaque")) cache.put(request, res.clone()).catch(() => {});
        return res;
      });
    })
  );
}

// Rede primeiro (pra pegar sempre a versão mais nova do app), mas com limite de espera: se a rede
// não responder em LIMITE_REDE_MS, usa o que está guardado — a rede continua em segundo plano e,
// quando chega, atualiza o que está guardado pra próxima abertura.
function redeComLimite(request) {
  return new Promise((resolve, reject) => {
    let respondido = false;
    const guardadoOuErro = () => caches.match(request).then((g) => (g ? g : Promise.reject(new Error("sem cache"))));
    const timer = setTimeout(() => {
      guardadoOuErro().then((g) => { if (!respondido) { respondido = true; resolve(g); } }).catch(() => {});
    }, LIMITE_REDE_MS);
    fetch(request).then((res) => {
      const copia = res.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(request, copia)).catch(() => {});
      clearTimeout(timer);
      if (!respondido) { respondido = true; resolve(res); }
    }).catch((err) => {
      clearTimeout(timer);
      if (respondido) return;
      guardadoOuErro().then((g) => { respondido = true; resolve(g); }).catch(() => { respondido = true; reject(err); });
    });
  });
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (ehBibliotecaCdn(url)) { event.respondWith(cachePrimeiro(event.request)); return; }
  if (url.origin !== self.location.origin) return; // deixa passar chamadas externas (Firestore, Drive, clima)
  event.respondWith(redeComLimite(event.request));
});
