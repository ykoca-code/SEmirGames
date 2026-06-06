/* ==========================================================================
   SEmirK Games - Leaderboard
   Per-game top 10 stored in localStorage. Player's name is remembered
   globally across games (semirk_lb_name) so they don't retype it.

   API:
     Leaderboard.qualifies(gameId, score, lowerIsBetter)
     Leaderboard.add(gameId, name, score, extra, lowerIsBetter) -> rank
     Leaderboard.renderHTML(gameId, formatter) -> innerHTML string
     Leaderboard.promptName({ message }) -> Promise<string|null>
     Leaderboard.getName(), Leaderboard.setName(name)
   ========================================================================== */
window.Leaderboard = (function () {
  "use strict";

  const PREFIX = "semirk_lb_";
  const NAME_KEY = "semirk_lb_name";
  const MAX = 10;

  function safeJSON(str, fallback) {
    try { return JSON.parse(str); } catch (e) { return fallback; }
  }

  function get(gameId) {
    return safeJSON(localStorage.getItem(PREFIX + gameId), []) || [];
  }

  function save(gameId, entries) {
    localStorage.setItem(PREFIX + gameId, JSON.stringify(entries));
  }

  function getName() {
    return localStorage.getItem(NAME_KEY) || "";
  }

  function setName(name) {
    if (name) localStorage.setItem(NAME_KEY, String(name).slice(0, 16));
  }

  function qualifies(gameId, score, lowerIsBetter) {
    const all = get(gameId);
    if (all.length < MAX) return true;
    const worst = all[all.length - 1].score;
    return lowerIsBetter ? score < worst : score > worst;
  }

  function add(gameId, name, score, extra, lowerIsBetter) {
    const all = get(gameId);
    const entry = Object.assign(
      { name: String(name || "Anonim").slice(0, 16), score: score, date: Date.now() },
      extra || {}
    );
    all.push(entry);
    all.sort((a, b) => (lowerIsBetter ? a.score - b.score : b.score - a.score));
    const top = all.slice(0, MAX);
    save(gameId, top);
    return top.indexOf(entry) + 1; // 1-based rank; 0 if dropped off
  }

  function escape(s) {
    const div = document.createElement("div");
    div.textContent = String(s);
    return div.innerHTML;
  }

  function renderHTML(gameId, formatter) {
    const entries = get(gameId);
    if (entries.length === 0) {
      return '<div class="lb-empty">Henüz skor yok — ilk sen ol!</div>';
    }
    let html = '<ol class="lb-list">';
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      const scoreStr = formatter ? formatter(e) : escape(e.score);
      const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "";
      const rank = medal || (i + 1) + ".";
      html +=
        '<li class="lb-row"><span class="lb-rank">' + rank +
        '</span><span class="lb-name">' + escape(e.name) +
        '</span><span class="lb-score">' + scoreStr + '</span></li>';
    }
    html += "</ol>";
    return html;
  }

  function promptName(opts) {
    opts = opts || {};
    return new Promise((resolve) => {
      const overlay = document.createElement("div");
      overlay.className = "lb-prompt-overlay";
      overlay.innerHTML =
        '<div class="lb-prompt">' +
          '<h3>🏆 İlk 10\'a girdin!</h3>' +
          '<p>' + escape(opts.message || "Liderlik tablosuna eklenmek için ismini gir.") + '</p>' +
          '<input type="text" id="lbNameInput" maxlength="16" placeholder="İsim" autocomplete="off" />' +
          '<div class="lb-prompt-actions">' +
            '<button type="button" class="btn" data-action="skip">Geç</button>' +
            '<button type="button" class="btn btn-primary" data-action="save">Kaydet</button>' +
          '</div>' +
        '</div>';
      document.body.appendChild(overlay);
      const input = overlay.querySelector("#lbNameInput");
      input.value = getName();
      setTimeout(() => { input.focus(); input.select(); }, 60);

      function done(name) {
        overlay.remove();
        resolve(name);
      }

      overlay.addEventListener("click", (e) => {
        const a = e.target.dataset && e.target.dataset.action;
        if (a === "save") {
          const name = input.value.trim() || "Anonim";
          setName(name);
          done(name);
        } else if (a === "skip") {
          done(null);
        }
      });

      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          const name = input.value.trim() || "Anonim";
          setName(name);
          done(name);
        }
      });
    });
  }

  return { get, qualifies, add, renderHTML, promptName, getName, setName };
})();
