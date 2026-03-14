/* ================================
   SBS CALENDAR — calendar.js
   ================================ */

const GCAL_ID        = "gogadididze1988@gmail.com";
const GCAL_WORKER    = "https://calm-term-88ec.gogadididze1988.workers.dev";

let SBS_EVENTS = [];

async function fetchGoogleCalendarEvents() {
  const now = new Date();
  const timeMin = new Date(now.getFullYear(), 0, 1).toISOString();
  const timeMax = new Date(now.getFullYear() + 1, 11, 31).toISOString();
  const url = `${GCAL_WORKER}/gcal/events?calendarId=${encodeURIComponent(GCAL_ID)}&timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&maxResults=50`;

  try {
    const res  = await fetch(url);
    const data = await res.json();
    if (!data.items) return;

    SBS_EVENTS = data.items
        .filter(e => e.start && (e.start.dateTime || e.start.date))
        .map(e => {
          const start = new Date(e.start.dateTime || e.start.date);
          const rawDesc = e.description || "";

          // Strip HTML — extract href URLs (handles escaped quotes too)
          const plainDesc = rawDesc
              .replace(/\\"/g, '"')
              .replace(/<a\s+href="([^"]+)"[^>]*>[^<]*<\/a>/gi, "$1")
              .replace(/<br\s*\/?>/gi, "\n")
              .replace(/<\/p>/gi, "\n")
              .replace(/<[^>]+>/g, "")
              .replace(/&nbsp;/g, " ")
              .replace(/&amp;/g, "&")
              .trim();

          // Parse structured fields (TYPE:, EVENT:, IMAGE:, YOUTUBE:)
          const getField = (key) => {
            const match = plainDesc.match(new RegExp("^\\s*" + key + ":\\s*(.+)$", "mi"));
            return match ? match[1].trim() : "";
          };


          const typeField    = getField("TYPE");
          const artistField  = getField("ARTIST");
          const eventField   = getField("EVENT");
          const imageField   = getField("IMAGE");
          const youtubeField = getField("YOUTUBE");

          // Clean description — remove structured lines (with optional leading spaces)
          const cleanDesc = plainDesc
              .replace(/^\s*(TYPE|ARTIST|EVENT|IMAGE|YOUTUBE):.+$/gmi, "")
              .replace(/\n{2,}/g, "\n")
              .trim();

          return {
            year:    start.getFullYear(),
            month:   start.getMonth() + 1,
            day:     start.getDate(),
            title:   e.summary || "EVENT",
            type:    typeField || e.location || "SBS EVENT",
            artist:  artistField,
            event:   eventField,
            time:    e.start.dateTime
                ? `${String(start.getHours()).padStart(2,"0")}:${String(start.getMinutes()).padStart(2,"0")}`
                : "00:00",
            desc:    cleanDesc,
            image:   imageField || "assets/tk.jpg",
            youtube: youtubeField || plainDesc.match(/https?:\/\/(?:www\.)?youtube\.com\S+|https?:\/\/youtu\.be\S+/)?.[0] || ""
          };
        });
    // DEBUG — remove after fixing
    if (data.items && data.items[0]) {


    }
  } catch(err) {
    console.warn("[SBS] Google Calendar fetch failed:", err);
  }
}


async function fetchFirestoreEvents() {
  try {
    const res = await fetch(
        "https://firestore.googleapis.com/v1/projects/sevenblocksociety/databases/(default)/documents/approved_events"
    );
    const data = await res.json();
    if (!data.documents) return [];
    return data.documents.map(doc => {
      const f = doc.fields || {};
      const getString = k => f[k]?.stringValue || "";
      const getNum    = k => parseInt(f[k]?.integerValue ?? f[k]?.doubleValue ?? 0);
      const docId = doc.name ? doc.name.split("/").pop() : "";
      const subId = docId.replace(/_rec$|_sat$/, "");
      const isRec = docId.endsWith("_rec");
      const isSat = docId.endsWith("_sat");
      return {
        year:    getNum("year"),
        month:   getNum("month"),
        day:     getNum("day"),
        title:   getString("artist") || "SBS EVENT",
        type:    getString("type") || "PODCAST",
        artist:  getString("artist"),
        event:   getString("event"),
        time:    getString("time") || "00:00",
        desc:    getString("desc"),
        image:   getString("image") || "assets/tk.jpg",
        youtube: getString("youtube"),
        _subId:  subId,
        _docId:  docId,
        _isRec:  isRec,
        _isSat:  isSat,
      };
    }).filter(e => e.year && e.month && e.day);
  } catch(err) {
    console.warn("[SBS] Firestore events fetch failed:", err);
    return [];
  }
}

async function enrichEventsWithAvatars() {
  const allWithSub = SBS_EVENTS.filter(e => e._subId);
  if (!allWithSub.length) return;

  const uniqueIds = [...new Set(allWithSub.map(e => e._subId))];

  const avatarMap = {};
  await Promise.all(uniqueIds.map(async subId => {
    try {
      const res = await fetch(
          `https://firestore.googleapis.com/v1/projects/sevenblocksociety/databases/(default)/documents/submissions/${subId}`
      );
      const data = await res.json();
      const mixLink = data.fields?.mix_link?.stringValue || "";
      if (!mixLink || !mixLink.includes("soundcloud.com")) return;

      const r = await fetch(
          "https://calm-term-88ec.gogadididze1988.workers.dev/sc-avatar?url=" + encodeURIComponent(mixLink)
      );
      const d = await r.json();
      if (d.avatar) avatarMap[subId] = d.avatar;
    } catch(e) {}
  }));

  // subId → submission data map
  const subDataMap = {};
  await Promise.all(uniqueIds.map(async subId => {
    try {
      const res = await fetch(
          `https://firestore.googleapis.com/v1/projects/sevenblocksociety/databases/(default)/documents/submissions/${subId}`
      );
      const data = await res.json();
      const f = data.fields || {};
      subDataMap[subId] = {
        social:   f.social?.stringValue   || f.instagram?.stringValue || "",
        mix_link: f.mix_link?.stringValue  || "",
        bio:      f.message?.stringValue   || "",
      };
    } catch(e) {}
  }));

  SBS_EVENTS = SBS_EVENTS.map(e => {
    const avatar = avatarMap[e._subId];
    const sub    = subDataMap[e._subId] || {};
    return {
      ...e,
      // avatar მხოლოდ tk.jpg-ის ჩასანაცვლებლად, სხვა image-ი ხელუხლებელია
      image:    (!e.image || e.image === "assets/tk.jpg") ? (avatar || e.image) : e.image,
      // bio/social/mix_link ყველა event-ს მოაქვს submissions-იდან
      social:   sub.social   || e.social   || "",
      mix_link: sub.mix_link || e.mix_link || "",
      bio:      sub.bio      || e.bio      || "",
    };
  });
}

const MONTHS = [
  "JANUARY","FEBRUARY","MARCH","APRIL","MAY","JUNE",
  "JULY","AUGUST","SEPTEMBER","OCTOBER","NOVEMBER","DECEMBER"
];

function getEventsForMonth(year, month) {
  return SBS_EVENTS.filter(e => e.year === year && e.month === month);
}

function getEventForDay(year, month, day) {
  return SBS_EVENTS.find(e => e.year === year && e.month === month && e.day === day) || null;
}
function getEventsForDay(year, month, day) {
  return SBS_EVENTS.filter(e => e.year === year && e.month === month && e.day === day);
}

function getDaysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function isSaturday(year, month, day) {
  return new Date(year, month - 1, day).getDay() === 6;
}


function getEventStatus(event) {
  const now = new Date();
  const eventTime = getEventDateTime(event);
  const afterWindow = new Date(eventTime.getTime() + 24 * 60 * 60 * 1000); // +24h
  if (now < eventTime)       return "UPCOMING";   // ჯერ არ დამდგარა
  if (now < afterWindow)     return "ACTIVE";     // გავიდა მაგრამ 24h ფანჯარაშია
  return "PAST";                                   // 24h გავიდა
}

function getEventDateTime(event) {
  const [h, m] = event.time.split(":").map(Number);
  return new Date(event.year, event.month - 1, event.day, h, m, 0);
}

function formatCountdown(ms) {
  if (ms <= 0) return "";
  const totalSec = Math.floor(ms / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;

  if (days > 0) {
    if (hours > 0) return days + "D " + String(hours).padStart(2,"0") + "H " + String(mins).padStart(2,"0") + "M";
    return days + "D " + String(mins).padStart(2,"0") + "M " + String(secs).padStart(2,"0") + "S";
  }
  return String(hours).padStart(2,"0") + ":" + String(mins).padStart(2,"0") + ":" + String(secs).padStart(2,"0");
}


function getTagHTML(typeStr, isReleased) {
  if (isReleased) {
    return `<div class="cal-popup__tag cal-popup__tag--released doto" id="popupTag"><i class="bi bi-bookmark-star cal-tag-icon"></i>PODCAST RELEASED</div>`;
  }
  if (typeStr === "RECORDING") {
    return `<div class="cal-popup__tag doto" id="popupTag"><i class="bi bi-record-circle cal-tag-icon cal-tag-icon--rec"></i>PODCAST RECORD</div>`;
  }
  if (typeStr === "PODCAST") {
    return `<div class="cal-popup__tag doto" id="popupTag"><span class="cal-tag-pulse"></span>NEXT SATURDAY EVENT</div>`;
  }
  return `<div class="cal-popup__tag doto" id="popupTag">${typeStr}</div>`;
}

function getSocialLabel(url) {
  if (!url) return "";
  if (url.includes("instagram.com"))  return `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="currentColor" viewBox="0 0 16 16"><path d="M8 0C5.829 0 5.556.01 4.703.048 3.85.088 3.269.222 2.76.42a3.9 3.9 0 0 0-1.417.923A3.9 3.9 0 0 0 .42 2.76C.222 3.268.087 3.85.048 4.7.01 5.555 0 5.827 0 8.001c0 2.172.01 2.444.048 3.297.04.852.174 1.433.372 1.942.205.526.478.972.923 1.417.444.445.89.719 1.416.923.51.198 1.09.333 1.942.372C5.555 15.99 5.827 16 8 16s2.444-.01 3.298-.048c.851-.04 1.434-.174 1.943-.372a3.9 3.9 0 0 0 1.416-.923c.445-.445.718-.891.923-1.417.197-.509.332-1.09.372-1.942C15.99 10.445 16 10.173 16 8s-.01-2.445-.048-3.299c-.04-.851-.175-1.433-.372-1.941a3.9 3.9 0 0 0-.923-1.417A3.9 3.9 0 0 0 13.24.42c-.51-.198-1.092-.333-1.943-.372C10.443.01 10.172 0 7.998 0zm-.717 1.442h.718c2.136 0 2.389.007 3.232.046.78.035 1.204.166 1.486.275.373.145.64.319.92.599s.453.546.598.92c.11.281.24.705.275 1.485.039.843.047 1.096.047 3.231s-.008 2.389-.047 3.232c-.035.78-.166 1.203-.275 1.485a2.5 2.5 0 0 1-.599.919c-.28.28-.546.453-.92.598-.28.11-.704.24-1.485.276-.843.038-1.096.047-3.232.047s-2.39-.009-3.233-.047c-.78-.036-1.203-.166-1.485-.276a2.5 2.5 0 0 1-.92-.598 2.5 2.5 0 0 1-.6-.92c-.109-.281-.24-.705-.275-1.485-.038-.843-.046-1.096-.046-3.233s.008-2.388.046-3.231c.036-.78.166-1.204.276-1.486.145-.373.319-.64.599-.92s.546-.453.92-.598c.282-.11.705-.24 1.485-.276.738-.034 1.024-.044 2.515-.045zm4.988 1.328a.96.96 0 1 0 0 1.92.96.96 0 0 0 0-1.92m-4.27 1.122a4.109 4.109 0 1 0 0 8.217 4.109 4.109 0 0 0 0-8.217m0 1.441a2.667 2.667 0 1 1 0 5.334 2.667 2.667 0 0 1 0-5.334"/></svg> INSTAGRAM`;
  if (url.includes("soundcloud.com")) return `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" fill="currentColor" viewBox="0 0 24 24"><path d="M1.175 12.225c-.017 0-.032.002-.047.004L1 12.224c0-1.784 1.444-3.228 3.228-3.228.225 0 .445.023.658.067C5.484 7.434 7.368 6 9.599 6c2.486 0 4.507 2.016 4.507 4.508 0 .103-.004.205-.01.306A2.745 2.745 0 0 1 16 13.5a2.75 2.75 0 0 1-2.75 2.75H2.898A1.726 1.726 0 0 1 1.175 14.5v-2.275z"/></svg> SOUNDCLOUD`;
  if (url.includes("facebook.com"))   return `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="currentColor" viewBox="0 0 16 16"><path d="M16 8.049c0-4.446-3.582-8.05-8-8.05C3.58 0-.002 3.603-.002 8.05c0 4.017 2.926 7.347 6.75 7.951v-5.625h-2.03V8.05H6.75V6.275c0-2.017 1.195-3.131 3.022-3.131.876 0 1.791.157 1.791.157v1.98h-1.009c-.993 0-1.303.621-1.303 1.258v1.51h2.218l-.354 2.326H9.25V16c3.824-.604 6.75-3.934 6.75-7.951"/></svg> FACEBOOK`;
  if (url.includes("tiktok.com"))     return `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="currentColor" viewBox="0 0 16 16"><path d="M9 0h1.98c.144.715.54 1.617 1.235 2.512C12.895 3.389 13.797 4 15 4v2c-1.753 0-3.07-.814-4-1.829V11a5 5 0 1 1-5-5v2a3 3 0 1 0 3 3z"/></svg> TIKTOK`;
  return "LINK";
}

function openLightbox(src) {
  let lb = document.getElementById("sbsLightbox");
  if (!lb) {
    lb = document.createElement("div");
    lb.id = "sbsLightbox";
    lb.style.cssText = `
      position:fixed;inset:0;z-index:9999;
      background:rgba(0,0,0,0.92);
      display:flex;align-items:center;justify-content:center;
      cursor:zoom-out;animation:popupIn 0.2s ease;
    `;
    lb.innerHTML = `<img style="max-width:90vw;max-height:90vh;border-radius:8px;object-fit:contain;border:1px solid rgba(254,0,0,0.25);" />`;
    lb.addEventListener("click", () => lb.remove());
    document.body.appendChild(lb);
  }
  lb.querySelector("img").src = src;
  lb.style.display = "flex";
}

let _rebuildCalendar = null;

async function initCalendar() {
  const container = document.getElementById("upcomingCalendar");
  if (!container) return;

  await fetchGoogleCalendarEvents();
  const fsEvents = await fetchFirestoreEvents();
  SBS_EVENTS = [...SBS_EVENTS, ...fsEvents];
  // მხოლოდ RELEASE DATE (_sat) ვაჩვენებთ — _rec ივენთები ამოვიღეთ
  SBS_EVENTS = SBS_EVENTS.filter(e => !e._isRec);

  const seen = new Set();
  SBS_EVENTS = SBS_EVENTS.filter(e => {
    const key = `${e.year}-${e.month}-${e.day}-${e.artist}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // SC avatar-ები ჩამოვიტანოთ tk.jpg-ის მქონე event-ებისთვის
  await enrichEventsWithAvatars();

  const now = new Date();
  let selectedYear = now.getFullYear();
  let selectedMonth = now.getMonth() + 1;
  let selectedDay = now.getDate();

  // თუ ამ თვეში ყველა event PAST-ია → შემდეგ თვეზე გადავიდეთ
  const thisMonthEvents = getEventsForMonth(selectedYear, selectedMonth);
  const allPast = thisMonthEvents.length > 0 && thisMonthEvents.every(e => getEventStatus(e) === "PAST");
  if (allPast) {
    selectedMonth++;
    if (selectedMonth > 12) { selectedMonth = 1; selectedYear++; }
  }

  const isMobile = () => true;

  container.innerHTML = `
    <div class="cal-wrap">
      <div class="cal-grid" id="calDayGrid"></div>
      <div class="cal-bottom-row">
        <div class="cal-pickers-row">
          <div class="cal-picker" id="calMonthPicker">
            <div class="cal-picker__body">
              <div class="cal-picker__highlight"></div>
              <div class="cal-picker__scroll" id="calMonthScroll"></div>
            </div>
          </div>
          <div class="cal-picker cal-picker--day" id="calDayPicker">
            <div class="cal-picker__body">
              <div class="cal-picker__highlight"></div>
              <div class="cal-picker__scroll" id="calDayScroll"></div>
            </div>
          </div>
        </div>
        <div class="cal-right">
          <div class="cal-event-popup" id="calEventPopup"></div>
        </div>
      </div>
    </div>
  `;

  const monthScroll = document.getElementById("calMonthScroll");
  const dayScroll   = document.getElementById("calDayScroll");
  const dayGrid     = document.getElementById("calDayGrid");
  const popup       = document.getElementById("calEventPopup");

  function buildMonthPicker() {
    monthScroll.innerHTML = "";
    MONTHS.forEach((m, i) => {
      const monthNum = i + 1;
      const hasEvent = getEventsForMonth(selectedYear, monthNum).length > 0;
      const div = document.createElement("div");
      div.className = "cal-picker__item doto" +
          (monthNum === selectedMonth ? " is-selected" : "") +
          (hasEvent ? " has-event" : "");
      div.textContent = m;
      div.dataset.month = monthNum;
      monthScroll.appendChild(div);
    });
    monthScroll.scrollTop = (selectedMonth - 1) * 44;
  }

  function buildDayPicker() {
    if (!isMobile()) return;
    dayScroll.innerHTML = "";
    const days = getDaysInMonth(selectedYear, selectedMonth);
    for (let d = 1; d <= days; d++) {
      const hasEvent = !!getEventForDay(selectedYear, selectedMonth, d);
      const sat = isSaturday(selectedYear, selectedMonth, d);
      const div = document.createElement("div");
      div.className = "cal-picker__item doto" +
          (d === selectedDay ? " is-selected" : "") +
          (hasEvent ? " has-event" : "") +
          (sat ? " is-saturday" : "");
      const dayNames = ["SUN","MON","TUE","WED","THU","FRI","SAT"];
      const dayName = dayNames[new Date(selectedYear, selectedMonth - 1, d).getDay()];
      div.innerHTML = `<span class="cal-day-num">${String(d).padStart(2, "0")}</span><span class="cal-day-name">${dayName}</span>`;
      div.dataset.day = d;
      dayScroll.appendChild(div);
    }
    dayScroll.scrollTop = (selectedDay - 1) * 56;
  }

  function buildMobileCarousel() {
    const calWrap = container.querySelector(".cal-wrap");
    const existing = container.querySelector(".cal-carousel");
    if (existing) existing.remove();

    const allEvents = SBS_EVENTS.slice().sort((a, b) => {
      return new Date(a.year, a.month - 1, a.day) - new Date(b.year, b.month - 1, b.day);
    });

    if (!allEvents.length) return;

    let currentSlide = 0;

    const carousel = document.createElement("div");
    carousel.className = "cal-carousel";

    const track = document.createElement("div");
    track.className = "cal-carousel__track";

    allEvents.forEach((event, i) => {
      const slide = document.createElement("div");
      slide.className = "cal-carousel__slide";
      const eventTime = getEventDateTime(event);
      const diff = eventTime - new Date();
      const isReleased = diff <= 0;
      slide.innerHTML = `
        <div class="cal-popup__inner">
          <div class="cal-popup__info">
            <div class="cal-popup__date doto">${String(event.day).padStart(2,"0")} ${MONTHS[event.month-1]}</div>
            ${event.type ? getTagHTML(event.type, (getEventDateTime(event) - new Date()) <= 0) : ""}
            <div class="cal-popup__title doto">${event.artist || event.title}</div>

            <div class="cal-popup__time doto">
              <span class="cal-popup__dot"></span>
              ${MONTHS[event.month-1]} ${event.day}, ${event.year} — ${event.time}
            </div>
            <div class="cal-popup__countdown doto" data-eventidx="${i}"></div>
            ${isReleased && event.youtube ? `<a class="cal-popup__released doto" href="${event.youtube}" target="_blank">▶ WATCH ON YOUTUBE</a>` : ""}
            ${event.bio ? `<div class="cal-popup__bio">${event.bio}</div>` : ""}
            <div class="cal-popup__links">
              ${event.mix_link ? `<a class="cal-popup__link cal-popup__link--sc doto" href="${event.mix_link}" target="_blank"><svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" fill="currentColor" viewBox="0 0 24 24"><path d="M1.175 12.225c-.017 0-.032.002-.047.004L1 12.224c0-1.784 1.444-3.228 3.228-3.228.225 0 .445.023.658.067C5.484 7.434 7.368 6 9.599 6c2.486 0 4.507 2.016 4.507 4.508 0 .103-.004.205-.01.306A2.745 2.745 0 0 1 16 13.5a2.75 2.75 0 0 1-2.75 2.75H2.898A1.726 1.726 0 0 1 1.175 14.5v-2.275z"/></svg> SOUNDCLOUD</a>` : ""}
              ${event.social   ? `<a class="cal-popup__link cal-popup__link--${event.social.includes('instagram') ? 'ig' : event.social.includes('soundcloud') ? 'sc' : event.social.includes('facebook') ? 'fb' : 'tt'} doto" href="${event.social}" target="_blank">${getSocialLabel(event.social)}</a>` : ""}
            </div>
          </div>
          ${(() => {
        const artistKey = (event.artist || event.title || "").split("|")[0].trim().toLowerCase();
        const videoId = isReleased && window.__sbsFullVideoMap && window.__sbsFullVideoMap[artistKey];
        if (videoId) {
          return `<div class="cal-popup__img cal-popup__img--video">
                <iframe
                  src="https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1"
                  allow="autoplay; encrypted-media; fullscreen"
                  allowfullscreen frameborder="0"
                  style="width:100%;height:100%;border-radius:8px;">
                </iframe>
              </div>`;
        }
        return event.image
            ? `<div class="cal-popup__img" onclick="openLightbox('${event.image}')" title="Click to enlarge"><img src="${event.image}" alt="" /></div>`
            : "";
      })()}
        </div>
      `;
      track.appendChild(slide);
    });

    const prev = document.createElement("button");
    prev.className = "cal-carousel__btn cal-carousel__btn--prev doto";
    prev.textContent = "←";

    const next = document.createElement("button");
    next.className = "cal-carousel__btn cal-carousel__btn--next doto";
    next.textContent = "→";

    const dots = document.createElement("div");
    dots.className = "cal-carousel__dots";
    allEvents.forEach((ev, i) => {
      const dot = document.createElement("div");
      const evIsReleased = getEventDateTime(ev) <= new Date();
      dot.className = "cal-carousel__dot" + (i === 0 ? " is-active" : "") + (evIsReleased ? " is-released" : "");
      dot.dataset.idx = i;
      dot.innerHTML = `<span class="cal-dot__day doto">${String(ev.day).padStart(2,"0")}</span><span class="cal-dot__month doto">${MONTHS[ev.month-1].slice(0,3)}</span>`;
      dots.appendChild(dot);
    });

    carousel.appendChild(dots);
    carousel.appendChild(track);
    calWrap.appendChild(carousel);

    function goTo(idx) {
      currentSlide = Math.max(0, Math.min(allEvents.length - 1, idx));
      track.style.transform = `translateX(-${currentSlide * 100}%)`;
      dots.querySelectorAll(".cal-carousel__dot").forEach((d, i) => {
        d.classList.toggle("is-active", i === currentSlide);
      });
    }

    prev.addEventListener("click", () => { if (window._calMobileRotateTimer) { clearInterval(window._calMobileRotateTimer); window._calMobileRotateTimer = null; } goTo(currentSlide - 1); });
    next.addEventListener("click", () => { if (window._calMobileRotateTimer) { clearInterval(window._calMobileRotateTimer); window._calMobileRotateTimer = null; } goTo(currentSlide + 1); });
    dots.addEventListener("click", e => {
      const dot = e.target.closest(".cal-carousel__dot");
      if (dot) { if (window._calMobileRotateTimer) { clearInterval(window._calMobileRotateTimer); window._calMobileRotateTimer = null; } goTo(Number(dot.dataset.idx)); }
    });

    let touchStartX = 0;
    track.addEventListener("touchstart", e => { touchStartX = e.touches[0].clientX; }, { passive: true });
    track.addEventListener("touchend", e => {
      const d = touchStartX - e.changedTouches[0].clientX;
      if (Math.abs(d) > 40) {
        if (window._calMobileRotateTimer) { clearInterval(window._calMobileRotateTimer); window._calMobileRotateTimer = null; }
        goTo(d > 0 ? currentSlide + 1 : currentSlide - 1);
      }
    });

    allEvents.forEach((event, i) => {
      const cdEl = track.querySelector(`[data-eventidx="${i}"]`);
      if (!cdEl) return;
      const remaining = getEventDateTime(event) - new Date();
      if (remaining <= 0) { cdEl.textContent = ""; return; }
      cdEl.textContent = formatCountdown(remaining);
      const timer = setInterval(() => {
        const r = getEventDateTime(event) - new Date();
        if (r <= 0) {
          cdEl.textContent = "";
          clearInterval(timer);
          // countdown გათავდა — სურათი ვიდეოთი შევცვალოთ
          const slide = cdEl.closest(".cal-carousel__slide");
          if (slide) {
            const artistKey = (event.artist || event.title || "").split("|")[0].trim().toLowerCase();
            const videoId = window.__sbsFullVideoMap && window.__sbsFullVideoMap[artistKey];
            if (videoId) {
              const imgEl = slide.querySelector(".cal-popup__img");
              if (imgEl) {
                imgEl.outerHTML = `<div class="cal-popup__img cal-popup__img--video">
                  <iframe
                    src="https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1"
                    allow="autoplay; encrypted-media; fullscreen"
                    allowfullscreen frameborder="0"
                    style="width:100%;height:100%;border-radius:8px;">
                  </iframe>
                </div>`;
              }
            }
          }
        } else { cdEl.textContent = formatCountdown(r); }
      }, 1000);
    });

    // ყველაზე ახლო ივენთი დღევანდელ თარიღთან (წარსულიდანაც)
    const now = new Date();
    const startIdx = (() => {
      let closestIdx = 0;
      let closestDiff = Infinity;
      allEvents.forEach((e, i) => {
        const diff = Math.abs(getEventDateTime(e) - now);
        if (diff < closestDiff) { closestDiff = diff; closestIdx = i; }
      });
      return closestIdx;
    })();

    goTo(startIdx);

    // auto-rotate: 6 წამში შემდეგ ივენთზე
    if (window._calMobileRotateTimer) clearInterval(window._calMobileRotateTimer);

    const startMobileRotate = () => {
      if (allEvents.length > 1) {
        window._calMobileRotateTimer = setInterval(() => {
          goTo((currentSlide + 1) % allEvents.length);
        }, 6000);
      }
    };
    const stopMobileRotate = () => {
      if (window._calMobileRotateTimer) { clearInterval(window._calMobileRotateTimer); window._calMobileRotateTimer = null; }
    };

    carousel.addEventListener('mouseenter', stopMobileRotate);
    carousel.addEventListener('mouseleave', startMobileRotate);

    // startMobileRotate(); — გათიშულია
  }

  _rebuildCalendar = () => applyMobileLayout();

  function applyMobileLayout() {
    const dayPicker = document.getElementById("calDayPicker");
    if (isMobile()) {
      dayGrid.style.display = "none";
      if (dayPicker) dayPicker.style.display = "none";
      const pickers = container.querySelector(".cal-pickers-row");
      if (pickers) pickers.style.display = "none";
      popup.classList.remove("is-visible");
      buildMobileCarousel();
    } else {
      dayGrid.style.display = "";
      if (dayPicker) dayPicker.style.display = "none";
      const pickers = container.querySelector(".cal-pickers-row");
      if (pickers) pickers.style.display = "";
      const carousel = container.querySelector(".cal-carousel");
      if (carousel) carousel.remove();
      buildDayGrid();
    }
  }

  function buildDayGrid() {
    dayGrid.innerHTML = "";
    popup.innerHTML = "";
    popup.classList.remove("is-visible");

    const days = getDaysInMonth(selectedYear, selectedMonth);

    for (let d = 1; d <= days; d++) {
      const sat = isSaturday(selectedYear, selectedMonth, d);
      const event = getEventForDay(selectedYear, selectedMonth, d);

      const status = event ? getEventStatus(event) : null;
      const cell = document.createElement("div");
      cell.className = "cal-cell doto" +
          (sat ? " is-saturday" : "") +
          (event ? " has-event" : "") +
          (status === "PAST" ? " is-past" : "");
      cell.textContent = String(d).padStart(2, "0");
      cell.dataset.day = d;

      if (event) {
        cell.addEventListener("click", () => {
          // მომხმარებელი ხელით ირჩევს — auto-rotate გავაჩეროთ
          if (window._calAutoRotateTimer) { clearInterval(window._calAutoRotateTimer); window._calAutoRotateTimer = null; }
          const dayEvs = getEventsForDay(selectedYear, selectedMonth, d);
          showPopupEvent(dayEvs[0], cell, dayEvs, 0);
        });
      } else {
        cell.addEventListener("click", () => showEmpty(d, cell));
      }

      dayGrid.appendChild(cell);
    }

    // Auto-show: დღეს ყველაზე ახლო UPCOMING/ACTIVE, შემდეგ პირველი
    const monthEvents = getEventsForMonth(selectedYear, selectedMonth);

    // დღეს ახლობელი — UPCOMING-ებიდან ყველაზე ახლო თარიღი
    const upcomingEvents = monthEvents
        .filter(e => getEventStatus(e) !== "PAST")
        .sort((a, b) => getEventDateTime(a) - getEventDateTime(b));

    const autoEvents = upcomingEvents.length ? upcomingEvents : monthEvents.slice();

    if (autoEvents.length) {
      let autoIdx = 0;

      // auto-rotate timer
      if (window._calAutoRotateTimer) clearInterval(window._calAutoRotateTimer);

      const showAutoEvent = () => {
        const ev = autoEvents[autoIdx];
        if (!ev) return;
        const cell = dayGrid.querySelector(`[data-day="${ev.day}"]`);
        if (cell) {
          const dayEvs = getEventsForDay(selectedYear, selectedMonth, ev.day);
          showPopupEvent(dayEvs[0], cell, dayEvs, 0);
        }
        autoIdx = (autoIdx + 1) % autoEvents.length;
      };

      // hover pause — ვამოწმებთ მაუსი dayGrid ან popup-შია
      const isHovered = () => {
        const el = document.querySelector(':hover');
        return el && (dayGrid.contains(el) || popup.contains(el));
      };

      const startAutoRotate = () => {};
      const stopAutoRotate = () => {};

      setTimeout(() => {
        showAutoEvent();
        startAutoRotate();
      }, 100);
    }
  }

  function buildGoogleCalLink(event) {
    const pad = (n) => String(n).padStart(2, "0");
    const [h, m] = event.time.split(":").map(Number);
    const start = `${event.year}${pad(event.month)}${pad(event.day)}T${pad(h)}${pad(m)}00`;
    // end = 2 hours later
    const endH = h + 2;
    const end = `${event.year}${pad(event.month)}${pad(event.day)}T${pad(endH)}${pad(m)}00`;
    const params = new URLSearchParams({
      action: "TEMPLATE",
      text: event.title,
      dates: `${start}/${end}`,
      details: event.desc + (event.youtube ? `\n${event.youtube}` : ""),
    });
    return `https://calendar.google.com/calendar/render?${params.toString()}`;
  }

  let popupCountdownTimer = null;
  let popupRotateTimer = null;
  let popupDayEvents = [];
  let popupDayIdx = 0;

  function showPopupEvent(event, cell, dayEvents, idx) {
    // Clear timers
    if (popupCountdownTimer) { clearInterval(popupCountdownTimer); popupCountdownTimer = null; }
    if (popupRotateTimer)    { clearInterval(popupRotateTimer);    popupRotateTimer = null; }
    popupDayEvents = dayEvents || [event];
    popupDayIdx    = idx || 0;

    // dots HTML
    const dotsHTML = popupDayEvents.length > 1
        ? `<div class="cal-popup__dots">${popupDayEvents.map((_, i) =>
            `<span class="cal-popup__dot-nav${i === popupDayIdx ? ' is-active' : ''}" data-idx="${i}"></span>`
        ).join('')}</div>`
        : '';

    const eventTime = getEventDateTime(event);
    const now = new Date();
    const diff = eventTime - now;
    const isReleased = diff <= 0;

    const tagLabel = event.type || "PODCAST";

    popup.innerHTML = `
      ${dotsHTML}
      <div class="cal-popup__inner">
        <div class="cal-popup__info">
          <div class="cal-popup__header">
            <div class="cal-popup__date doto">${String(event.day).padStart(2, "0")} ${MONTHS[event.month - 1]}</div>
            ${getTagHTML(tagLabel, isReleased)}
          </div>
          <div class="cal-popup__title doto">${event.artist || event.title}</div>
          <div class="cal-popup__time doto">
            <span class="cal-popup__dot"></span>
            ${MONTHS[event.month - 1]} ${event.day}, ${event.year} — ${event.time}
          </div>
          ${!isReleased ? `
          <div class="cal-popup__cd-wrap">
            <div class="cal-popup__cd-label doto">RELEASES IN</div>
            <div class="cal-popup__countdown doto" id="popupCountdown"></div>
          </div>` : `<div class="cal-popup__countdown doto" id="popupCountdown"></div>`}
          ${isReleased && event.youtube
        ? `<a class="cal-popup__released doto" href="${event.youtube}" target="_blank">▶ WATCH ON YOUTUBE</a>`
        : ""
    }
          ${event.bio ? `<div class="cal-popup__bio">${event.bio}</div>` : ""}
          <div class="cal-popup__links">
            ${event.mix_link ? `<a class="cal-popup__link cal-popup__link--sc doto" href="${event.mix_link}" target="_blank"><svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" fill="currentColor" viewBox="0 0 24 24"><path d="M1.175 12.225c-.017 0-.032.002-.047.004L1 12.224c0-1.784 1.444-3.228 3.228-3.228.225 0 .445.023.658.067C5.484 7.434 7.368 6 9.599 6c2.486 0 4.507 2.016 4.507 4.508 0 .103-.004.205-.01.306A2.745 2.745 0 0 1 16 13.5a2.75 2.75 0 0 1-2.75 2.75H2.898A1.726 1.726 0 0 1 1.175 14.5v-2.275z"/></svg> SOUNDCLOUD</a>` : ""}
            ${event.social   ? `<a class="cal-popup__link cal-popup__link--${event.social.includes('instagram') ? 'ig' : event.social.includes('soundcloud') ? 'sc' : event.social.includes('facebook') ? 'fb' : 'tt'} doto" href="${event.social}" target="_blank">${getSocialLabel(event.social)}</a>` : ""}
          </div>
        </div>
        ${(() => {
      const artistKey = (event.artist || event.title || "").split("|")[0].trim().toLowerCase();
      const videoId = isReleased && window.__sbsFullVideoMap && window.__sbsFullVideoMap[artistKey];
      if (videoId) {
        return `<div class="cal-popup__img cal-popup__img--video">
              <iframe
                src="https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1"
                allow="autoplay; encrypted-media; fullscreen"
                allowfullscreen frameborder="0"
                style="width:100%;height:100%;border-radius:8px;">
              </iframe>
            </div>`;
      }
      return event.image
          ? `<div class="cal-popup__img" onclick="openLightbox('${event.image}')" title="Click to enlarge"><img src="${event.image}" alt="" /></div>`
          : "";
    })()}
      </div>
    `;
    popup.classList.add("is-visible");

    // dots click handlers
    popup.querySelectorAll(".cal-popup__dot-nav").forEach(dot => {
      dot.addEventListener("click", () => {
        const i = parseInt(dot.dataset.idx);
        showPopupEvent(popupDayEvents[i], cell, popupDayEvents, i);
      });
    });

    // auto-rotate 4 წამში
    if (popupDayEvents.length > 1) {
      popupRotateTimer = setInterval(() => {
        popupDayIdx = (popupDayIdx + 1) % popupDayEvents.length;
        showPopupEvent(popupDayEvents[popupDayIdx], cell, popupDayEvents, popupDayIdx);
      }, 4000);
    }

    // countdown logic
    const cdEl = document.getElementById("popupCountdown");
    const tagEl = () => document.getElementById("popupTag");

    function updatePopupCountdown() {
      const now = new Date();
      const diff = eventTime - now;

      if (diff > 0) {
        // release-მდე countdown
        if (cdEl) cdEl.textContent = formatCountdown(diff);
      } else {
        // გავიდა
        if (cdEl) cdEl.textContent = "";
        if (tagEl()) { tagEl().className = 'cal-popup__tag cal-popup__tag--released doto'; tagEl().innerHTML = '<i class="bi bi-bookmark-star cal-tag-icon"></i>PODCAST RELEASED'; }
        if (!popup.querySelector(".cal-popup__released") && event.youtube) {
          const a = document.createElement("a");
          a.className = "cal-popup__released doto";
          a.href = event.youtube;
          a.target = "_blank";
          a.textContent = "▶ WATCH ON YOUTUBE";
          cdEl && cdEl.after(a);
        }
        clearInterval(popupCountdownTimer);
        popupCountdownTimer = null;
        return;
      }
    }

    if (cdEl) {
      updatePopupCountdown();
      if (!isReleased) {
        const timerId = setInterval(updatePopupCountdown, 1000);
        popupCountdownTimer = timerId;
      }
    }
    dayGrid.querySelectorAll(".cal-cell").forEach(c => { c.classList.remove("is-active"); c.classList.remove("is-active-empty"); });
    if (cell) cell.classList.add("is-active");
  }

  function showEmpty(day, cell) {
    if (cell && cell.classList.contains("is-active-empty")) {
      cell.classList.remove("is-active-empty");
      popup.classList.remove("is-visible");
      return;
    }
    popup.innerHTML = `
      ${dotsHTML}
      <div class="cal-popup__inner">
        <div class="cal-popup__info">
          <div class="cal-popup__date doto">${String(day).padStart(2, "0")} ${MONTHS[selectedMonth - 1]}</div>
          <div class="cal-popup__empty doto">NO EVENTS SCHEDULED</div>
        </div>
      </div>
    `;
    popup.classList.add("is-visible");
    if (cell) {
      dayGrid.querySelectorAll(".cal-cell").forEach(c => {
        c.classList.remove("is-active");
        c.classList.remove("is-active-empty");
      });
      cell.classList.add("is-active-empty");
    }
  }

  let monthTimer;
  monthScroll.addEventListener("scroll", () => {
    clearTimeout(monthTimer);
    monthTimer = setTimeout(() => {
      const idx = Math.round(monthScroll.scrollTop / 44);
      selectedMonth = Math.max(1, Math.min(12, idx + 1));
      selectedDay = 1;
      buildMonthPicker();
      if (isMobile()) applyMobileLayout();
      else buildDayGrid();
    }, 80);
  });

  monthScroll.addEventListener("click", e => {
    const item = e.target.closest(".cal-picker__item");
    if (!item) return;
    selectedMonth = Number(item.dataset.month);
    selectedDay = 1;
    monthScroll.scrollTo({ top: (selectedMonth - 1) * 44, behavior: "smooth" });
    buildMonthPicker();
    if (isMobile()) applyMobileLayout();
    else buildDayGrid();
  });

  // Day picker listeners (mobile)
  let dayTimer;
  dayScroll.addEventListener("scroll", () => {
    clearTimeout(dayTimer);
    dayTimer = setTimeout(() => {
      const idx = Math.round(dayScroll.scrollTop / 56);
      const days = getDaysInMonth(selectedYear, selectedMonth);
      selectedDay = Math.max(1, Math.min(days, idx + 1));
      buildDayPicker();
      const event = getEventForDay(selectedYear, selectedMonth, selectedDay);
      if (event) { const dayEvs = getEventsForDay(selectedYear, selectedMonth, selectedDay); showPopupEvent(dayEvs[0], null, dayEvs, 0); }
      else showEmpty(selectedDay, null);
    }, 80);
  });

  dayScroll.addEventListener("click", e => {
    const item = e.target.closest(".cal-picker__item");
    if (!item) return;
    selectedDay = Number(item.dataset.day);
    dayScroll.scrollTo({ top: (selectedDay - 1) * 56, behavior: "smooth" });
    buildDayPicker();
    const event = getEventForDay(selectedYear, selectedMonth, selectedDay);
    if (event) { const dayEvs = getEventsForDay(selectedYear, selectedMonth, selectedDay); showPopupEvent(dayEvs[0], null, dayEvs, 0); }
    else showEmpty(selectedDay, null);
  });

  // Resize handler — debounced
  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => applyMobileLayout(), 150);
  });

  buildMonthPicker();
  applyMobileLayout();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initCalendar);
} else {
  initCalendar();
}