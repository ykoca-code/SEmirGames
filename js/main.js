/* ==========================================================================
   SEmirK Games - Main app logic
   Loads games from games/games.json and renders the catalog.
   ========================================================================== */

(function () {
  "use strict";

  const state = {
    games: [],
    categories: [],
    ageGroups: [],
    activeCategory: "all",
    activeAge: "all",
    query: "",
    aboutMode: false,   // "Hakkında" tıklanınca sadece gizli oyunlar görünür
  };

  // Bu oyunlar normal katalogda GİZLİDİR; yalnızca üstteki "Hakkında"ya
  // tıklanınca (ve sadece onlar) listelenir.
  const HIDDEN_IDS = new Set(["wheel", "okeytro", "okeytro-gemini"]);

  const els = {
    grid: document.getElementById("gamesGrid"),
    categoryChips: document.getElementById("categoryChips"),
    ageChips: document.getElementById("ageChips"),
    search: document.getElementById("searchInput"),
    sectionTitle: document.getElementById("sectionTitle"),
    emptyState: document.getElementById("emptyState"),
    year: document.getElementById("year"),
  };

  function init() {
    if (els.year) els.year.textContent = new Date().getFullYear();

    fetch("games/games.json", { cache: "no-cache" })
      .then((r) => {
        if (!r.ok) throw new Error("games.json yüklenemedi");
        return r.json();
      })
      .then((data) => {
        // En son eklenen oyun en üstte: games.json'a yeni oyunlar sona eklenir
        state.games = (Array.isArray(data.games) ? data.games : []).slice().reverse();
        state.categories = Array.isArray(data.categories) ? data.categories : [];
        state.ageGroups = Array.isArray(data.ageGroups) ? data.ageGroups : [];

        renderChips(els.categoryChips, state.categories, state.activeCategory, (id) => {
          state.activeCategory = id;
          exitAboutMode();
          render();
        });
        renderChips(els.ageChips, state.ageGroups, state.activeAge, (id) => {
          state.activeAge = id;
          exitAboutMode();
          render();
        });

        els.search.addEventListener("input", (e) => {
          state.query = e.target.value.trim().toLocaleLowerCase("tr");
          if (state.query) state.aboutMode = false; // arama gizli moddan çıkarır
          render();
        });

        // "Hakkında" → gizli oyunları göster/gizle
        const aboutLink = document.querySelector(".header-link");
        if (aboutLink) {
          aboutLink.addEventListener("click", (e) => {
            e.preventDefault();
            state.aboutMode = !state.aboutMode;
            aboutLink.classList.toggle("active", state.aboutMode);
            render();
            const sec = document.querySelector(".games-section");
            if (sec) sec.scrollIntoView({ behavior: "smooth", block: "start" });
          });
        }

        render();
      })
      .catch((err) => {
        console.error(err);
        els.grid.innerHTML =
          '<p class="empty-state">Oyun listesi yüklenemedi. Lütfen daha sonra tekrar deneyin.</p>';
      });
  }

  function renderChips(container, items, activeId, onSelect) {
    container.innerHTML = "";
    items.forEach((item) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "chip" + (item.id === activeId ? " active" : "");
      btn.textContent = item.label;
      btn.dataset.id = item.id;
      btn.addEventListener("click", () => {
        container.querySelectorAll(".chip").forEach((c) => c.classList.remove("active"));
        btn.classList.add("active");
        onSelect(item.id);
      });
      container.appendChild(btn);
    });
  }

  function exitAboutMode() {
    state.aboutMode = false;
    const aboutLink = document.querySelector(".header-link");
    if (aboutLink) aboutLink.classList.remove("active");
  }

  function filterGames() {
    // "Hakkında" modunda SADECE gizli oyunlar (Çekiliş Çarkı, Okeytro,
    // Okeytro Klasik) görünür; diğer filtreler yok sayılır.
    if (state.aboutMode) {
      return state.games.filter((g) => HIDDEN_IDS.has(g.id));
    }
    return state.games.filter((g) => {
      // Gizli oyunlar normal katalogda görünmez
      if (HIDDEN_IDS.has(g.id)) return false;
      if (state.activeCategory !== "all" && g.category !== state.activeCategory) {
        return false;
      }
      if (state.activeAge !== "all" && g.ageRating !== state.activeAge) {
        // Allow lower-age games to show in higher-age filter as well
        const order = ["4+", "7+", "12+", "16+"];
        const gameIdx = order.indexOf(g.ageRating);
        const filterIdx = order.indexOf(state.activeAge);
        if (gameIdx === -1 || filterIdx === -1 || gameIdx > filterIdx) {
          return false;
        }
      }
      if (state.query) {
        const haystack = [
          g.title,
          g.description || "",
          g.categoryLabel || "",
          ...(g.tags || []),
        ]
          .join(" ")
          .toLocaleLowerCase("tr");
        if (!haystack.includes(state.query)) return false;
      }
      return true;
    });
  }

  function render() {
    const games = filterGames();
    els.grid.innerHTML = "";

    if (games.length === 0) {
      els.emptyState.classList.remove("hidden");
    } else {
      els.emptyState.classList.add("hidden");
    }

    games.forEach((g) => els.grid.appendChild(buildCard(g)));

    if (state.aboutMode) {
      els.sectionTitle.textContent = "Hakkında — Özel Oyunlar";
      return;
    }
    const cat = state.categories.find((c) => c.id === state.activeCategory);
    els.sectionTitle.textContent =
      state.activeCategory === "all" && state.activeAge === "all"
        ? "Tüm Oyunlar"
        : `${cat ? cat.label : "Tüm"} Oyunlar`;
  }

  function buildCard(game) {
    const a = document.createElement("a");
    a.href = game.path;
    a.className = "game-card";
    a.setAttribute("aria-label", `${game.title} oyununu oyna`);

    const thumb = document.createElement("div");
    thumb.className = "game-thumb";

    if (game.thumbnail) {
      const img = document.createElement("img");
      img.src = game.thumbnail;
      img.alt = game.title;
      img.loading = "lazy";
      thumb.appendChild(img);
    }

    if (game.ageRating) {
      const badge = document.createElement("span");
      badge.className = "age-badge";
      badge.textContent = game.ageRating;
      thumb.appendChild(badge);
    }

    const info = document.createElement("div");
    info.className = "game-info";

    const title = document.createElement("h3");
    title.className = "game-title";
    title.textContent = game.title;

    const cat = document.createElement("p");
    cat.className = "game-category";
    cat.textContent = game.categoryLabel || "";

    info.append(title, cat);
    a.append(thumb, info);
    return a;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
