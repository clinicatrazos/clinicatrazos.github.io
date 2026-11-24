/** Página de instalación: en Android muestra un botón "Instalar Trazos" cuando Chrome lo permite. */
(function () {
  'use strict';
  var aviso = null;
  var boton = document.getElementById('instalar-ya');

  window.addEventListener('beforeinstallprompt', function (ev) {
    ev.preventDefault();
    aviso = ev;
    boton.hidden = false;
  });

  boton.addEventListener('click', function () {
    if (!aviso) return;
    aviso.prompt();
    aviso.userChoice.then(function () { aviso = null; boton.hidden = true; });
  });

  // En iPhone se muestran primero los pasos de iPhone.
  if (/iPhone|iPad|iPod/.test(navigator.userAgent)) {
    var iphone = document.getElementById('iphone');
    iphone.parentNode.insertBefore(iphone, document.getElementById('android'));
  }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js', { scope: './' }).catch(function () {});
  }
})();
