/* ==========================================================================
   Çekiliş Çarkı (101 Okey masası ataması)
   - Kullanıcı isimleri ekler, çark dilimlenir
   - Çark dönüp duruyor; üst pointer kazananı belirler
   - İlk 4 kazanan masaya, sonraki 2 kazanan yancı olur
   - 6 tur sonunda biter
   ========================================================================== */
(function () {
  "use strict";

  const nameInput = document.getElementById("nameInput");
  const addNameBtn = document.getElementById("addNameBtn");
  const nameListEl = document.getElementById("nameList");
  const buildWheelBtn = document.getElementById("buildWheelBtn");
  const spinBtn = document.getElementById("spinBtn");
  const restartSameBtn = document.getElementById("restartSameBtn");
  const resetAllBtn = document.getElementById("resetAllBtn");
  const resultEl = document.getElementById("result");
  const statusText = document.getElementById("statusText");
  const wheelCanvas = document.getElementById("wheelCanvas");
  const ctx = wheelCanvas.getContext("2d");

  const seatPlayerEls = [
    document.getElementById("seatPlayer0"),
    document.getElementById("seatPlayer1"),
    document.getElementById("seatPlayer2"),
    document.getElementById("seatPlayer3"),
  ];

  const seatExtraEls = [
    document.getElementById("seatExtra0"),
    document.getElementById("seatExtra1"),
  ];

  const spinCounterEl = document.getElementById("spinCounter");
  const nonPlayersListEl = document.getElementById("nonPlayersList");
  const seatedListEl = document.getElementById("seatedList");

  const defaultNames = ["Ayaz", "Akif", "Yunus", "Selçuk", "Bekir", "Hocam", "Memo", "İsmail"];

  let names = defaultNames.slice();
  let activeNames = [];
  let wheelReady = false;
  let isSpinning = false;
  let pendingWinnerIndex = null;
  let wheelMeta = null;

  const maxSpins = 6;
  let spinCount = 0;
  let currentRotation = 0; // cumulative degrees so each spin builds on the last

  const seatPlayers = [null, null, null, null];
  const seatExtras = [null, null];

  const nameColors = {};

  function getColorForName(name) {
    const key = name.trim().toLowerCase();
    if (nameColors[key]) return nameColors[key];
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
      hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
    }
    const hue = hash % 360;
    const color = "hsl(" + hue + ", 70%, 55%)";
    nameColors[key] = color;
    return color;
  }

  function renderNameList() {
    nameListEl.innerHTML = "";
    if (names.length === 0) return;

    names.forEach(function (name, index) {
      const li = document.createElement("li");
      const pill = document.createElement("span");
      pill.className = "name-pill";
      pill.textContent = name;

      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "remove-btn";
      removeBtn.innerHTML = "&times;";
      removeBtn.title = "Sil";

      removeBtn.addEventListener("click", function () {
        names.splice(index, 1);
        wheelReady = false;
        activeNames = [];
        statusText.textContent = "Hazır değil";
        spinBtn.disabled = true;
        renderNameList();
        clearWheel();
        resetSeatsAndSpins();
        updateNonPlayersList();
        resultEl.innerHTML =
          "Katılımcı listesi değişti. Yeni liste ile <strong>Çarkı Oluştur</strong> butonuna bas.";
      });

      li.appendChild(pill);
      li.appendChild(removeBtn);
      nameListEl.appendChild(li);
    });
  }

  function clearWheel() {
    ctx.clearRect(0, 0, wheelCanvas.width, wheelCanvas.height);
    wheelCanvas.style.transition = "transform 0s";
    wheelCanvas.style.transform = "rotate(0deg)";
    currentRotation = 0;
    wheelMeta = null;
  }

  function updateSpinCounter() {
    spinCounterEl.textContent = String(spinCount);
  }

  function resetSeatsAndSpins() {
    spinCount = 0;

    for (let i = 0; i < seatPlayers.length; i++) {
      seatPlayers[i] = null;
      const el = seatPlayerEls[i];
      el.textContent = "Oyuncu " + (i + 1);
      el.classList.add("empty");
      el.classList.remove("filled");
    }

    for (let j = 0; j < seatExtras.length; j++) {
      seatExtras[j] = null;
      const el = seatExtraEls[j];
      el.textContent = "Yancı " + (j + 1);
      el.classList.add("empty");
      el.classList.remove("filled");
    }

    updateSpinCounter();
    nonPlayersListEl.textContent = "—";
    seatedListEl.textContent = "—";
  }

  function updateNonPlayersList() {
    if (!names || names.length === 0) {
      nonPlayersListEl.textContent = "—";
      seatedListEl.textContent = "—";
      return;
    }

    const seated = [];
    for (let i = 0; i < seatPlayers.length; i++) {
      if (seatPlayers[i] && seated.indexOf(seatPlayers[i]) === -1) {
        seated.push(seatPlayers[i]);
      }
    }
    for (let j = 0; j < seatExtras.length; j++) {
      if (seatExtras[j] && seated.indexOf(seatExtras[j]) === -1) {
        seated.push(seatExtras[j]);
      }
    }

    const nonPlayers = names.filter(function (n) {
      return seated.indexOf(n) === -1;
    });

    nonPlayersListEl.textContent = nonPlayers.length ? nonPlayers.join(", ") : "Yok";
    seatedListEl.textContent = seated.length ? seated.join(", ") : "—";
  }

  function drawWheel(list) {
    const count = list.length;
    if (count === 0) {
      clearWheel();
      return;
    }

    const width = wheelCanvas.width;
    const height = wheelCanvas.height;
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) / 2 - 12;

    ctx.clearRect(0, 0, width, height);

    const sliceAngleBase = (2 * Math.PI) / count;
    const centersDeg = [];
    const startDeg = [];
    const endDeg = [];
    let currentAngle = 0;

    for (let i = 0; i < count; i++) {
      const startAngle = currentAngle;
      const endAngle = currentAngle + sliceAngleBase;
      const centerAngle = startAngle + sliceAngleBase / 2;

      startDeg.push((startAngle * 180) / Math.PI);
      endDeg.push((endAngle * 180) / Math.PI);
      centersDeg.push((centerAngle * 180) / Math.PI);

      const fill = getColorForName(list[i]);

      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.arc(centerX, centerY, radius, startAngle, endAngle);
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();

      ctx.strokeStyle = "#020617";
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.save();
      ctx.translate(centerX, centerY);
      ctx.rotate(centerAngle);

      const fontSize = Math.max(12, 22 - count);
      ctx.font = "bold " + fontSize + "px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
      ctx.fillStyle = "#020617";
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillText(list[i], radius - 16, 0);
      ctx.restore();

      currentAngle = endAngle;
    }

    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.lineWidth = 4;
    ctx.strokeStyle = "#111827";
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(centerX, centerY, radius * 0.12, 0, Math.PI * 2);
    ctx.fillStyle = "#020617";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#e5e7eb";
    ctx.stroke();

    wheelMeta = { centersDeg: centersDeg, startDeg: startDeg, endDeg: endDeg };
  }

  function assignWinnerToTable(winnerName, spinNo) {
    if (!winnerName) return;

    const emptyMain = [];
    for (let i = 0; i < seatPlayers.length; i++) {
      if (!seatPlayers[i]) emptyMain.push(i);
    }

    if (spinNo <= 4 && emptyMain.length > 0) {
      const targetIndex = emptyMain[Math.floor(Math.random() * emptyMain.length)];
      seatPlayers[targetIndex] = winnerName;
      const el = seatPlayerEls[targetIndex];
      el.textContent = winnerName;
      el.classList.remove("empty");
      el.classList.add("filled");
      return;
    }

    const emptyExtra = [];
    for (let j = 0; j < seatExtras.length; j++) {
      if (!seatExtras[j]) emptyExtra.push(j);
    }

    if (emptyExtra.length > 0) {
      const targetIndex2 = emptyExtra[Math.floor(Math.random() * emptyExtra.length)];
      seatExtras[targetIndex2] = winnerName;
      const el2 = seatExtraEls[targetIndex2];
      el2.textContent = winnerName;
      el2.classList.remove("empty");
      el2.classList.add("filled");
    }
  }

  function buildWheelCore() {
    activeNames = names.slice();
    drawWheel(activeNames);

    wheelCanvas.style.transition = "transform 0s";
    wheelCanvas.style.transform = "rotate(0deg)";
    currentRotation = 0;

    wheelReady = true;
    pendingWinnerIndex = null;
    statusText.textContent = "Çark hazır";
    spinBtn.disabled = false;
    resetSeatsAndSpins();
    updateNonPlayersList();
    resultEl.innerHTML =
      "Çark hazır 🚀<br>Artık <strong>Çarkı Çevir</strong> butonuna basabilirsin. Toplam 6 tur çevirebilirsin.";
  }

  buildWheelBtn.addEventListener("click", function () {
    if (names.length < 2) {
      alert("En az 2 isim eklemelisin.");
      return;
    }

    const counts = {};
    for (let i = 0; i < names.length; i++) {
      const key = names[i].trim().toLowerCase();
      if (!key) continue;
      counts[key] = (counts[key] || 0) + 1;
    }
    const duplicates = [];
    for (const k in counts) {
      if (Object.prototype.hasOwnProperty.call(counts, k) && counts[k] > 1) {
        duplicates.push(k);
      }
    }
    if (duplicates.length > 0) {
      alert(
        "Aynı isim birden fazla yazılmış: " + duplicates.join(", ") +
          "\nLütfen her ismi yalnızca bir kez yaz."
      );
      return;
    }

    buildWheelCore();
  });

  function addNameFromInput() {
    const raw = nameInput.value.trim();
    if (!raw) return;
    names.push(raw);
    wheelReady = false;
    activeNames = [];
    statusText.textContent = "Hazır değil";
    spinBtn.disabled = true;
    nameInput.value = "";
    nameInput.focus();
    renderNameList();
    clearWheel();
    resetSeatsAndSpins();
    updateNonPlayersList();
    resultEl.innerHTML =
      "İsim listesi güncellendi. Yeni liste ile çarkı kullanmak için <strong>Çarkı Oluştur</strong> butonuna bas.";
  }

  addNameBtn.addEventListener("click", addNameFromInput);

  nameInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      e.preventDefault();
      addNameFromInput();
    }
  });

  wheelCanvas.addEventListener("transitionend", function (e) {
    if (e.propertyName !== "transform") return;
    if (!isSpinning) return;
    if (pendingWinnerIndex === null || !activeNames[pendingWinnerIndex]) {
      isSpinning = false;
      spinBtn.disabled = !wheelReady;
      return;
    }

    const winnerName = activeNames[pendingWinnerIndex];
    const currentSpin = spinCount + 1;

    assignWinnerToTable(winnerName, currentSpin);

    spinCount = currentSpin;
    updateSpinCounter();
    updateNonPlayersList();

    resultEl.innerHTML =
      "🎉 " + currentSpin +
      ". tur kazananı: <span class=\"winner\">" + winnerName + "</span>";

    activeNames.splice(pendingWinnerIndex, 1);

    if (activeNames.length > 0) {
      drawWheel(activeNames);
    } else {
      clearWheel();
      wheelReady = false;
      spinBtn.disabled = true;
    }

    isSpinning = false;

    if (spinCount >= maxSpins) {
      spinBtn.disabled = true;
      resultEl.innerHTML +=
        "<br><span style=\"font-size:12px;color:#9ca3af;\">6 tur tamamlandı. Yeni oyun için 'Bu isimlerle baştan başla' veya 'Varsayılanlara dön' butonunu kullan.</span>";
    } else if (activeNames.length === 0) {
      resultEl.innerHTML +=
        "<br><span style=\"font-size:12px;color:#9ca3af;\">Çarkta isim kalmadı. Yeni oyun için 'Bu isimlerle baştan başla' veya 'Varsayılanlara dön' butonunu kullan.</span>";
    } else {
      spinBtn.disabled = false;
    }
  });

  spinBtn.addEventListener("click", function () {
    if (!wheelReady) {
      alert("Önce isimleri ekleyip çarkı oluşturmalısın.");
      return;
    }
    if (activeNames.length === 0) {
      alert("Çarkta hiç isim kalmadı. Yeni oyun için 'Bu isimlerle baştan başla' veya 'Varsayılanlara dön' butonunu kullan.");
      return;
    }
    if (isSpinning) return;
    if (spinCount >= maxSpins) {
      alert("Toplam 6 tur çevrilebilir. Yeni oyun için 'Bu isimlerle baştan başla' veya 'Varsayılanlara dön' butonunu kullan.");
      return;
    }

    if (!wheelMeta || !wheelMeta.startDeg || wheelMeta.startDeg.length !== activeNames.length) {
      drawWheel(activeNames);
      if (!wheelMeta) {
        alert("Çark hazırlanırken bir hata oluştu.");
        return;
      }
    }

    isSpinning = true;
    spinBtn.disabled = true;
    resultEl.textContent = "Çark dönüyor... birkaç saniye içinde duracak.";

    const startDeg = wheelMeta.startDeg;
    const endDeg = wheelMeta.endDeg;

    const winnerIndex = Math.floor(Math.random() * activeNames.length);
    pendingWinnerIndex = winnerIndex;

    const sliceStart = startDeg[winnerIndex];
    const sliceEnd = endDeg[winnerIndex];
    const sliceWidth = sliceEnd - sliceStart;

    const margin = sliceWidth * 0.25;
    let minAngle = sliceStart + margin;
    let maxAngle = sliceEnd - margin;
    if (maxAngle <= minAngle) {
      minAngle = (sliceStart + sliceEnd) / 2;
      maxAngle = minAngle;
    }
    const randFactor = Math.random();
    const targetAngleDeg = minAngle + randFactor * (maxAngle - minAngle);

    // Final rotation must satisfy (finalRotation % 360) === (270 - targetAngleDeg) mod 360
    // AND finalRotation - currentRotation >= MIN_EXTRA_SPINS * 360 so each spin keeps spinning
    // forward by at least the requested number of full turns.
    const MIN_EXTRA_SPINS = 3;        // sertçe garanti edilen tur sayısı
    const RANDOM_EXTRA_SPINS = 3;     // üzerine eklenecek rastgele tur (0..3)
    const normalizedTarget =
      (((270 - targetAngleDeg) % 360) + 360) % 360;
    const minRotation = currentRotation + MIN_EXTRA_SPINS * 360;
    // Smallest multiple of 360 + normalizedTarget that's >= minRotation
    let finalRotation =
      Math.ceil((minRotation - normalizedTarget) / 360) * 360 + normalizedTarget;
    if (finalRotation < minRotation) finalRotation += 360;
    finalRotation += Math.floor(Math.random() * (RANDOM_EXTRA_SPINS + 1)) * 360;
    currentRotation = finalRotation;

    wheelCanvas.style.transition = "transform 7s cubic-bezier(0.1, 0.7, 0.1, 1)";
    wheelCanvas.style.transform = "rotate(" + finalRotation + "deg)";
  });

  resetAllBtn.addEventListener("click", function () {
    names = defaultNames.slice();
    activeNames = [];
    renderNameList();
    wheelReady = false;
    pendingWinnerIndex = null;
    statusText.textContent = "Hazır değil";
    spinBtn.disabled = true;
    clearWheel();
    resetSeatsAndSpins();
    updateNonPlayersList();
    resultEl.innerHTML =
      "Varsayılan isimlere dönüldü. İstersen düzenleyip <strong>Çarkı Oluştur</strong> butonuna bas.";
  });

  restartSameBtn.addEventListener("click", function () {
    if (names.length < 2) {
      alert("Önce en az 2 isim eklemelisin.");
      return;
    }

    resetSeatsAndSpins();
    updateNonPlayersList();

    wheelCanvas.style.transition = "transform 0.5s ease-out";
    wheelCanvas.style.transform = "rotate(0deg)";
    currentRotation = 0;

    activeNames = names.slice();
    drawWheel(activeNames);
    wheelReady = true;

    spinBtn.disabled = false;
    statusText.textContent = "Çark hazır";
    resultEl.innerHTML = "Yeni oyun başlatıldı. Aynı isimlerle tekrar 6 tur çevirebilirsin.";
  });

  // Boot
  renderNameList();
  clearWheel();
  resetSeatsAndSpins();
  updateNonPlayersList();
})();
