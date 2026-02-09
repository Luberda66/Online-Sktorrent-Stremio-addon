// online-sktorrent-addon.js
// Note: Use Node.js v20.09 LTS for testing (https://nodejs.org/en/blog/release/v20.9.0)
const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");
const axios = require("axios");
const cheerio = require("cheerio");
const { decode } = require("entities");

const PORT = process.env.PORT || 7000;

// Logo cez GitHub raw
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
    logo: LOGO_URL,
    background: BACKGROUND_URL
});

const commonHeaders = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "sk-SK,sk;q=0.9,cs-CZ;q=0.8,cs;q=0.7,en-US;q=0.6,en;q=0.5",
    "Accept-Encoding": "identity",
    "Connection": "keep-alive",
};

const http = axios.create({
    timeout: 25000,
    headers: commonHeaders,
    maxRedirects: 5,
    validateStatus: (s) => s >= 200 && s < 500 // nech vidíme aj 403/429 v logu
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

function norm(str) {
    return removeDiacritics(String(str || ""))
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
}

function extractYear(text) {
    const m = String(text || "").match(/\b(19\d{2}|20\d{2})\b/);
    return m ? parseInt(m[1], 10) : null;
}

async function getMetaFromCinemeta(type, imdbId) {
    try {
        const url = `https://v3-cinemeta.stremio.com/meta/${type}/${imdbId}.json`;
        console.log(`[DEBUG] 🌐 Cinemeta Request: ${url}`);
        const res = await http.get(url);
        const meta = res?.data?.meta;
        if (!meta) return null;

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

        if (res.status >= 400) {
            console.error(`[ERROR] IMDb status ${res.status}`);
            return null;
        }

        const $ = cheerio.load(res.data);
        const titleRaw = $("title").text().split(" - ")[0].trim();
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
        console.error("[ERROR] IMDb scraping zlyhal:", err.message);
        return null;
    }
}

function looksBlocked(html) {
    const t = String(html || "").toLowerCase();
    return (
        t.includes("captcha") ||
        t.includes("cloudflare") ||
        t.includes("attention required") ||
        t.includes("access denied") ||
        t.includes("forbidden") ||
        t.includes("ddos") ||
        t.includes("bot") ||
        t.includes("verify you are human")
    );
}

// ✅ helper: robustne vytiahne video IDs z HTML (DOM + regex fallback)
function extractVideoIdsFromHtml(html) {
    const ids = new Set();

    // 1) DOM spôsob (a href * /video/)
    const $ = cheerio.load(html);
    $("a[href*='/video/']").each((i, el) => {
        const href = $(el).attr("href") || "";
        const m = href.match(/\/video\/(\d+)/);
        if (m) ids.add(m[1]);
    });

    // 2) regex fallback (ak sú linky schované v JS / iných tagoch)
    if (ids.size === 0) {
        const re = /\/video\/(\d+)/g;
        let m;
        while ((m = re.exec(html)) !== null) {
            ids.add(m[1]);
            if (ids.size >= 50) break; // safety limit
        }
    }

    return Array.from(ids);
}

async function searchOnlineVideos(query) {
    const searchUrl = `https://online.sktorrent.eu/search/videos?search_query=${encodeURIComponent(query)}`;
    console.log(`[INFO] 🔍 Hľadám '${query}' na ${searchUrl}`);

    try {
        const res = await http.get(searchUrl, {
            headers: {
                ...commonHeaders,
                Referer: "https://online.sktorrent.eu/"
            }
        });

        console.log(`[DEBUG] 🔎 Search status: ${res.status} content-type: ${res.headers?.["content-type"] || "n/a"}`);

        const html = String(res.data || "");
        const htmlLen = html.length;
        const hasVideo = html.includes("/video/");
        const head = html.slice(0, 260);
        const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i);
        const pageTitle = titleMatch ? titleMatch[1].replace(/\s+/g, " ").trim() : "N/A";

        console.log(`[DEBUG] 🔎 Search htmlLen=${htmlLen} has'/video/'=${hasVideo} title='${pageTitle}'`);
        console.log(`[DEBUG] 🔎 Search head(raw): ${JSON.stringify(head)}`);

        if (res.status === 403 || res.status === 429 || looksBlocked(html)) {
            console.error(`[ERROR] 🚫 Online.sktorrent blokuje requesty (status=${res.status}).`);
            return [];
        }

        const ids = extractVideoIdsFromHtml(html);

        console.log(`[INFO] 📺 Nájdených videí: ${ids.length}`);
        if (ids.length > 0) {
            console.log(`[DEBUG] 🔎 Prvé videoId: ${ids.slice(0, 10).join(", ")}`);
        }

        return ids;
    } catch (err) {
        console.error("[ERROR] ❌ Vyhľadávanie online videí zlyhalo:", err.message);
        return [];
    }
}

async function extractStreamsFromVideoId(videoId, ctx) {
    const url = `https://online.sktorrent.eu/video/${videoId}`;
    console.log(`[DEBUG] 🔎 Načítavam detaily videa: ${url}`);

    try {
        const res = await http.get(url, {
            headers: {
                ...commonHeaders,
                Referer: "https://online.sktorrent.eu/"
            }
        });

        console.log(`[DEBUG] 🔎 Detail status: ${res.status} content-type: ${res.headers?.["content-type"] || "n/a"}`);

        const html = String(res.data || "");
        if (res.status === 403 || res.status === 429 || looksBlocked(html)) {
            console.error(`[ERROR] 🚫 Detail page blok (status=${res.status}) videoId=${videoId}`);
            console.log(`[DEBUG] 🔎 Detail head(raw): ${JSON.stringify(html.slice(0, 260))}`);
            return [];
        }

        const $ = cheerio.load(html);
        const sourceTags = $("video source");

        const ogTitle = $(`meta[property="og:title"]`).attr("content") || "";
        const titleText = (ogTitle || $("title").text() || "").trim();

        if (ctx.type === "movie") {
            const nt = norm(titleText);
            const okName =
                (ctx.titleNorm && nt.includes(ctx.titleNorm)) ||
                (ctx.originalTitleNorm && nt.includes(ctx.originalTitleNorm));

            if (!okName) {
                console.log(`[DEBUG] ⛔ Skip videoId=${videoId} (name mismatch) title='${titleText}'`);
                return [];
            }

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
            let src = $(el).attr("src");
            const label = $(el).attr("label") || "Unknown";
            if (src && src.endsWith(".mp4")) {
                src = src.replace(/([^:])\/\/+/, "$1/");
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

    let titles = await getTitleFromIMDb(imdbId);
    if (!titles) titles = await getMetaFromCinemeta(type, imdbId);
    if (!titles) return { streams: [] };

    const { title, originalTitle, year } = titles;

    const queries = new Set();
    const baseTitles = [title, originalTitle]
        .map(t => String(t || "").replace(/\(.*?\)/g, "").trim())
        .filter(Boolean);

    for (const base of baseTitles) {
        const noDia = removeDiacritics(base);
        const short = shortenTitle(noDia);
        const short1 = shortenTitle(noDia, 1);

        if (type === "series" && season && episode) {
            const epTag1 = `S${String(season).padStart(2, "0")}E${String(episode).padStart(2, "0")}`;
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
