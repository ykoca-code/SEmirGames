/* ==========================================================================
   SEmirK Games — PWA back-button handler
   Android'de standalone modda donanım geri tuşu uygulamayı kapatıyor.
   Bu script oyun sayfası açıldığında bir sentinel history girişi ekler;
   geri tuşa basılınca popstate yakalanır ve katalog sayfasına dönülür.
   Tarayıcı sekmesinde no-op'tur (gerçek geri tuş zaten var).
   ========================================================================== */
(function () {
  "use strict";

  // Only meaningful when running as an installed PWA. In a normal browser
  // tab the user already has a real Back button; rewriting history there
  // would be hostile.
  function isStandalone() {
    try {
      return (
        window.matchMedia &&
        (window.matchMedia("(display-mode: standalone)").matches ||
          window.matchMedia("(display-mode: fullscreen)").matches ||
          window.matchMedia("(display-mode: minimal-ui)").matches)
      ) || window.navigator.standalone === true; // iOS Safari home-screen
    } catch (e) { return false; }
  }

  if (!isStandalone()) return;

  // Only intercept on a game page — catalog should let the system handle
  // back normally (so the user can close the PWA from there).
  // kule-kur kök dizinde yaşayan tek oyun — o da kapsanmalı
  var inGame = /\/(games\/[^/]+|kule-kur)\//.test(location.pathname);
  if (!inGame) return;

  function catalogHref() {
    // games/<id>/... veya kule-kur/... → üst dizin katalog köküdür
    var m = location.pathname.match(/^(.*\/)(games\/[^/]+|kule-kur)\/.*$/);
    return (m ? m[1] : "../") + "index.html";
  }

  // Push a sentinel state so the first back press pops this entry instead
  // of closing the PWA. Use replaceState first to avoid stacking on reload.
  try {
    history.replaceState({ semirkPage: true }, "");
    history.pushState({ semirkSentinel: true }, "");
  } catch (e) { /* sandboxed, give up silently */ }

  window.addEventListener("popstate", function () {
    // Replace (not assign) so we don't grow history on every back press.
    location.replace(catalogHref());
  });
})();
