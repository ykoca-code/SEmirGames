# SEmirK Games

Zararsız, eğlenceli ve eğitici oyunlar platformu. Statik HTML/CSS/JS — kurulum gerektirmez, herhangi bir statik sunucuda (GitHub Pages dahil) çalışır.

## Özellikler

- Modern, mobil uyumlu arayüz
- Kategori filtreleme (Bulmaca, Mantık, Arcade, Masa Oyunu, Eğitici…)
- Yaş filtresi (4+, 7+, 12+, 16+)
- Anlık arama
- Her oyun bağımsız bir klasörde — eklemek/güncellemek kolay

## Klasör Yapısı

```
SEmirGames/
├── index.html              # Ana sayfa (oyun kataloğu)
├── css/style.css           # Genel stiller
├── js/main.js              # Katalog mantığı (filtre, arama, render)
├── assets/
│   └── icons/logo.svg      # Site logosu
├── games/
│   ├── games.json          # Tüm oyunların kayıt dosyası
│   └── <game-id>/          # Her oyun kendi klasöründe
│       ├── manifest.json   # Oyun metadatası
│       ├── index.html      # Oyun giriş noktası
│       ├── style.css       # Oyuna özel stiller
│       ├── script.js       # Oyun mantığı
│       └── thumbnail.svg   # Kart görseli
└── README.md
```

## Yerelde Çalıştırma

`fetch` API'si yerel dosya protokolünde kısıtlı olduğundan, basit bir HTTP sunucusu kullan:

```bash
# Python 3
python3 -m http.server 8000

# veya Node
npx serve .
```

Sonra `http://localhost:8000` adresini ziyaret et.

## Yeni Oyun Ekleme

1. **Klasör oluştur:** `games/<game-id>/`
2. **Dosyaları ekle:**
   - `index.html` — oyun giriş noktası
   - `style.css` — oyuna özel stiller (opsiyonel)
   - `script.js` — oyun mantığı
   - `thumbnail.svg` veya `thumbnail.png` — kart görseli (kare format önerilir)
   - `manifest.json` — aşağıdaki şemayla
3. **Kayıt dosyasına ekle:** `games/games.json` içindeki `games` dizisine bir kayıt ekle.
4. Bitti! Ana sayfa yeni oyunu otomatik olarak gösterecek.

### `manifest.json` Şeması

```json
{
  "id": "tetris",
  "title": "Tetris",
  "description": "Klasik blok yığma oyunu.",
  "version": "1.0.0",
  "category": "arcade",
  "categoryLabel": "Arcade",
  "ageRating": "7+",
  "thumbnail": "thumbnail.svg",
  "entry": "index.html",
  "tags": ["arcade", "blok", "klasik"],
  "author": "İsim",
  "controls": ["Klavye", "Mouse"]
}
```

### `games/games.json` Kayıt Formatı

```json
{
  "id": "tetris",
  "title": "Tetris",
  "description": "Klasik blok yığma oyunu.",
  "category": "arcade",
  "categoryLabel": "Arcade",
  "ageRating": "7+",
  "thumbnail": "games/tetris/thumbnail.svg",
  "path": "games/tetris/index.html",
  "tags": ["arcade", "blok", "klasik"]
}
```

> **Not:** `manifest.json` oyunun kendi klasöründe yer alır ve göreli yollar kullanır. `games.json` ise ana sayfadan kullanıldığı için kök dizine göre yollar içerir.

## Kategoriler

Mevcut kategoriler (`games/games.json` → `categories`):

| ID | Etiket |
|------|---------|
| `puzzle` | Bulmaca |
| `logic` | Mantık |
| `arcade` | Arcade |
| `board` | Masa Oyunu |
| `educational` | Eğitici |

Yeni kategori eklemek için `games.json` içindeki `categories` dizisine bir kayıt ekle.

## Yaş Sınıflandırması

| Etiket | Açıklama |
|--------|----------|
| 4+ | Okul öncesi, çok basit oyunlar |
| 7+ | Temel okuma/sayma gerektiren oyunlar |
| 12+ | Strateji, daha karmaşık mantık |
| 16+ | İleri zorluk |

Filtre, seçilen yaş grubu ve daha düşük yaş gruplarını birlikte gösterir (örn. "12+" filtresi `4+`, `7+` ve `12+` oyunları gösterir).

## Mevcut Oyunlar

- **Sudoku** — Klasik 9x9 mantık bulmacası (Mantık · 7+)
- **Tetris** — Klasik blok yığma oyunu (Arcade · 7+)
- **2048** — Aynı sayıları birleştirerek 2048'e ulaş (Bulmaca · 7+)
- **Hafıza** — Kart eşleştirme oyunu (Eğitici · 4+)
- **OKEYTRO** — Okey 101 taşlarıyla roguelike puan oyunu (Masa Oyunu · 12+)

### 🀄 OKEYTRO

Balatro'nun roguelike döngüsünü Okey 101 taşlarıyla birleştiren tek dosyalık
bir puan oyunu. 14 taşlık istekandan per ve seriler açarak puan barajlarını
geç; kazandığın jetonlarla dükkândan pasif güç veren **Gösterge Taşları**,
tek seferlik **Fal Kahveleri** ve kalıcı çip artışı sağlayan **Tavla Pulları**
al. Her üçüncü baraj, özel kısıtlamalar getiren bir **Boss** elidir.
Puanlama Balatro tarzında `(çip × çarpan)` üzerinden işler; okey (joker)
klasik kurallardaki gibi göstergenin bir üstüdür.

▶️ **Oyna:** [https://ykoca-code.github.io/SEmirGames/games/okeytro/](https://ykoca-code.github.io/SEmirGames/games/okeytro/)

## Lisans

Tüm hakları saklıdır © SEmirK Games.
