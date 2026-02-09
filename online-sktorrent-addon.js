// online-sktorrent-addon.js
// Note: Use Node.js v20.09 LTS for testing (https://nodejs.org/en/blog/release/v20.9.0)
const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");
const axios = require("axios");
const cheerio = require("cheerio");
const { decode } = require("entities");

const PORT = process.env.PORT || 7000;

// Logo cez GitHub raw (najjednoduchšie)
const GITHUB_RAW_BASE = "https://raw.githubusercontent.com/Luberda66/Online-Sktorrent-Stremio-addon/main";
const LOGO_URL = `${GITHUB_RAW_BASE}/online-sktorrent-addon-logo.png`;
const BACKGROUND_URL = `${GITHUB_RAW_BASE}/sample.png`;

const builder = addonBuilder({
    id: "org.stremio.sktonline",
    version: "1.0.0",
    name: "SKTonline Online Streams",
    description: "Priame online videá (720p/480p/360p) z online.sktorrent.eu",
    types: ["movie", "series"],
    catalogs: [
        { type: "movie", id: "sktonline-movie", name: "SKTonline Filmy" },
        { type: "series", id: "sktonline-series", name: "SKTonline Seriály" }
    ],
    resources: ["stream"],
    idPrefixes: ["tt"],
    // ✅ aby sa zobrazilo logo v Stremiu
    logo: LOGO_URL,
    background: BACKGROUND_URL
});

const commonHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/114.0.0.0 Safari/537.36',
    'Accept-Encoding': 'identity'
};

const http = axios.create({
    timeout: 20000,
    headers: commonHeaders,
    maxRedirects: 5
});

function removeDiacritics(str) {
    return str.normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

function shortenTitle(title, wordCount = 3) {
    return title.split(/\s+/).slice(0, wordCount).join(" ");
}

function extractFlags(title) {
    const flags = [];
    if (/\bCZ\b/i.test(title)) flags.push("cz");
    if (/\bSK\b/i.test(title)) flags.push("sk");
    if (/\bEN\b/i.test(title)) flags.push("en");
    if (/\bHU\b/i.test(title)) flags.push("hu");
    if (/\bDE\b/i.test(title)) flags.push("de");
    if (/\bFR\b/i.test(title)) flags.push("fr");
    if (/\bIT\b/i.test(title)) flags.push("it");
    if (/\bES\b/i.test(title)) flags.push("es");
    if (/\bRU\b/i.test(title)) flags.push("ru");
    if (/\bPL\b/i.test(title)) flags.push("pl");
    if (/\bJP\b/i.test(title)) flags.push("jp");
    if (/\bCN\b/i.test(title)) flags.push("cn");
    return flags;
}

function formatTitle(label) {
    const qualityIcon = /720p|HD/i.test(label) ? "🟦 HD (720p)" :
                        /480p|SD/i.test(label) ? "🟨 SD (480p)" :
                        /360p|LD/i.test(label) ? "🟥 LD (360p)" : label;
    return `SKTonline ${qualityIcon}`;
}

function formatName(fullTitle, flagsArray) {
    const flagIcons = {
        cz: "🇨🇿", sk: "🇸🇰", en: "🇬🇧", hu: "🇭🇺", de: "🇩🇪", fr: "🇫🇷",
        it: "🇮🇹", es: "🇪🇸", ru: "🇷🇺", pl: "🇵🇱", jp: "🇯🇵", cn: "🇨🇳"
    };
    const iconStr = flagsArray.map(f => flagIcons[f]).filter(Boolean).join(" ");
    return fullTitle + "\n⚙️SKTonline" + (iconStr ? "\n" + iconStr : "");
}

// ✅ normalizácia pre porovnávanie názvov
function norm(str) {
    return removeDiacritics(String(str || ""))
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
}

// ✅ extrakcia roku
function extractYear(text) {
    const m = String(text || "").match(/\b(19\d{2}|20\d{2})\b/);
    return m ? parseInt(m[1], 10) : null;
}

/**
 * ✅ Cinemeta (Stremio) – stabilnejšie než IMDb scraping, funguje aj na Renderi
 * movie:  https://v3-cinemeta.stremio.com/meta/movie/tt....json
 * series: https://v3-cinemeta.stremio.com/meta/series/tt....json
 */
async function getMetaFromCinemeta(type, imdbId) {
    try {
        const url = `https://v3-cinemeta.stremio.com/meta/${type}/${imdbId}.json`;
        console.log(`[DEBUG] 🌐 Cinemeta Request: ${url}`);
        const res = await http.get(url);
        const meta = res?.data?.meta;
        if (!meta) return null;

        // meta.name je názov
        // rok sa dá získať buď priamo, alebo z releaseInfo
        const year =
            (typeof meta.year === "number" ? meta.year : null) ||
            extractYear(meta.releaseInfo) ||
            extractYear(meta.released);

        console.log(`[DEBUG] 🎬 Cinemeta title: ${meta.name}, year: ${year || "N/A"}`);
        return { title: meta.name, originalTitle: meta.name, year: year || null };
    } catch (err) {
        console.error("[ERROR] Cinemeta fetch zlyhal:", err.message);
        return null;
    }
}

async function getTitleFromIMDb(imdbId) {
    try {
        const url = `https://www.imdb.com/title/${imdbId}/`;
        console.log(`[DEBUG] 🌐 IMDb Request: ${url}`);
        const res = await http.get(url);

        const $ = cheerio.load(res.data);
        const titleRaw = $('title').text().split(' - ')[0].trim();
        const title = decode(titleRaw);

        const ldJson = $('script[type="application/ld+json"]').html();
        let originalTitle = title;
        let year = null;

        if (ldJson) {
            const json = JSON.parse(ldJson);
            if (json && json.name) originalTitle = decode(json.name.trim());
            if (json && json.datePublished) year = extractYear(json.datePublished);
        }

        console.log(`[DEBUG] 🎬 IMDb title: ${title}, original: ${originalTitle}, year: ${year || "N/A"}`);
        return { title, originalTitle, year };
    } catch (err) {
        // Render často dostane 403 / block -> fallback Cinemeta
        console.error("[ERROR] IMDb scraping zlyhal:", err.message);
        return null;
    }
}

async function searchOnlineVideos(query) {
    const searchUrl = `https://online.sktorrent.eu/search/videos?search_query=${encodeURIComponent(query)}`;
    console.log(`[INFO] 🔍 Hľadám '${query}' na ${searchUrl}`);
    try {
        const res = await http.get(searchUrl);
        const $ = cheerio.load(res.data);
        const links = [];
        $("a[href^='/video/']").each((i, el) => {
            const href = $(el).attr("href");
            if (href) {
                const match = href.match(/\/video\/(\d+)/);
                if (match) links.push(match[1]);
            }
        });

        console.log(`[INFO] 📺 Nájdených videí: ${links.length}`);
        return links;
    } catch (err) {
        console.error("[ERROR] ❌ Vyhľadávanie online videí zlyhalo:", err.message);
        return [];
    }
}

async function extractStreamsFromVideoId(videoId, ctx) {
    const url = `https://online.sktorrent.eu/video/${videoId}`;
    console.log(`[DEBUG] 🔎 Načítavam detaily videa: ${url}`);
    try {
        const res = await http.get(url);
        const $ = cheerio.load(res.data);
        const sourceTags = $('video source');

        // presnejší názov
        const ogTitle = $(`meta[property="og:title"]`).attr("content") || "";
        const titleText = (ogTitle || $('title').text() || "").trim();

        // film musí obsahovať názov – inak zahodiť
        if (ctx.type === "movie") {
            const nt = norm(titleText);
            const okName =
                (ctx.titleNorm && nt.includes(ctx.titleNorm)) ||
                (ctx.originalTitleNorm && nt.includes(ctx.originalTitleNorm));

            if (!okName) {
                console.log(`[DEBUG] ⛔ Skip videoId=${videoId} (name mismatch) title='${titleText}'`);
                return [];
            }

            // rok mismatch filter (keď je rok na stránke)
            if (ctx.year) {
                const pageYear = extractYear(titleText);
                if (pageYear && pageYear !== ctx.year) {
                    console.log(`[DEBUG] ⛔ Skip videoId=${videoId} (year mismatch imdb=${ctx.year} page=${pageYear}) title='${titleText}'`);
                    return [];
                }
            }
        }

        const flags = extractFlags(titleText);

        const streams = [];
        sourceTags.each((i, el) => {
            let src = $(el).attr('src');
            const label = $(el).attr('label') || 'Unknown';
            if (src && src.endsWith('.mp4')) {
                src = src.replace(/([^:])\/\/+/, '$1/');
                streams.push({
                    title: formatName(titleText, flags),
                    name: formatTitle(label),
                    url: src
                });
            }
        });

        console.log(`[INFO] ✅ Našiel som ${streams.length} streamov pre videoId=${videoId}`);
        return streams;
    } catch (err) {
        console.error("[ERROR] ❌ Chyba pri načítaní detailu videa:", err.message);
        return [];
    }
}

builder.defineStreamHandler(async ({ type, id }) => {
    console.log(`\n====== 🎮 STREAM požiadavka: type='${type}', id='${id}' ======`);
    const [imdbId, seasonStr, episodeStr] = id.split(":");
    const season = seasonStr ? parseInt(seasonStr) : null;
    const episode = episodeStr ? parseInt(episodeStr) : null;

    // 1) skúsiť IMDb
    let titles = await getTitleFromIMDb(imdbId);

    // 2) fallback na Cinemeta (na Renderi často zachráni všetko)
    if (!titles) {
        titles = await getMetaFromCinemeta(type, imdbId);
    }

    if (!titles) return { streams: [] };

    const { title, originalTitle, year } = titles;
    const queries = new Set();

    const baseTitles = [title, originalTitle].map(t => String(t || "").replace(/\(.*?\)/g, '').trim()).filter(Boolean);
    for (const base of baseTitles) {
        const noDia = removeDiacritics(base);
        const short = shortenTitle(noDia);
        const short1 = shortenTitle(noDia, 1);

        if (type === 'series' && season && episode) {
            const epTag1 = `S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`;
            const epTag2 = `${season}x${episode}`;
            [base, noDia, short, short1].forEach(b => {
                queries.add(`${b} ${epTag1}`);
                queries.add(`${b} ${epTag2}`);
            });
        } else {
            [base, noDia, short].forEach(b => queries.add(b));
        }
    }

    const ctx = {
        type,
        year: year || null,
        titleNorm: norm(title),
        originalTitleNorm: norm(originalTitle)
    };

    let allStreams = [];
    const seenUrls = new Set();
    const seenItems = new Set();

    let attempt = 1;
    for (const q of queries) {
        console.log(`[DEBUG] 🔍 Pokus ${attempt++}: '${q}'`);
        const videoIds = await searchOnlineVideos(q);

        for (const vid of videoIds) {
            const streams = await extractStreamsFromVideoId(vid, ctx);

            for (const s of streams) {
                if (!s || !s.url) continue;

                if (seenUrls.has(s.url)) continue;

                const itemKey = `${s.name}||${s.title}`;
                if (seenItems.has(itemKey)) continue;

                seenUrls.add(s.url);
                seenItems.add(itemKey);
                allStreams.push(s);
            }
        }

        if (allStreams.length > 0) break;
    }

    console.log(`[INFO] 📤 Odosielam ${allStreams.length} streamov do Stremio`);
    return { streams: allStreams };
});

builder.defineCatalogHandler(({ type, id }) => {
    console.log(`[DEBUG] 📚 Katalóg požiadavka pre typ='${type}' id='${id}'`);
    return { metas: [] };
});

console.log("📦 Manifest:", builder.getInterface().manifest);
serveHTTP(builder.getInterface(), { port: PORT });
console.log(`🚀 SKTonline Online addon beží na http://localhost:${PORT}/manifest.json`);
