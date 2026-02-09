# Online-Sktorrent-Stremio-addon

Tento doplnok pre [Stremio](https://www.stremio.com/) umožňuje vyhľadávanie a prehrávanie **priamych online streamov (.mp4)** z portálu [online.sktorrent.eu](https://online.sktorrent.eu).

Podporuje:
- 🎬 Filmy
- 📺 Seriály (sezóny/epizódy)
- 📡 Kvality: **🟦 HD (720p) / 🟨 SD (480p) / 🟥 LD (360p)**
- 🏷️ Jazykové značky podľa názvu videa (napr. SK/CZ/EN).  
  Poznámka: “vlajky” emoji sa nemusia zobraziť vo všetkých verziách Stremia/Windows, preto je použitý aj textový fallback.

> Odporúčané testovanie na Node.js v20 (napr. 20.9+).

---

## 🧪 Lokálne spustenie

### 1) Klonovanie repozitára
```bash
git clone https://github.com/<tvoj-github-username>/Online-Sktorrent-Stremio-addon.git
cd Online-Sktorrent-Stremio-addon
```

### 2) Inštalácia balíčkov
```bash
npm install
```

### 3) Spustenie addonu (uvidíš debug výpisy)
```bash
node online-sktorrent-addon.js
```

### 4) Overenie, že beží
Otvor v prehliadači:
- http://127.0.0.1:7000/manifest.json

### 5) Inštalácia do Stremia
V Stremio → **Addons** → **Add addon** a vlož:
- http://127.0.0.1:7000/manifest.json

---

## 🔍 Vlastnosti

- Vyhľadávanie na základe IMDb ID (pri seriáloch aj epizódy `tt1234567:1:2`)
- Fallback logika pri hľadaní (rôzne formáty názvu / S01E01 / 1x1)
- Filter na zníženie “mimo” výsledkov pri filmoch (názov/rok, keď je dostupný)
- Odstránenie duplicít streamov
- Podpora len priamych `.mp4` streamov z online.sktorrent.eu

---

## 🚀 Deploy na Render (online)

### 1) Pushni zmeny na GitHub
Uisti sa, že máš commitnuté zmeny v repozitári (kód + README).

### 2) Vytvor Web Service na Render
- Render: **New + → Web Service**
- Vyber svoj GitHub repo

Nastavenia:
- **Environment:** Node
- **Build Command:** `npm install`
- **Start Command:** `node online-sktorrent-addon.js`

> Render používa premennú `PORT` automaticky. Tento addon ju podporuje (`process.env.PORT || 7000`).

### 3) Manifest po deployi
Po deployi dostaneš URL v štýle:
- `https://<tvoja-app>.onrender.com/manifest.json`

Túto URL vložíš do Stremia rovnako ako lokálnu.

---

## 🖼️ Logo / ikona addonu v Stremiu

Samotný súbor `online-sktorrent-addon-logo.png` sa v Stremiu neukáže automaticky.

Aby Stremio zobrazilo ikonu, musí byť v **manifeste** nastavené napr.:
- `logo: "https://.../online-sktorrent-addon-logo.png"`

To znamená:
- buď to bude URL z Renderu (ak budeš servovať statické súbory),
- alebo URL priamo z GitHubu (raw link).

Ak chceš, pošli mi tvoj aktuálny `online-sktorrent-addon.js` (ten finálny) a doplním ti do manifestu aj `logo` tak, aby to fungovalo.

---

## 📜 Právne upozornenie

Tento addon je určený len na osobné experimentálne účely. Neobsahuje žiadny vlastný multimediálny obsah – slúži výhradne ako index pre verejne dostupné videá z domény [online.sktorrent.eu](https://online.sktorrent.eu).

Používateľ nesie plnú zodpovednosť za akékoľvek použitie. Vývojár nenesie žiadnu zodpovednosť za používanie doplnku, porušenie autorských práv alebo streamovanie chráneného obsahu. Streamovanie akéhokoľvek obsahu je na vlastné riziko.

Ak stránka zmení HTML štruktúru alebo obmedzí prístup, addon môže prestať fungovať.

---

## 🛠 Licencia
MIT

---

## 🧪 Ukážka
<img title="Addon Usage Sample" alt="Example of Addon Usage" src="/sample.png">
