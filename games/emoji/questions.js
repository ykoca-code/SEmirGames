/* Emoji Quiz - question pool
 * To add questions, append to QUESTIONS. Each entry has:
 *   emojis    : the emoji clue (string)
 *   answer    : correct answer (Turkish)
 *   category  : "yemek" | "sehir" | "deyim" | "film" | "dunya"
 */
window.QUESTIONS = [
  // ---------- Türk Yemekleri ----------
  { emojis: "🥩🍢",       answer: "Şiş Kebap",      category: "yemek" },
  { emojis: "🍯🌰",       answer: "Baklava",        category: "yemek" },
  { emojis: "☕🇹🇷",      answer: "Türk Kahvesi",   category: "yemek" },
  { emojis: "🍆🍅🥩",     answer: "Karnıyarık",     category: "yemek" },
  { emojis: "🥩🍞🌯",     answer: "Döner",          category: "yemek" },
  { emojis: "🥟🥩",       answer: "Mantı",          category: "yemek" },
  { emojis: "🍅🥒🍞🧅",   answer: "Menemen",        category: "yemek" },
  { emojis: "🍵🌿",       answer: "Çay",            category: "yemek" },
  { emojis: "🥛🍚🍮",     answer: "Sütlaç",         category: "yemek" },
  { emojis: "🐑🍚",       answer: "Pilav",          category: "yemek" },

  // ---------- Türkiye Şehirleri ----------
  { emojis: "🌉🕌",       answer: "İstanbul",       category: "sehir" },
  { emojis: "🎈🪨",       answer: "Kapadokya",      category: "sehir" },
  { emojis: "⛵🌊",       answer: "Bodrum",         category: "sehir" },
  { emojis: "🛁💧🤍",     answer: "Pamukkale",      category: "sehir" },
  { emojis: "🏛️🇹🇷",     answer: "Ankara",         category: "sehir" },
  { emojis: "☀️🏝️",      answer: "Antalya",        category: "sehir" },
  { emojis: "🚢⛴️",       answer: "İzmir",          category: "sehir" },
  { emojis: "🌶️🥙",      answer: "Adana",          category: "sehir" },
  { emojis: "🌋🎿",       answer: "Erciyes",        category: "sehir" },
  { emojis: "🎓🏫🇹🇷",    answer: "Eskişehir",      category: "sehir" },

  // ---------- Atasözleri / Deyimler ----------
  { emojis: "🐢🐢🐢",     answer: "Yavaş ama emin", category: "deyim" },
  { emojis: "💧💧🌊",     answer: "Damlaya damlaya göl olur", category: "deyim" },
  { emojis: "🪨🐦🐦",     answer: "Bir taşla iki kuş",        category: "deyim" },
  { emojis: "🤐🥇",       answer: "Sükut altındır",            category: "deyim" },
  { emojis: "🌳🍎😋",     answer: "Armut piş ağzıma düş",      category: "deyim" },
  { emojis: "🐺☁️🐺",     answer: "Kurtla yatan kurtla kalkar", category: "deyim" },
  { emojis: "🏃💨🐢",     answer: "Acele işe şeytan karışır",  category: "deyim" },
  { emojis: "👁️👁️👃",   answer: "Görmemiş görmüş",           category: "deyim" },

  // ---------- Türk Film / Dizi ----------
  { emojis: "👨‍👦💔",      answer: "Babam ve Oğlum",  category: "film" },
  { emojis: "🚀👽😂",     answer: "G.O.R.A.",        category: "film" },
  { emojis: "💪😂🇹🇷",    answer: "Recep İvedik",    category: "film" },
  { emojis: "🌹🍂💔",     answer: "Yaprak Dökümü",   category: "film" },
  { emojis: "🌹🍷❤️",     answer: "Aşk-ı Memnu",     category: "film" },
  { emojis: "🐺🇹🇷👮",   answer: "Kurtlar Vadisi",  category: "film" },
  { emojis: "🏰👑📜",     answer: "Muhteşem Yüzyıl", category: "film" },
  { emojis: "🥋👴🇹🇷",   answer: "Karadayı",        category: "film" },

  // ---------- Dünya Geneli ----------
  { emojis: "🦁👑",       answer: "Aslan Kral",       category: "dunya" },
  { emojis: "🐭🧀",       answer: "Tom ve Jerry",     category: "dunya" },
  { emojis: "🦇🌃",       answer: "Batman",           category: "dunya" },
  { emojis: "🕷️👨",      answer: "Örümcek Adam",     category: "dunya" },
  { emojis: "⚔️🌌🚀",    answer: "Yıldız Savaşları", category: "dunya" },
  { emojis: "🐠🌊👨",     answer: "Kayıp Balık Nemo", category: "dunya" },
  { emojis: "🍎🐍🌳",     answer: "Adem ile Havva",   category: "dunya" },
  { emojis: "🏠🐺🐷",     answer: "Üç Küçük Domuz",   category: "dunya" }
];
