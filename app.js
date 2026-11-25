/**
 * Cascarón de la app Trazos (2026-11-23).
 *
 * Muestra el panel de Apps Script a pantalla completa dentro de un marco y hace lo que el panel no puede
 * hacer desde adentro:
 *  - Abrir la página de login de Google (Google no se deja mostrar dentro de un marco). Google vuelve
 *    a ESTA página con ?code=…&state=…; se borran de la dirección y se le pasan al panel, que los canjea
 *    en el servidor y comprueba el state (protección contra login CSRF, igual que sin la app).
 *  - Recargar la app entera (logo del menú, Reintentar, Cerrar sesión).
 *
 * Seguridad (auditoría 2026-11-23):
 *  - Vive en un sitio propio (clinicatrazos.github.io): nada más corre en este origen.
 *  - No se deja mostrar dentro de otra página.
 *  - Solo acepta mensajes que vengan de adentro de SU marco y de UN solo origen de Google: el del
 *    primer aviso del panel (los marcos de Google para nuestro script); cualquier otro se ignora.
 *  - La dirección del login de Google la arma acá con valores fijos; del panel solo toma el state.
 *  - No guarda ni ve el token de sesión: lo maneja el panel.
 *
 * Avisos al celular (2026-11-25): el permiso de notificaciones SOLO se puede pedir desde esta página (no desde
 * el panel, que está en un marco de Google). Cuando el panel avisa que hay sesión, se ofrece «Activar avisos»;
 * con el permiso, Firebase da el token del teléfono y se le pasa al panel (a la ventana y origen que ya se
 * fijaron), que lo registra en el servidor con la sesión. El token no sirve para leer nada: solo para recibir.
 */
(function () {
  'use strict';

  var PANEL_URL = 'https://script.google.com/macros/s/AKfycbzb3tEtxV3gp8DB3E_Ui3EEwVnuyHQnKlZDQhE1xiE7jU5iYqUEciiZLhcFxwWh44HwHg/exec';
  var BASE = 'https://clinicatrazos.github.io/';
  var CLIENTE_GOOGLE = '912954049172-8oucf8tvktu99ms85ucsr54bi0ljnle0.apps.googleusercontent.com';
  var ORIGEN_PANEL = /^https:\/\/n-[a-z0-9-]+-script\.googleusercontent\.com$/;
  // Parámetros del regreso de Google que se le pasan al panel. Ningún otro.
  var PARAMS_REGRESO = ['code', 'state', 'error'];

  var marco = document.getElementById('app');
  var bienvenida = document.getElementById('bienvenida');
  var sinConexion = document.getElementById('sin-conexion');
  var textoBienvenida = document.getElementById('bienvenida-texto');
  var listo = false;
  var respaldo = null;
  var origenPanel = null; // se fija con el primer mensaje válido y no cambia más
  var ventanaPanel = null; // la ventana del panel que mandó ese mensaje (para contestarle los avisos)
  var FIREBASE = {
    apiKey: 'AIzaSyCVQb09pfYuvLJ8yMlm3EX_DKhqpI5RHhA', authDomain: 'clinica-trazos.firebaseapp.com',
    projectId: 'clinica-trazos', storageBucket: 'clinica-trazos.firebasestorage.app',
    messagingSenderId: '431160097117', appId: '1:431160097117:web:0cc0b09c9fc2d148a150b4'
  };
  var VAPID = 'BGIq7mgV3A7Ae0mHFjf4JRD4ui307y-4ZSICUpT2NueVOfSF1MfiEmwrcAHmfpv95J2ZfY4jSFy_DPaEO3JTAy4';
  var AVISOS_NO = 'trazos-avisos-no'; // cuándo dijo «Ahora no» (se vuelve a ofrecer a los 7 días)
  var avisos = document.getElementById('avisos');

  /** Dirección del panel: ?pwa=1 y, si Google acaba de volver, su código y state. */
  function urlDelPanel() {
    var aca = new URL(window.location.href);
    var destino = new URL(PANEL_URL);
    destino.searchParams.set('pwa', '1');
    PARAMS_REGRESO.forEach(function (p) {
      var v = aca.searchParams.get(p);
      if (v) destino.searchParams.set(p, v.slice(0, 2048));
    });
    // El código no queda en la dirección ni en el historial (sirve una sola vez).
    if (aca.search) {
      try { window.history.replaceState(null, '', BASE); } catch (e) {}
    }
    return destino.toString();
  }

  /** Dirección del login de Google, armada acá con valores fijos. Del panel solo vienen el state y la
   *  huella PKCE (code_challenge, 2026-11-24); el secreto nunca pasa por el cascarón. */
  function urlLoginGoogle(estado, huella) {
    var u = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    u.searchParams.set('client_id', CLIENTE_GOOGLE);
    u.searchParams.set('redirect_uri', BASE);
    u.searchParams.set('response_type', 'code');
    u.searchParams.set('scope', 'openid email profile');
    u.searchParams.set('prompt', 'select_account');
    u.searchParams.set('state', estado);
    u.searchParams.set('code_challenge', huella);
    u.searchParams.set('code_challenge_method', 'S256');
    return u.toString();
  }

  function ocultarBienvenida() {
    if (listo) return;
    listo = true;
    clearTimeout(respaldo);
    bienvenida.setAttribute('aria-busy', 'false');
    bienvenida.classList.add('saliendo');
    setTimeout(function () { bienvenida.hidden = true; }, 400);
  }

  function abrirPanel() {
    if (!navigator.onLine) {
      bienvenida.hidden = true;
      sinConexion.hidden = false;
      return;
    }
    sinConexion.hidden = true;
    marco.src = urlDelPanel();
    // Si el panel no avisa que está listo (versión vieja, error de Google), igual se muestra a los 25 s.
    respaldo = setTimeout(function () {
      textoBienvenida.textContent = 'Google está tardando un poco más de lo normal…';
      respaldo = setTimeout(ocultarBienvenida, 10000);
    }, 15000);
  }

  /** ¿El mensaje viene de adentro de nuestro marco? (el panel vive dos marcos más adentro) */
  function vieneDelMarco(fuente) {
    var w = fuente;
    for (var i = 0; i < 6 && w; i++) {
      if (w === marco.contentWindow) return true;
      if (w === w.parent) return false;
      w = w.parent;
    }
    return false;
  }

  function origenAceptado(origen) {
    if (origenPanel) return origen === origenPanel;
    if (!ORIGEN_PANEL.test(origen)) return false;
    origenPanel = origen;
    return true;
  }

  /* ---------- Avisos al celular ---------- */
  function avisosSoportados() {
    return 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window && !!window.firebase;
  }
  /** Saca el token del teléfono y se lo pasa al panel (solo a la ventana y origen ya fijados). */
  function enviarTokenAlPanel() {
    if (!avisosSoportados() || Notification.permission !== 'granted' || !ventanaPanel || !origenPanel) return;
    try {
      if (!firebase.apps.length) firebase.initializeApp(FIREBASE);
      navigator.serviceWorker.ready.then(function (reg) {
        return firebase.messaging().getToken({ vapidKey: VAPID, serviceWorkerRegistration: reg });
      }).then(function (token) {
        if (token && ventanaPanel) ventanaPanel.postMessage({ tipo: 'trazos-push', token: token }, origenPanel);
      }).catch(function () {});
    } catch (e) {}
  }
  function ofrecerAvisos() {
    if (!avisosSoportados()) return;
    if (Notification.permission === 'granted') { enviarTokenAlPanel(); return; }
    if (Notification.permission !== 'default') return;
    var dijoNo = 0;
    try { dijoNo = Number(localStorage.getItem(AVISOS_NO) || 0); } catch (e) {}
    if (Date.now() - dijoNo < 7 * 24 * 3600 * 1000) return;
    avisos.hidden = false;
  }
  document.getElementById('avisos-si').addEventListener('click', function () {
    avisos.hidden = true;
    // Este toque es el que habilita el pedido de permiso (Apple lo exige).
    Notification.requestPermission().then(function (p) { if (p === 'granted') enviarTokenAlPanel(); }).catch(function () {});
  });
  document.getElementById('avisos-no').addEventListener('click', function () {
    avisos.hidden = true;
    try { localStorage.setItem(AVISOS_NO, String(Date.now())); } catch (e) {}
  });

  window.addEventListener('message', function (ev) {
    if (!vieneDelMarco(ev.source) || !origenAceptado(ev.origin)) return;
    var m = ev.data;
    if (!m || typeof m !== 'object' || typeof m.tipo !== 'string') return;
    if (!ventanaPanel) ventanaPanel = ev.source;
    if (m.tipo === 'trazos-sesion') {
      // El panel avisa que hay una sesión abierta: recién ahí se ofrecen los avisos.
      if (m.activa === true) ofrecerAvisos(); else avisos.hidden = true;
    } else if (m.tipo === 'trazos-listo') {
      ocultarBienvenida();
    } else if (m.tipo === 'trazos-login' && typeof m.state === 'string' && /^[0-9a-f]{32}$/.test(m.state)) {
      // Huella PKCE obligatoria (desde 2026-11-24, con el panel @127 publicado y probado): sin ella no se
      // pide código a Google, así un código nunca sirve sin el secreto que quedó en el panel.
      if (!(typeof m.challenge === 'string' && /^[A-Za-z0-9_-]{43}$/.test(m.challenge))) return;
      window.location.href = urlLoginGoogle(m.state, m.challenge);
    } else if (m.tipo === 'trazos-recargar') {
      window.location.replace(BASE);
    }
  });

  document.getElementById('reintentar').addEventListener('click', function () {
    window.location.replace(BASE);
  });
  window.addEventListener('online', function () {
    if (!sinConexion.hidden) window.location.replace(BASE);
  });

  // Nunca dentro de otra página: si alguien mete el cascarón en un marco, no carga el panel.
  if (window.top !== window.self) {
    try { window.top.location.href = BASE; } catch (e) {}
    bienvenida.hidden = true;
    return;
  }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js', { scope: './' }).catch(function () {});
  }

  abrirPanel();
})();
