/* ================================
   SBS YOUTUBE — youtube.js
   Shorts only: <40min, dedup by views
   ================================ */

// YT_WORKER — declared in player.js
// YT_CHANNEL_ID — declared in player.js
const YT_MAX_RESULTS = 50;

let ytVideos        = [];
let ytCarouselIndex = 0;

/* ── ISO 8601 duration → წამები ── */
function parseDuration(iso) {
  if (!iso) return 9999;
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 9999;
  return (parseInt(m[1] || 0) * 3600) +
      (parseInt(m[2] || 0) * 60)   +
      parseInt(m[3] || 0);
}

/* ── 1. Channel → ALL videos (shorts + full) via Worker ── */
async function fetchVideoList() {
  const url  = `${YT_WORKER}/yt/search?part=snippet&channelId=${YT_CHANNEL_ID}&maxResults=${YT_MAX_RESULTS}&order=date&type=video`;
  const res  = await fetch(url);
  const data = await res.json();
  if (!data.items) return [];
  return data.items.map(item => ({
    id:    item.id.videoId,
    title: item.snippet.title,
    thumb: item.snippet.thumbnails.maxres?.url || item.snippet.thumbnails.high?.url || item.snippet.thumbnails.medium?.url,
  }));
}

/* ── 2b. დიდი ვიდეოების map: artist key → video id ── */
function buildFullVideoMap(allVideos, fullVideoIds) {
  const map = {};
  allVideos.forEach(v => {
    if (!fullVideoIds.has(v.id)) return;
    const key = (v.title.includes("|") ? v.title.split("|")[0] : v.title).trim().toLowerCase();
    if (!map[key]) map[key] = v.id;
  });
  return map;
}

/* ── 3. Filter: <40min + dedup by views ── */
async function filterAndDedup(videos) {
  if (!videos.length) return [];

  const ids  = videos.map(v => v.id).join(",");
  const url  = `${YT_WORKER}/yt/videos?part=contentDetails,statistics&id=${ids}`;
  const res  = await fetch(url);
  const data = await res.json();
  if (!data.items) return videos;

  const infoMap = {};
  data.items.forEach(item => {
    infoMap[item.id] = {
      duration: parseDuration(item.contentDetails.duration),
      views:    parseInt(item.statistics?.viewCount || 0)
    };
  });

  const shorts  = videos.filter(v => (infoMap[v.id]?.duration ?? 9999) < 2400);
  const fullIds = new Set(videos.filter(v => (infoMap[v.id]?.duration ?? 0) >= 2400).map(v => v.id));
  const fullMap = buildFullVideoMap(videos, fullIds);

  shorts.forEach(v => { v.views = infoMap[v.id]?.views || 0; });

  const seen = {};
  shorts.forEach(v => {
    const key = (v.title.includes("|") ? v.title.split("|")[0] : v.title).trim().toLowerCase();
    if (!seen[key] || v.views > seen[key].views) {
      seen[key] = v;
    }
  });

  const deduped = Object.values(seen);

  deduped.forEach(v => {
    const key = (v.title.includes("|") ? v.title.split("|")[0] : v.title).trim().toLowerCase();
    v.fullVideoId = fullMap[key] || null;
  });

  deduped.sort((a, b) => shorts.indexOf(a) - shorts.indexOf(b));

  return deduped;
}

/* ── 4. Render carousel ── */
function renderYouTubeCarousel() {
  const track      = document.getElementById("ytTrack");
  const modal      = document.getElementById("ytModal");
  const modalInner = document.getElementById("ytModalInner");
  const modalClose = document.getElementById("ytModalClose");
  const prevBtn    = document.getElementById("ytPrevMobile");
  const nextBtn    = document.getElementById("ytNextMobile");
  const loader     = document.getElementById("ytLoader");

  if (!track) return;

  if (!ytVideos.length) {
    if (loader) loader.textContent = "NO SHORTS FOUND";
    return;
  }

  if (loader) loader.style.display = "none";

  track.innerHTML = ytVideos.map((v, i) => `
    <div class="yt-card" data-idx="${i}">
      <div class="yt-card__thumb">
        <img src="${v.thumb}" alt="${v.title}" loading="lazy" />
        <div class="yt-card__play">
          <svg viewBox="0 0 24 24" fill="white" width="28" height="28"><path d="M8 5v14l11-7z"/></svg>
        </div>
        <div class="yt-card__shorts-badge doto">SHORTS</div>
      </div>
      <div class="yt-card__title doto">${v.title}</div>
    </div>
  `).join("");

  track.querySelectorAll(".yt-card").forEach(card => {
    const video   = ytVideos[parseInt(card.dataset.idx)];
    const thumb   = card.querySelector(".yt-card__thumb");
    let previewIframe = null;
    let longPressTimer = null;
    let isLongPress = false;

    function showPreview() {
      if (previewIframe) return;
      previewIframe = document.createElement("iframe");
      previewIframe.src = `https://www.youtube.com/embed/${video.id}?autoplay=1&mute=1&controls=0&loop=1&playlist=${video.id}&rel=0&modestbranding=1&iv_load_policy=3&disablekb=1`;
      previewIframe.allow = "autoplay; encrypted-media";
      previewIframe.frameBorder = "0";
      previewIframe.style.cssText = "position:absolute;inset:-15%;width:130%;height:130%;border-radius:inherit;z-index:1;pointer-events:none;";
      const overlay = document.createElement("div");
      overlay.className = "yt-preview-overlay";
      overlay.style.cssText = "position:absolute;inset:0;z-index:2;pointer-events:none;";
      thumb.appendChild(previewIframe);
      thumb.appendChild(overlay);
      thumb.querySelector("img").style.opacity = "0";
      thumb.querySelector(".yt-card__play").style.opacity = "0";
    }

    function hidePreview() {
      if (!previewIframe) return;
      previewIframe.remove();
      thumb.querySelector(".yt-preview-overlay")?.remove();
      previewIframe = null;
      thumb.querySelector("img").style.opacity = "1";
      thumb.querySelector(".yt-card__play").style.opacity = "";
    }

    card.addEventListener("mouseenter", showPreview);
    card.addEventListener("mouseleave", hidePreview);

    card.addEventListener("touchstart", e => {
      isLongPress = false;
      longPressTimer = setTimeout(() => {
        isLongPress = true;
        showPreview();
      }, 500);
    }, { passive: true });

    card.addEventListener("touchend", e => {
      clearTimeout(longPressTimer);
      if (isLongPress) return;
      hidePreview();
      const targetId = video.fullVideoId || video.id;
      window.open(`https://www.youtube.com/watch?v=${targetId}`, "_blank");
    });

    card.addEventListener("touchmove", () => {
      clearTimeout(longPressTimer);
    }, { passive: true });

    card.addEventListener("click", e => {
      hidePreview();
      const targetId = video.fullVideoId || video.id;
      window.open(`https://www.youtube.com/watch?v=${targetId}`, "_blank");
    });
  });

  function closeModal() {
    modal.classList.remove("is-open");
    document.body.style.overflow = "";
    modalInner.innerHTML = "";
  }
  if (modalClose) modalClose.addEventListener("click", closeModal);
  document.getElementById("ytModalOverlay")?.addEventListener("click", closeModal);
  document.addEventListener("keydown", e => { if (e.key === "Escape") closeModal(); });

  const dotsWrap = document.getElementById("ytDots");

  function getVisibleCount() {
    const w = window.innerWidth;
    if (w < 380)  return 1;
    if (w < 600)  return 2;
    if (w < 900)  return 3;
    if (w < 1200) return 4;
    return 5;
  }

  function updateDots() {
    if (!dotsWrap) return;
    const visible = getVisibleCount();
    const pages   = Math.ceil(ytVideos.length / visible);
    const current = Math.floor(ytCarouselIndex / visible);
    dotsWrap.innerHTML = Array.from({length: pages}, (_, i) =>
        `<span class="yt-dot${i === current ? ' is-active' : ''}" data-page="${i}"></span>`
    ).join("");
    dotsWrap.querySelectorAll(".yt-dot").forEach(dot => {
      dot.addEventListener("click", () => {
        const visible = getVisibleCount();
        scrollTo(parseInt(dot.dataset.page) * visible);
      });
    });
  }

  function scrollTo(idx) {
    const visible = getVisibleCount();
    const maxIdx  = Math.max(0, ytVideos.length - visible);
    ytCarouselIndex = Math.max(0, Math.min(idx, maxIdx));
    const cardW = track.querySelector(".yt-card")?.offsetWidth || 200;
    const gap   = 16;
    track.style.transform = `translateX(-${ytCarouselIndex * (cardW + gap)}px)`;
    if (prevBtn) prevBtn.style.opacity = ytCarouselIndex === 0 ? "0.3" : "1";
    if (nextBtn) nextBtn.style.opacity = ytCarouselIndex >= maxIdx ? "0.3" : "1";
    updateDots();
  }

  if (prevBtn) prevBtn.addEventListener("click", () => scrollTo(ytCarouselIndex - 1));
  if (nextBtn) nextBtn.addEventListener("click", () => scrollTo(ytCarouselIndex + 1));

  const prevMobile = document.getElementById("ytPrevMobile");
  const nextMobile = document.getElementById("ytNextMobile");
  if (prevMobile) prevMobile.addEventListener("click", () => scrollTo(ytCarouselIndex - 1));
  if (nextMobile) nextMobile.addEventListener("click", () => scrollTo(ytCarouselIndex + 1));

  window.addEventListener("resize", () => scrollTo(ytCarouselIndex));

  const viewport = document.querySelector(".yt-carousel__viewport");
  let dragStartX = 0, dragDelta = 0, isDragging = false;

  function onDragStart(x) { dragStartX = x; dragDelta = 0; isDragging = true; track.classList.add("is-dragging"); }
  function onDragMove(x)  { if (!isDragging) return; dragDelta = x - dragStartX; }
  function onDragEnd()    {
    if (!isDragging) return;
    isDragging = false;
    track.classList.remove("is-dragging");
    if (Math.abs(dragDelta) > 50) {
      scrollTo(dragDelta < 0 ? ytCarouselIndex + 1 : ytCarouselIndex - 1);
    } else {
      scrollTo(ytCarouselIndex);
    }
  }

  viewport?.addEventListener("mousedown",  e => { onDragStart(e.clientX); });
  window.addEventListener("mousemove",     e => { if (isDragging) onDragMove(e.clientX); });
  window.addEventListener("mouseup",       () => onDragEnd());
  viewport?.addEventListener("touchstart", e => { onDragStart(e.touches[0].clientX); }, {passive:true});
  viewport?.addEventListener("touchmove",  e => { onDragMove(e.touches[0].clientX); },  {passive:true});
  viewport?.addEventListener("touchend",   () => onDragEnd());

  setTimeout(() => scrollTo(0), 50);
}

/* ── 5. Init ── */
async function initYouTube() {
  const loader = document.getElementById("ytLoader");
  try {
    const allVideos = await fetchVideoList();
    ytVideos        = await filterAndDedup(allVideos);
    ytVideos        = ytVideos.sort(() => Math.random() - 0.5);

    /* გლობალურად შევინახოთ — calendar.js გამოიყენებს */
    window.__sbsFullVideoMap = {};
    ytVideos.forEach(v => {
      if (v.fullVideoId) {
        const key = (v.title.includes("|") ? v.title.split("|")[0] : v.title).trim().toLowerCase();
        window.__sbsFullVideoMap[key] = v.fullVideoId;
      }
    });

    renderYouTubeCarousel();
  } catch(err) {
    console.warn("[SBS] YouTube fetch failed:", err);
    if (loader) loader.textContent = "VIDEOS UNAVAILABLE";
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initYouTube);
} else {
  initYouTube();
}