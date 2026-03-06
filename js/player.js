/* 7TH BLOCK SOCIETY — Stable baseline (AUTO from SoundCloud playlist)
   Playlist: https://soundcloud.com/7thblocksociety/sets/sbs-2026
   Notes:
   - Uses SoundCloud Widget API (no client_id)
   - Player stays hidden until user presses PLAY
   - Waveform shows progress (bars turn red as you move through the track)
*/

const PLAYLIST_URL = "https://soundcloud.com/7thblocksociety/sets/sbs-2026";
console.log("[SBS] using PLAYLIST_URL:", PLAYLIST_URL);

const CACHE_KEY = "sbs_episodes_cache";
const YT_CACHE_KEY = "sbs_yt_views_cache";
const YT_CACHE_TTL = 30 * 60 * 1000; // 30 წუთი
const CACHE_TTL = 60 * 60 * 1000; // 1 საათი

function saveCache(list){
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data: list }));
  } catch(e){}
}

function loadCache(){
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL) return null;
    return data;
  } catch(e){ return null; }
}


// ================================
// YouTube Views Integration
// ================================
const YT_API_KEY = "AIzaSyA3arnK5Ar-A2tCH7HxEJY_TQcKnCp6sPA";
const YT_CHANNEL_ID = "UCcvJmv3UOYFmVG2_1tK8aNg";
let ytViewsMap = {}; // title => viewCount

function normalizeTitle(t) {
  return (t || "").toLowerCase()
      .replace(/[^a-z0-9]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
}

function fuzzyMatch(scTitle, ytTitle) {
  // Compare first word only (before any space, dash, pipe)
  const firstWord = (t) => (t || "").trim().split(/[\s|\-–]/)[0].toLowerCase().trim();
  const a = firstWord(scTitle);
  const b = firstWord(ytTitle);
  if (a.length >= 3 && a === b) return true;

  // Fallback: check if key words match (min 4 chars)
  const norm = (t) => (t || "").toLowerCase().replace(/[^a-z0-9]/g, " ").replace(/\s+/g, " ").trim();
  const wordsA = norm(scTitle).split(" ").filter(w => w.length >= 4);
  const wordsB = norm(ytTitle).split(" ").filter(w => w.length >= 4);
  const matches = wordsA.filter(w => wordsB.includes(w));
  return matches.length >= 2;
}

function applyYouTubeViews() {
  if (!episodes.length || !Object.keys(ytViewsMap).length) return;
  episodes.forEach(ep => {
    const match = Object.entries(ytViewsMap).find(([ytTitle]) => fuzzyMatch(ep.title, ytTitle));
    if (match) ep.views = match[1];
  });
  originalEpisodes.forEach(ep => {
    const match = Object.entries(ytViewsMap).find(([ytTitle]) => fuzzyMatch(ep.title, ytTitle));
    if (match) ep.views = match[1];
  });
  renderEpisodes();
}

async function fetchYouTubeViews() {
  // Try cache first
  try {
    const raw = localStorage.getItem(YT_CACHE_KEY);
    if (raw) {
      const { ts, data } = JSON.parse(raw);
      if (Date.now() - ts < YT_CACHE_TTL) {
        ytViewsMap = data;
        applyYouTubeViews();
        return;
      }
    }
  } catch(e){}
  try {
    // Get uploads playlist ID
    const chRes = await fetch(
        `https://www.googleapis.com/youtube/v3/channels?part=contentDetails&id=${YT_CHANNEL_ID}&key=${YT_API_KEY}`
    );
    const chData = await chRes.json();
    const uploadsId = chData.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
    if (!uploadsId) return;

    // Get all videos from uploads playlist
    let videos = [];
    let pageToken = "";
    do {
      const plRes = await fetch(
          `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${uploadsId}&maxResults=50&pageToken=${pageToken}&key=${YT_API_KEY}`
      );
      const plData = await plRes.json();
      videos = videos.concat(plData.items || []);
      pageToken = plData.nextPageToken || "";
    } while (pageToken);

    // Get view counts (exclude Shorts — duration < 60s)
    const ids = videos.map(v => v.snippet?.resourceId?.videoId).filter(Boolean);
    if (!ids.length) return;

    // Batch requests (max 50 per request)
    for (let i = 0; i < ids.length; i += 50) {
      const batch = ids.slice(i, i + 50).join(",");
      const statsRes = await fetch(
          `https://www.googleapis.com/youtube/v3/videos?part=statistics,snippet,contentDetails&id=${batch}&key=${YT_API_KEY}`
      );
      const statsData = await statsRes.json();
      (statsData.items || []).forEach(item => {
        // Parse ISO 8601 duration — skip Shorts (< 60s)
        const dur = item.contentDetails?.duration || "";
        const match = dur.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
        const h = parseInt(match?.[1] || 0);
        const m = parseInt(match?.[2] || 0);
        const s = parseInt(match?.[3] || 0);
        const totalSec = h * 3600 + m * 60 + s;
        if (totalSec < 60) return; // skip Shorts
        if (totalSec < 600) return; // skip videos under 10 min (likely not full sets)

        const title = item.snippet?.title || "";
        const views = parseInt(item.statistics?.viewCount || 0);
        ytViewsMap[title] = views;
      });
    }

    // Save to cache
    try { localStorage.setItem(YT_CACHE_KEY, JSON.stringify({ ts: Date.now(), data: ytViewsMap })); } catch(e){}

    applyYouTubeViews();
  } catch(e) {
    console.warn("[SBS] YouTube fetch failed:", e);
  }
}

function formatViews(n) {
  if (!n) return null;
  if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
  if (n >= 1000) return Math.round(n / 1000) + "K";
  return String(n);
}

const FALLBACK_COVER = "https://i1.sndcdn.com/avatars-000000000000-000000-t500x500.jpg";

// Optional: if you want to hide specific tracks (login-wall / unavailable), add full permalink URLs here
const BLOCKLIST = new Set([
]);

const DEFAULT_TAGS = ["HOUSE", "DEEP"];

const scIframe    = document.getElementById("scWidget");

function setWidgetSrc(){
  if (!scIframe) return;

  const base = "https://w.soundcloud.com/player/";
  const url = encodeURIComponent(PLAYLIST_URL);

  // Keep the same widget params you had in index.html
  const params = [
    `url=${url}`,
    "auto_play=false",
    "hide_related=true",
    "show_comments=false",
    "show_user=false",
    "show_reposts=false",
    "visual=false"
  ].join("&");

  const nextSrc = `${base}?${params}`;

  // If already correct, do nothing
  if (scIframe.getAttribute("src") === nextSrc) return;

  // Force reload by resetting src
  scIframe.setAttribute("src", nextSrc);
}
const episodeGrid = document.getElementById("episodeGrid");
const sortBar     = document.getElementById("sortBar");
const moreBtn     = document.getElementById("moreBtn");
let searchQuery = "";

const playerEl = document.getElementById("player");
const coverImg = document.getElementById("coverImg");
const metaKicker = document.getElementById("metaKicker");
const metaTitle  = document.getElementById("metaTitle");
const metaTags   = document.getElementById("metaTags");

const prevBtn   = document.getElementById("prevBtn");
const nextBtn   = document.getElementById("nextBtn");
const back10Btn = document.getElementById("back10Btn");
const fwd10Btn  = document.getElementById("fwd10Btn");
const playBtn   = document.getElementById("playBtn");
const playIcon  = document.getElementById("playIcon");
let isPlaying = false;

// Card button icons (keeps PLAY text, adds icon on the right)
const CARD_PLAY_SVG = `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`;
const CARD_PAUSE_SVG = `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>`;

function updateCardButtons(){
  if (!episodeGrid) return;
  const cards = [...episodeGrid.querySelectorAll(".card")];
  cards.forEach((c, idx)=>{
    const ico = c.querySelector(".card__playIco");
    if (!ico) return;
    const active = idx === activeIndex;
    ico.innerHTML = (active && isPlaying) ? CARD_PAUSE_SVG : CARD_PLAY_SVG;
  });
}

const closeBtn  = document.getElementById("closePlayerBtn");

const seek    = document.getElementById("seek");
const curTime = document.getElementById("curTime");
const durTime = document.getElementById("durTime");

const vol     = document.getElementById("vol");
const volIcon = document.getElementById("volIcon");

const barsEl  = document.getElementById("bars");

let widget = null;
let widgetReady = false;

let episodes = [];
let originalEpisodes = [];
let activeIndex = -1;
let userInitiated = false; // only highlight card after user clicks

const PAGE_SIZE = 6;
let visibleCount = PAGE_SIZE;

let barEls = [];
let currentDurationMs = 0;

function formatDate(dateStr) {
  if (!dateStr) return "";
  const months = ["JANUARY","FEBRUARY","MARCH","APRIL","MAY","JUNE",
    "JULY","AUGUST","SEPTEMBER","OCTOBER","NOVEMBER","DECEMBER"];
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!m) return dateStr;
  return months[m - 1] + " " + d + ", " + y;
}

function fmt(ms){
  const total = Math.max(0, Math.floor((ms || 0) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n)=> String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
function formatDuration(ms){ return fmt(ms); }

function openPlayer(){
  if (playerEl) playerEl.classList.remove("is-hidden");
}
function closePlayer(){
  try{ widget && widget.pause(); }catch(e){}
  if (playerEl) playerEl.classList.add("is-hidden");
  if (playBtn) playBtn.disabled = true;
  if (playIcon) playIcon.textContent = "▶";
}

function initBars(){
  if (!barsEl) return;
  barsEl.innerHTML = "";
  barEls = [];
  const containerW = barsEl.parentElement ? barsEl.parentElement.offsetWidth - 28 : 300;
  const BAR_COUNT = Math.max(20, Math.floor(containerW / 6));
  for (let i=0;i<BAR_COUNT;i++){
    const b = document.createElement("div");
    b.className = "bar";
    b.style.height = (10 + Math.floor(Math.random()*22)) + "px";
    barsEl.appendChild(b);
    barEls.push(b);
  }
}

function seedBars(seedStr){
  if (!barEls.length) return;
  let h = 2166136261;
  for (let i=0;i<seedStr.length;i++){ h ^= seedStr.charCodeAt(i); h = Math.imul(h, 16777619); }
  for (let i=0;i<barEls.length;i++){
    h ^= (h << 13); h ^= (h >>> 17); h ^= (h << 5);
    const v = Math.abs(h) % 27;
    barEls[i].style.height = (8 + v) + "px";
  }
}

function paintBars(progress01){
  if (!barEls.length) return;
  const cut = Math.floor(progress01 * barEls.length);
  for (let i=0;i<barEls.length;i++){
    if (i <= cut) barEls[i].classList.add("listened");
    else barEls[i].classList.remove("listened");
  }
}

function updateVolIcon(){
  if (!volIcon || !vol) return;
  const v = Number(vol.value || 0);
  volIcon.style.opacity = v === 0 ? "0.35" : "1";
}

function paintVolume(){
  if (!vol) return;
  const v = Number(vol.value || 0);
  vol.style.background = `linear-gradient(90deg, var(--brand-red) ${v}%, rgba(255,255,255,0.15) ${v}%)`;
}

function setNowPlaying(ep){
  if (!ep) return;
  if (coverImg) coverImg.src = ep.cover || FALLBACK_COVER;

  if (metaKicker) metaKicker.textContent = (ep.artist || "7TH BLOCK SOCIETY");
  if (metaTitle)  metaTitle.textContent  = ep.title || "";

  // Render up to 2 tags as pills in the player
  if (metaTags){
    const tags = (ep.tags || DEFAULT_TAGS).slice(0, 2);
    metaTags.innerHTML = tags.map(t=>`<span class="tag doto">${t}</span>`).join("");
  }
}

function renderEpisodes(){
  if (!episodeGrid) return;
  const filtered = searchQuery
      ? episodes.filter(e => e.title.toLowerCase().includes(searchQuery) || (e.artist||"").toLowerCase().includes(searchQuery))
      : episodes;
  const list = filtered.slice(0, visibleCount);
  if (moreBtn) moreBtn.hidden = visibleCount >= filtered.length;
  episodeGrid.innerHTML = "";

  list.forEach((ep, idx)=>{
    const realIndex = idx;
    const card = document.createElement("div");
    card.className = "card" + (ep.originalIndex === activeIndex ? " active" : "");

    const durChip = ep.durationMs ? `<div class="chip doto">${formatDuration(ep.durationMs)}</div>` : ``;
    const viewsChip = ep.views ? `<div class="chip chip--views doto">👁 ${formatViews(ep.views)}</div>` : "";
    const tagsHtml = (ep.tags || DEFAULT_TAGS).slice(0,2).map(t=>`<span class="tag doto">${t}</span>`).join("");

    card.innerHTML = `
      <div class="card__top">
        <div class="card__img"><img src="${ep.cover || FALLBACK_COVER}" alt=""></div>
        <div class="card__meta" style="min-width:0;">
          <div class="card__kickerRow">
            <div class="card__kicker">7TH BLOCK SOCIETY</div>
            ${durChip}
          </div>
          <div class="card__title doto">${ep.title}</div>
          <div class="card__sub">${formatDate(ep.date)}</div>
        </div>
      </div>

      <div class="card__tags">${tagsHtml}${viewsChip}</div>
      <button class="card__playBtn" type="button" ${ep.playable ? "" : "disabled"}><span class="card__playIco" aria-hidden="true"></span></button>
    `;

    const playButton = card.querySelector(".card__playBtn");
    playButton?.addEventListener("click", (e)=>{
      e.stopPropagation();
      if (!ep.playable) return;
      if (!widgetReady) return;

      // If clicking the active episode, toggle play/pause (stop)
      if (realIndex === activeIndex){
        openPlayer();
        widget.toggle();
        return;
      }

      // Otherwise load and start playing
      loadEpisode(realIndex, true, true);
    });

    card.addEventListener("click", ()=>{
      if (!ep.playable) return;
      loadEpisode(realIndex, false, true);
    });

    episodeGrid.appendChild(card);
  });

  if (moreBtn) moreBtn.hidden = visibleCount >= episodes.length;
  updateCardButtons();
}

function setActiveCard(){
  if (!episodeGrid) return;
  [...episodeGrid.querySelectorAll(".card")].forEach((c, idx)=>{
    c.classList.toggle("active", idx === activeIndex);
  });
  updateCardButtons();
}

function loadEpisode(index, autoplay, fromUser=false){
  if (fromUser) userInitiated = true;
  if (!widgetReady) return;
  const ep = episodes[index];
  if (!ep) return;

  if (!userInitiated) return;
  activeIndex = index;
  setActiveCard();
  setNowPlaying(ep);

  widget.load(ep.scUrl, { auto_play: autoplay });

  isPlaying = !!autoplay;
  updateCardButtons();
  try{ seedBars(ep.scUrl || ""); paintBars(0); }catch(e){}

  try{
    widget.getDuration((d)=>{
      currentDurationMs = Number(d||0);
      if (seek) seek.max = String(currentDurationMs || 0);
      if (durTime) durTime.textContent = fmt(currentDurationMs);
    });
  }catch(e){}

  if (playBtn) playBtn.disabled = false;
  if (autoplay) openPlayer();
}

function goPrev(){
  if (!episodes.length) return;
  loadEpisode(Math.max(0, activeIndex - 1), true, true);
}
function goNext(){
  if (!episodes.length) return;
  loadEpisode(Math.min(episodes.length - 1, activeIndex + 1), true, true);
}

function initSortBar(){
  if (!sortBar) return;

  const btns = [...sortBar.querySelectorAll(".sort__btn")];

  // Plays sort is not available via the SoundCloud Widget API
  const playsBtn = sortBar.querySelector('[data-sort="plays"]');
  if (playsBtn){
    playsBtn.disabled = true;
    playsBtn.title = "Play counts are not available in this version";
  }

  const setActive = (key)=>{
    btns.forEach(b=> b.classList.toggle("active", b.dataset.sort === key));
  };

  const applySort = (key)=>{
    const currentUrl = (activeIndex >= 0 && episodes[activeIndex]) ? episodes[activeIndex].scUrl : null;

    let next = [...originalEpisodes];

    const byDate = (a)=> {
      // created_at is YYYY-MM-DD (from widget), fallback empty
      return a.date ? new Date(a.date).getTime() : 0;
    };

    switch(key){
      case "default":
        // already in original order
        break;
      case "newest":
        next.sort((a,b)=> byDate(b) - byDate(a));
        break;
      case "oldest":
        next.sort((a,b)=> byDate(a) - byDate(b));
        break;
      case "az":
        next.sort((a,b)=> (a.title||"").localeCompare(b.title||"", undefined, { sensitivity:"base" }));
        break;
      case "za":
        next.sort((a,b)=> (b.title||"").localeCompare(a.title||"", undefined, { sensitivity:"base" }));
        break;
      case "artist":
        next.sort((a,b)=> (a.artist||"").localeCompare(b.artist||"", undefined, { sensitivity:"base" })
            || (a.title||"").localeCompare(b.title||"", undefined, { sensitivity:"base" }));
        break;
      case "top":
        next.sort((a,b)=> (b.views||0) - (a.views||0));
        break;
      case "plays":
        // not supported; keep current
        return;
      default:
        break;
    }

    episodes = next;

    // Keep selection highlighted if possible
    if (currentUrl){
      const ni = episodes.findIndex(e=> e.scUrl === currentUrl);
      activeIndex = ni;
    } else {
      activeIndex = -1;
    }

    // Keep collapsed state and re-render
    renderEpisodes();
    setActive(key);
  };

  btns.forEach(btn=>{
    btn.addEventListener("click", ()=>{
      if (btn.disabled) return;
      applySort(btn.dataset.sort || "default");
    });
  });

  // Default active state
  setActive("default");
}

// ✅ FIX: რამდენჯერმე ცდის getSounds()-ს სანამ ყველა ტრეკი არ ჩამოიტვირთება
async function buildEpisodesFromWidget(){
  return new Promise((resolve)=>{

    let attempts = 0;
    const MAX_ATTEMPTS = 8;
    const DELAY_MS = 1500;

    function tryFetch(){
      attempts++;
      console.log(`[SBS] getSounds attempt ${attempts}...`);

      widget.getSounds((sounds)=>{
        console.log(`[SBS] getSounds returned ${sounds?.length ?? 0} tracks`);

        const list = (sounds || [])
            .filter(s => s && s.permalink_url && !BLOCKLIST.has(s.permalink_url))
            .map((s, idx)=>({
              title: s.title || "(untitled)",
              cover: s.artwork_url || s.user?.avatar_url || FALLBACK_COVER,
              tags: (()=>{
                const g = (s.genre || "").trim();
                if (g) return g.split(/[;,/|]+/).map(x=>x.trim()).filter(Boolean).slice(0,2).map(x=>x.toUpperCase());
                return DEFAULT_TAGS;
              })(),
              scUrl: s.permalink_url,
              playable: true,
              date: (s.created_at || "").slice(0,10),
              artist: (s.user?.username || "7TH BLOCK SOCIETY"),
              durationMs: Number(s.duration || 0),
              originalIndex: idx
            }));

        // თუ ბოლო ცდაა ან ტრეკების რაოდენობა გაიზარდა — დაამთავრე
        const prevCount = window.__sbsPrevCount || 0;
        const grew = list.length > prevCount;
        window.__sbsPrevCount = list.length;

        if (attempts >= MAX_ATTEMPTS || (attempts > 1 && !grew)){
          console.log(`[SBS] Final track count: ${list.length}`);
          resolve(list);
        } else {
          // კიდევ სცადე ცოტა ხნის შემდეგ
          setTimeout(tryFetch, DELAY_MS);
        }
      });
    }

    // პირველი ცდა 1.5 წამის დაყოვნებით
    setTimeout(tryFetch, DELAY_MS);
  });
}

function bindRuntimeEvents(){
  if (!widget) return;

  widget.bind(SC.Widget.Events.PLAY, ()=>{
    isPlaying = true;
    updateCardButtons();
    openPlayer();
    if (playIcon) playIcon.textContent = "⏸";
  });
  widget.bind(SC.Widget.Events.PAUSE, ()=>{
    isPlaying = false;
    updateCardButtons();
    if (playIcon) playIcon.textContent = "▶";
  });
  widget.bind(SC.Widget.Events.FINISH, ()=>{
    isPlaying = false;
    updateCardButtons();
    if (playIcon) playIcon.textContent = "▶";
    paintBars(0);
  });

  setInterval(()=>{
    if (!widgetReady) return;
    widget.getPosition((p)=>{
      const pos = Number(p||0);
      if (curTime) curTime.textContent = fmt(pos);
      if (seek && !seek.matches(":active")) seek.value = String(pos);

      const denom = Math.max(1, Number(currentDurationMs || 0));
      paintBars(Math.min(1, Math.max(0, pos/denom)));
    });
  }, 500);

  if (seek){
    seek.addEventListener("input", ()=>{
      const v = Number(seek.value||0);
      if (curTime) curTime.textContent = fmt(v);
      const denom = Math.max(1, Number(currentDurationMs || 0));
      paintBars(Math.min(1, Math.max(0, v/denom)));
    });
    const commitSeek = ()=>{
      if (!widgetReady) return;
      widget.seekTo(Number(seek.value||0));
    };
    seek.addEventListener("change", commitSeek);
    seek.addEventListener("pointerup", commitSeek);
  }

  prevBtn?.addEventListener("click", goPrev);
  nextBtn?.addEventListener("click", goNext);
  back10Btn?.addEventListener("click", ()=> widget.seekTo(Math.max(0, Number(seek?.value||0) - 10000)));
  fwd10Btn?.addEventListener("click", ()=> widget.seekTo(Number(seek?.value||0) + 10000));

  playBtn?.addEventListener("click", ()=>{
    if (activeIndex < 0) return;

    if (!widgetReady) return;
    openPlayer();
    widget.toggle();
  });

  closeBtn?.addEventListener("click", closePlayer);
  document.addEventListener("keydown", (e)=>{ if (e.key === "Escape") closePlayer(); });

  if (vol){
    vol.addEventListener("input", ()=>{
      paintVolume();
      updateVolIcon();
      if (widgetReady) widget.setVolume(Number(vol.value||0));
    });
  }
}

function init(){
  if (!scIframe || !episodeGrid) return;

  if (playerEl) playerEl.classList.add("is-hidden");
  if (playBtn) playBtn.disabled = true;

  const searchInput = document.getElementById("episodeSearch");
  searchInput?.addEventListener("input", ()=>{
    searchQuery = searchInput.value.toLowerCase().trim();
    visibleCount = PAGE_SIZE;
    renderEpisodes();
  });

  moreBtn?.addEventListener("click", ()=>{
    visibleCount += PAGE_SIZE;
    renderEpisodes();
  });

  initBars();

  // Volume icon (SVG so it can be colored)
  const volSvg = `<svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M3 10v4c0 .55.45 1 1 1h3l4 3c.66.5 1.6.03 1.6-.8V6.8c0-.83-.94-1.3-1.6-.8L7 9H4c-.55 0-1 .45-1 1Zm14.5 2a3.5 3.5 0 0 0-2.04-3.18c-.5-.22-1.08.02-1.3.52-.22.5.02 1.08.52 1.3a1.5 1.5 0 0 1 0 2.72c-.5.22-.74.8-.52 1.3.16.36.51.58.91.58.13 0 .27-.03.39-.08A3.5 3.5 0 0 0 17.5 12Zm2.5 0c0-2.69-1.64-5.06-4.06-5.98-.5-.2-1.08.06-1.27.57-.2.52.06 1.08.57 1.27A4.5 4.5 0 0 1 20 12a4.5 4.5 0 0 1-2.76 4.14c-.52.2-.77.75-.57 1.27.15.4.52.64.92.64.12 0 .24-.02.35-.07A6.5 6.5 0 0 0 20 12Z"/>
  </svg>`;
  if (volIcon) volIcon.innerHTML = volSvg;

  paintBars(0);

  if (typeof SC === "undefined" || !SC.Widget){
    episodeGrid.innerHTML = '<div style="grid-column:1/-1;padding:18px;border:1px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.05);border-radius:10px;">SoundCloud Widget API did not load (api.js blocked).</div>';
    return;
  }

  setWidgetSrc();

  widget = SC.Widget(scIframe);

  widget.bind(SC.Widget.Events.READY, async ()=>{
    widgetReady = true;

    // ჯერ cache-იდან ეგრევე გამოჩნდეს
    const cached = loadCache();
    if (cached && cached.length > 0){
      episodes = cached;
      originalEpisodes = [...episodes].sort((a,b)=> (a.originalIndex||0) - (b.originalIndex||0));
      episodes = [...originalEpisodes];
      initSortBar();
      renderEpisodes();
    }

    paintVolume();
    updateVolIcon();
    widget.setVolume(Number(vol?.value || 70));
    bindRuntimeEvents();

    // ფონში განახლება
    const fresh = await buildEpisodesFromWidget();
    if (fresh && fresh.length > 0){
      saveCache(fresh);
      episodes = fresh;
      originalEpisodes = [...episodes].sort((a,b)=> (a.originalIndex||0) - (b.originalIndex||0));
      episodes = [...originalEpisodes];
      initSortBar();
      renderEpisodes();
      fetchYouTubeViews();
    }
  });
}

init();