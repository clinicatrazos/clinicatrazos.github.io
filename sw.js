/**
 * Service worker del cascarón Trazos. Hace dos cosas:
 *  1. Permite instalar la app (Android lo exige).
 *  2. Guarda los archivos del cascarón para que, sin internet, se vea la pantalla "Sin conexión" en
 *     vez de un error del navegador.
 * Solo toca archivos de su propia carpeta. El panel (script.google.com) y Google nunca pasan por acá:
 * ningún dato de pacientes se guarda en el celular.
 *
 * Al cambiar cualquier archivo del cascarón, subir VERSION para que los celulares tomen el nuevo.
 */
var VERSION = 'trazos-app-v3';
var ARCHIVOS = [
  './',
  './index.html',
  './app.css',
  './app.js',
  './instalar.html',
  './instalar.js',
  './manifest.webmanifest',
  './iconos/cerebro.png',
  './iconos/icono-192.png',
  './iconos/icono-512.png',
  './iconos/icono-maskable-512.png',
  './iconos/apple-touch-icon.png',
  './iconos/favicon-32.png',
  './fuentes/poppins-400.woff2',
  './fuentes/poppins-600.woff2',
  './fuentes/poppins-700.woff2'
];

self.addEventListener('install', function (ev) {
  ev.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(ARCHIVOS); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (ev) {
  ev.waitUntil(caches.keys().then(function (claves) {
    return Promise.all(claves.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

/** Guarda una copia (solo archivos del cascarón, nunca una dirección con ?code= del login). */
function guardar(pedido, url, resp) {
  if (!resp || !resp.ok || url.search) return Promise.resolve();
  var copia = resp.clone();
  return caches.open(VERSION).then(function (c) { return c.put(pedido, copia); });
}

function deLoGuardado(pedido) {
  return caches.match(pedido, { ignoreSearch: true }).then(function (r) {
    return r || (pedido.mode === 'navigate' ? caches.match('./index.html') : undefined);
  });
}

// Primero la red (así un cambio publicado llega enseguida). Si no hay red o tarda más de 4 s
// (navegación) u 8 s (archivos), se muestra lo guardado, pero el pedido sigue: cuando llega, actualiza
// la copia para la próxima vez (así un arreglo llega aunque la señal sea mala).
self.addEventListener('fetch', function (ev) {
  var pedido = ev.request;
  if (pedido.method !== 'GET') return;
  var url = new URL(pedido.url);
  if (url.origin !== self.location.origin || url.pathname.indexOf(new URL(self.registration.scope).pathname) !== 0) return;

  var red = fetch(pedido);
  var actualizar = red.then(function (resp) { return guardar(pedido, url, resp); }).catch(function () {});
  ev.waitUntil(actualizar);

  var limite = pedido.mode === 'navigate' ? 4000 : 8000;
  ev.respondWith(new Promise(function (responder) {
    var resuelto = false;
    var t = setTimeout(function () {
      deLoGuardado(pedido).then(function (r) {
        if (r && !resuelto) { resuelto = true; responder(r); }
      });
    }, limite);
    red.then(function (resp) {
      clearTimeout(t);
      if (!resuelto) { resuelto = true; responder(resp); }
    }, function () {
      clearTimeout(t);
      deLoGuardado(pedido).then(function (r) {
        if (!resuelto) { resuelto = true; responder(r || Response.error()); }
      });
    });
  }));
});
