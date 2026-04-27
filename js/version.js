/* ==========================================================================
   SEmirK Games - Version stamp
   Tek kaynak: bu dosyadaki VERSION sabitini güncelle, tüm sayfalardaki
   <span class="version-badge"> elementi otomatik güncellenir.
   ========================================================================== */

(function () {
  "use strict";
  const VERSION = "1.3.0";
  const DEPLOYED = "2026-04-27";

  function apply() {
    document.querySelectorAll(".version-badge").forEach((el) => {
      el.textContent = "v" + VERSION;
      el.title = "Yayın: " + DEPLOYED;
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", apply);
  } else {
    apply();
  }
})();
