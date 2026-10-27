// Cœur de l'automatisation — JavaScript classique, AUCUNE IA.
import crypto from "node:crypto";

export const FORMATS = ["actualité","personnage","comparaison","sondage","quiz","théorie","découverte"];
export const SETTINGS_VERSION = 2;
const JIKAN_R = "Images © studios/éditeurs (via MyAnimeList). Droits de republication non garantis.";
const ANILIST_R = "Couvertures © éditeurs (via AniList). Droits de republication non garantis.";
const NEWS_R = "Adresse du flux à confirmer au premier cycle (journal). Seul le lien est partagé (aucune copie de l'article ni de l'image).";
const jk = (id, name, url) => ({ id, name, type: "jikan", enabled: true, url, rights: "non vérifié", restrictions: JIKAN_R });
const al = (id, name, media) => ({ id, name, type: "anilist", media, enabled: true, url: "https://graphql.anilist.co", rights: "non vérifié", restrictions: ANILIST_R });
const nw = (id, name, url, all = false) => ({ id, name, type: "news", enabled: true, url, rights: "lien", restrictions: NEWS_R, ...(all ? { all: true } : {}) });
// Catalogue de départ : sites/API manga & anime. Les adresses non vérifiées sont isolées automatiquement si elles échouent (voir srcHealth).
export const DEFAULT_SOURCES = [
  jk("jikan-now", "Jikan — animes de la saison", "https://api.jikan.moe/v4/seasons/now?limit=25&sfw=true"),
  nw("ann-news", "Anime News Network", "https://www.animenewsnetwork.com/all/rss.xml"),
  nw("mal-news", "MyAnimeList News", "https://myanimelist.net/rss/news.xml"),
  jk("jikan-manga", "Jikan — mangas en cours de publication", "https://api.jikan.moe/v4/top/manga?filter=publishing&limit=25&sfw=true"),
  al("anilist-manga", "AniList — mangas tendance", "MANGA"),
  nw("crunchyroll-news", "Crunchyroll News", "https://cr-news-api-service.prd.crunchyrollsvc.com/v1/en-US/rss", true),
  nw("animecorner", "Anime Corner", "https://animecorner.me/feed/", true),
  nw("otakuusa", "Otaku USA", "https://otakuusamagazine.com/feed/"),
  jk("jikan-upcoming", "Jikan — animes à venir", "https://api.jikan.moe/v4/seasons/upcoming?limit=25&sfw=true"),
  al("anilist-anime", "AniList — animes tendance", "ANIME"),
  nw("honeysanime", "Honey's Anime", "https://honeysanime.com/feed/", true),
  nw("animeherald", "Anime Herald", "https://www.animeherald.com/feed/", true),
  nw("animeuknews", "Anime UK News", "https://animeuknews.net/feed", true),
  nw("cbr-anime", "CBR — Anime & Manga", "https://www.cbr.com/feed/category/anime/", true),
  jk("jikan-airing", "Jikan — animes en cours de diffusion", "https://api.jikan.moe/v4/top/anime?filter=airing&limit=25&sfw=true")
];
// Pages d'accueil explorées automatiquement pour y détecter de nouveaux flux (balises <link rel="alternate">).
export const SEEDS = ["https://www.crunchyroll.com/news", "https://www.animenewsnetwork.com/", "https://myanimelist.net/news", "https://www.anime-planet.com/", "https://animecorner.me/",
  "https://otakuusamagazine.com/", "https://honeysanime.com/", "https://www.animeherald.com/", "https://animeuknews.net/", "https://www.cbr.com/category/anime/", "https://screenrant.com/anime/",
  "https://comicbook.com/anime/", "https://natalie.mu/comic", "https://www.viz.com/", "https://kodansha.us/", "https://yenpress.com/", "https://sevenseasentertainment.com/",
  "https://www.mangaupdates.com/", "https://animetrending.com/", "https://www.animatetimes.com/", "https://www.otakumode.com/", "https://www.sportskeeda.com/anime",
  "https://www.polygon.com/anime", "https://www.gamesradar.com/anime/", "https://www.thecinemaholic.com/category/anime/"];
export const DEFAULT_SETTINGS = {
  settingsVersion: SETTINGS_VERSION, intervalHours: 5, maxImagesPerCycle: 10, maxNewsPerCycle: 10, maxSourcesPerCycle: 10, maxPostsPerDay: 5, minDelayMinutes: 240,
  autoPublish: true, testMode: false, waitImage: false, autoApprove: true, discover: true, distortion: "sometimes", themes: [...FORMATS],
  sources: DEFAULT_SOURCES.map(s => ({ ...s })), knownDefaults: DEFAULT_SOURCES.map(s => s.id)
};
// Lit les réglages ; migre les anciennes versions (publication 100 % automatique, nouvelles sources du catalogue).
export async function loadSettings(store, persist = true) {
  const stored = (await store.get("settings")) || {}, s = { ...DEFAULT_SETTINGS, ...stored };
  let changed = false;
  if (Object.keys(stored).length && (stored.settingsVersion || 1) < SETTINGS_VERSION) {
    Object.assign(s, { autoApprove: true, autoPublish: true, testMode: false, waitImage: false, discover: true, distortion: stored.distortion || "sometimes",
      maxPostsPerDay: Math.max(+stored.maxPostsPerDay || 0, 5), minDelayMinutes: Math.min(+stored.minDelayMinutes || 240, 240), maxNewsPerCycle: 10, maxSourcesPerCycle: 10 });
    changed = true;
  }
  s.sources = Array.isArray(s.sources) ? s.sources.map(x => ({ ...x })) : DEFAULT_SOURCES.map(x => ({ ...x }));
  const known = new Set(Array.isArray(stored.knownDefaults) ? stored.knownDefaults : (stored.sources || []).map(x => x.id)), have = new Set(s.sources.map(x => x.id));
  for (const d of DEFAULT_SOURCES) if (!known.has(d.id) && !have.has(d.id)) { s.sources.push({ ...d }); changed = true; }
  s.knownDefaults = DEFAULT_SOURCES.map(x => x.id); s.settingsVersion = SETTINGS_VERSION;
  if (stored.settingsVersion !== SETTINGS_VERSION) changed = true;
  if (changed && persist && Object.keys(stored).length && store.set) await store.set("settings", s);
  return s;
}
const sha = s => crypto.createHash("sha256").update(String(s)).digest("hex").slice(0, 24);

export function safeUrl(u) {
  try {
    const x = new URL(u);
    if (x.protocol !== "https:") return null;
    const h = x.hostname.toLowerCase();
    if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal") || /^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.|\[)/.test(h)) return null;
    return x.href;
  } catch { return null; }
}
export const normUrl = u => { try { const x = new URL(u); x.hash = ""; x.search = ""; return x.href.toLowerCase(); } catch { return String(u).toLowerCase(); } };


async function getJson(f, url, ms = 12000, tries = 3, init = {}) {
  let last;
  for (let i = 0; i < tries; i++) {
    const ac = new AbortController(); const t = setTimeout(() => ac.abort(), ms + i * 2000);
    try { const r = await f(url, { ...init, signal: ac.signal, headers: { "User-Agent": "AnimeTrendBot/2.0 (+https://github.com)", Accept: "application/json, application/xml, text/xml, text/html, */*", ...(init.headers || {}) } });
      if (r.ok) return r;
      last = new Error("HTTP " + r.status);
      if (r.status !== 429 && r.status < 500) throw last;       // erreur définitive : inutile de réessayer
    } catch (e) { last = e.name === "AbortError" ? new Error("délai dépassé (" + Math.round((ms + i * 2000) / 1000) + " s)") : e; if (last.message.startsWith("HTTP 4") && !last.message.includes("429")) throw last; }
    finally { clearTimeout(t); }
    if (i < tries - 1) await new Promise(r => setTimeout(r, 1000 * (i + 1)));
  }
  throw last;
}

export function decodeEntities(t) {
  const named = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”", hellip: "…", ndash: "–", mdash: "—" };
  return String(t).replace(/&(?:#(\d+)|#x([0-9a-f]+)|([a-z]+));/gi, (m, d, h, n) => {
    try { if (d) return String.fromCodePoint(+d); if (h) return String.fromCodePoint(parseInt(h, 16)); } catch { return m; }
    return named[(n || "").toLowerCase()] ?? m; });
}
// Mots-clés manga/anime (EN + JP) : filtre des flux généralistes.
export const MANGA_RE = /manga|anime|manhwa|manhua|webtoon|light novel|isekai|shonen|shounen|seinen|shojo|shoujo|josei|otaku|cosplay|crunchyroll|funimation|aniplex|toei|mappa|ghibli|chapters?\b|volumes?\b|serializ|hiatus|\bjump\b|magazine|マンガ|漫画|アニメ/i;
export function parseRss(xml, needImage = true) {
  const out = [];
  for (const m of xml.matchAll(/<(item|entry)[\s>][\s\S]*?<\/\1>/g)) {
    const b = m[0], pick = re => (b.match(re) || [])[1];
    const rawTitle = (pick(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/) || "").replace(/<[^>]+>/g, "").trim();
    const title = decodeEntities(rawTitle).replace(/\s+/g, " ").trim();
    const linkRaw = pick(/<link[^>]*>([^<\s]+)<\/link>/) || pick(/<link[^>]*href=["\']([^"\']+)["\']/);
    const link = linkRaw ? decodeEntities(linkRaw.trim()) : "";
    const imgRaw = pick(/<enclosure[^>]+url=["\']([^"\']+)["\'][^>]*type=["\']image/) || pick(/<media:(?:content|thumbnail)[^>]+url=["\']([^"\']+)["\']/) || pick(/<img[^>]+src=["\']([^"\']+)/);
    const img = imgRaw ? decodeEntities(imgRaw.trim()) : "";
    const author = (pick(/<(?:dc:creator|author)[^>]*>(?:<name>)?(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?(?:<\/name>)?<\/(?:dc:creator|author)>/) || "").trim();
    if (title && (img || (!needImage && link))) out.push({ id: link || img, title, image: (img || "").replace(/&amp;/g, "&"), page: link, author, genres: [], kind: "" });
  }
  return out;
}

const GQL = "query($type:MediaType){Page(perPage:25){media(type:$type,sort:TRENDING_DESC,isAdult:false){id title{romaji english}coverImage{extraLarge}siteUrl genres format}}}";
export async function fetchSource(f, s) {
  if (s.type === "anilist") {
    const r = await getJson(f, s.url, 12000, 2, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: GQL, variables: { type: s.media === "ANIME" ? "ANIME" : "MANGA" } }) });
    const j = await r.json().catch(() => ({}));
    return (j?.data?.Page?.media || []).map(a => ({ id: "al-" + a.id, title: a.title?.english || a.title?.romaji || "", image: a.coverImage?.extraLarge, page: a.siteUrl,
      author: "", genres: a.genres || [], kind: a.format || "" })).filter(x => x.image && x.title);
  }
  const r = await getJson(f, s.url);
  if (s.type === "jikan") {
    const j = await r.json(), arr = Array.isArray(j?.data) ? j.data : [];
    return arr.map(a => ({ id: "mal-" + a.mal_id, title: a.title_english || a.title, image: a.images?.jpg?.large_image_url, page: a.url,
      author: "", genres: (a.genres || []).map(g => g.name), kind: a.type || "" })).filter(x => x.image);
  }
  const items = parseRss(await r.text(), s.type !== "news");
  return s.type === "news" && !s.all ? items.filter(i => MANGA_RE.test(i.title)) : items;
}

// ---- Détection de nouveaux sites : on cherche leur flux RSS/Atom, puis on vérifie qu'il parle bien de manga/anime ----
const looksFeed = t => /<(rss|feed|rdf:RDF)[\s>]/i.test(String(t).slice(0, 3000));
export function findFeedLinks(html, base) {
  const out = [];
  for (const m of String(html).matchAll(/<link\b[^>]*>/gi)) {
    const tag = m[0];
    if (!/rel=["']?alternate/i.test(tag) || !/type=["']?application\/(rss|atom)\+xml/i.test(tag)) continue;
    const href = (tag.match(/href=["']([^"']+)["']/i) || [])[1], title = (tag.match(/title=["']([^"']*)["']/i) || [])[1] || "";
    if (!href || /comment/i.test(href + title)) continue;
    try { const u = safeUrl(new URL(decodeEntities(href), base).href); if (u) out.push({ url: u, title: decodeEntities(title) }); } catch {}
  }
  return out;
}
async function probeFeed(f, url) {
  const r = await getJson(f, url, 8000, 1), text = (await r.text()).slice(0, 500000);
  if (!looksFeed(text)) return null;
  const items = parseRss(text, false); if (!items.length) return null;
  const ft = decodeEntities((text.match(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/) || [])[1] || "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  const host = new URL(url).hostname, dedicated = MANGA_RE.test(host + " " + ft), hits = items.filter(i => MANGA_RE.test(i.title)).length;
  return { url, name: (ft || host).slice(0, 60), found: items.length, hits, relevant: dedicated || hits >= Math.max(2, Math.ceil(items.length * 0.25)), all: dedicated };
}
export async function discoverFeeds(f, pageUrl) {
  const url = safeUrl(pageUrl); if (!url) return [];
  const r = await getJson(f, url, 8000, 1), body = (await r.text()).slice(0, 500000);
  let urls = looksFeed(body) ? [url] : findFeedLinks(body, url).map(x => x.url);
  if (!urls.length) { const o = new URL(url).origin; urls = ["/feed", "/rss.xml", "/feed.xml"].map(p => o + p); }
  const out = [];
  for (const u of [...new Set(urls)].slice(0, 3)) { try { const p = await probeFeed(f, u); if (p) out.push(p); } catch {} }
  return out;
}
const toUrl = s => { const t = String(s || "").trim().replace(/^http:\/\//i, "https://"); return t ? safeUrl(/^https:\/\//i.test(t) ? t : "https://" + t) : null; };
export function addDiscovered(st, feeds, settings, now) {
  const known = new Set([...settings.sources, ...st.discovered].map(x => normUrl(x.url))), blocked = new Set(st.blocked || []); let added = 0;
  for (const fd of feeds) {
    const k = normUrl(fd.url);
    if (!fd.relevant || known.has(k) || blocked.has(k) || st.discovered.length >= 60) continue;
    known.add(k); added++;
    st.discovered.push({ id: "d-" + sha(k).slice(0, 10), name: fd.name, type: "news", url: fd.url, enabled: true, rights: "lien", all: !!fd.all, discovered: true,
      restrictions: "Détectée automatiquement. Seul le lien est partagé.", foundAt: new Date(now).toISOString() });
  }
  return added;
}
// Détection à la demande : adresses saisies (n'importe quel site) ou, sans adresse, un lot du catalogue SEEDS.
export async function discoverNow({ store, f = fetch, urls = [], now = Date.now() }) {
  const settings = await loadSettings(store), targets = urls.map(toUrl).filter(Boolean).slice(0, 10), manual = targets.length > 0;
  const s0 = { ...emptyState(), ...(await store.get("state") || {}) };
  const list = manual ? targets : [0, 1, 2, 3].map(i => SEEDS[((s0.seedCursor || 0) + i) % SEEDS.length]);
  const res = await Promise.allSettled(list.map(u => discoverFeeds(f, u)));
  let feeds = res.flatMap(r => r.status === "fulfilled" ? r.value : []);
  if (manual) feeds = feeds.map(x => ({ ...x, relevant: true }));       // l'utilisateur a choisi ce site : on l'accepte
  const st = { ...emptyState(), ...(await store.get("state") || {}) };
  if (!manual) st.seedCursor = (st.seedCursor || 0) + 4;
  const added = addDiscovered(st, feeds, settings, now); await store.set("state", st);
  return { checked: list.length, added, found: feeds.map(({ url, name, found, relevant }) => ({ url, name, found, relevant })), errors: res.filter(r => r.status === "rejected").map(r => String(r.reason?.message || r.reason)) };
}

const clean = s => String(s).replace(/[^\p{L}\p{N}]/gu, "");
export function buildPost(it, seed, themes) {
  const pool = (themes && themes.length ? themes : FORMATS).filter(x => FORMATS.includes(x));
  const n = parseInt(sha(it.id).slice(0, 6), 16) + seed;
  const fmt = pool[n % pool.length], v = (n >> 3) % 2, T = it.title;
  const g = it.genres.slice(0, 2).join(" et ").toLowerCase();
  const tpl = {
    "actualité": [[`Nouveau visuel : ${T}`, `📣 ${T} revient sur le devant de la scène avec ce visuel.`, `Que pensez-vous de ce visuel ?`], [`${T} : à suivre`, `🔔 Un visuel de ${T} vient d'être repéré.`, `Allez-vous le suivre ?`]],
    "personnage": [[`Un personnage de ${T}`, `👤 Parlons des personnages de ${T}.`, `Quel est votre personnage préféré ?`], [`Les héros de ${T}`, `✨ Ce visuel de ${T} met les personnages à l'honneur.`, `Lequel vous marque le plus ?`]],
    "comparaison": [[`${T} face aux autres`, `⚖️ Comment situez-vous ${T} par rapport à vos autres séries préférées ?`, `Quel critère compte le plus : histoire, personnages ou animation ?`], [`${T} : le match`, `🆚 Comparons ${T} avec une autre œuvre que vous aimez.`, `Laquelle choisissez-vous, et pourquoi ?`]],
    "sondage": [[`Sondage : ${T}`, `📊 Sondage rapide sur ${T} !\n🅰️ J'adore\n🅱️ Je suis curieux\n🆎 Pas pour moi`, `Votez en commentaire !`], [`Votre avis sur ${T}`, `🗳️ ${T} : où vous situez-vous ?\n🅰️ Fan\n🅱️ À découvrir\n🆎 Indifférent`, `Dites-nous votre choix en commentaire !`]],
    "quiz": [[`Quiz ${T}`, `❔ Quiz : que savez-vous de ${T} ?`, `Écrivez ce que vous en savez avant de lire les commentaires !`], [`Testez-vous : ${T}`, `🎯 Défi pour les fans de ${T}.`, `Citez un détail que vous connaissez de cette œuvre !`]],
    "théorie": [[`Théorie autour de ${T}`, `🧠 Place aux hypothèses de fans sur ${T} (ce ne sont pas des informations officielles).`, `Quelle est votre théorie ?`], [`Et si… ${T}`, `🤔 Les fans aiment imaginer la suite de ${T}. Ceci n'est qu'une discussion, pas une annonce.`, `Quelle est votre interprétation ?`]],
    "découverte": [[`À découvrir : ${T}`, `🌟 Découverte du jour : ${T}${g ? ` (${g})` : ""}.`, `L'avez-vous déjà vu ou lu ?`], [`Connaissez-vous ${T} ?`, `📚 Une œuvre à mettre sur votre liste : ${T}${g ? ` — ${g}` : ""}.`, `Dites-nous si elle vous tente !`]]
  }[fmt][v];
  const tags = ["#Anime", "#Manga", "#" + clean(T).slice(0, 30), ...it.genres.slice(0, 2).map(x => "#" + clean(x))].filter(h => h.length > 1);
  return { format: fmt, title: tpl[0], text: `${tpl[1]}\n\n${tpl[2]}`, hashtags: [...new Set(tags)].join(" ") };
}
// Prompt d'image détaillé construit par règles (aucune IA ici) ; à copier-coller dans l'outil d'image de votre choix.
const SCENES = { "pause": "an empty artist's desk at night, a half-finished manga page, an hourglass, a quiet clock, ink bottle and brushes",
  "adaptation": "a split composition: a black-and-white manga page on the left transforming into a vibrant animated film frame on the right",
  "fin de série": "a final manga page being turned at sunset, a lone silhouette walking along a long road, falling petals",
  "sortie": "a neat stack of freshly printed manga volumes with blank covers, soft glowing shelf, collector's display",
  "récompense": "a glowing golden trophy on a stage with confetti and spotlights, blank manga volumes around it",
  "actualité": "a futuristic editorial desk with floating blank manga pages, holographic news panels and a glowing city skyline" };
const LIGHT = ["rim lighting with neon cyan and violet glow", "dramatic backlight with soft purple haze", "cinematic moonlight with magenta accents"];
const ANGLE = ["wide establishing shot", "low-angle dynamic shot", "balanced centered composition"];
const DISTORT = ["surreal warped perspective with a strong fisheye lens distortion on the scenery", "glitch-art look with chromatic aberration and datamosh streaks across the background",
  "dreamlike melting, stretched liquid shapes in the environment", "wavy heat-haze ripple warping the whole scene, psychedelic"];
export function buildImagePrompt(it, cat, seed, distortion = "off") {
  const n = parseInt(sha(seed).slice(0, 6), 16), theme = it.title.slice(0, 100);
  const dm = distortion === "always" || (distortion === "sometimes" && (n >> 5) % 3 === 0);
  return { ratio: "1.91:1 (1200×630) ou 1:1 (1080×1080)", distorted: dm,
    en: `Original anime and manga style illustration, ${SCENES[cat] || SCENES["actualité"]}. ${ANGLE[n % 3]}, ${LIGHT[(n >> 2) % 3]}. Deep night-blue and violet palette with neon cyan highlights, crisp line art, cel shading, rich detail, high contrast, ultra-detailed, 4K, clean empty area at the top for a title.${dm ? ` Artistic distortion: ${DISTORT[(n >> 7) % DISTORT.length]}; keep faces and hands anatomically natural.` : ""} Thematic mood inspired by this news headline (do not depict any existing character): "${theme}".`,
    negative: "existing copyrighted characters, celebrity or real person likeness, logos, watermarks, readable text, signatures, extra fingers, malformed hands, blurry, low quality, gore, nudity",
    note: "Image originale à générer vous-même : vérifiez les conditions d'usage commercial de l'outil choisi avant de publier." };
}
export function buildComment(it, sourceName, opts = {}) {
  const T = `« ${it.title.slice(0, 140)} »`, n = parseInt(sha(it.id).slice(0, 6), 16), v = n % 2;
  const cats = [[/\b(hiatus|resum\w*|on break)\b/i, "pause", [`⏸️ Côté rythme de publication, ${sourceName} relaie : ${T}.`, `📌 ${sourceName} évoque une question de calendrier : ${T}.`], "Comment vivez-vous l'attente entre deux chapitres ?
