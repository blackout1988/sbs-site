/* ================================
   SBS CALENDAR — calendar.js
   ================================ */

const GCAL_API_KEY   = "AIzaSyDMVgrni1f9a9-BURQhTH1YGKlOMMElvyA";
const GCAL_ID        = "gogadididze1988@gmail.com";

let SBS_EVENTS = [];

async function fetchGoogleCalendarEvents() {
  const now = new Date();
  const timeMin = new Date(now.getFullYear(), 0, 1).toISOString();
  const timeMax = new Date(now.getFullYear() + 1, 11, 31).toISOString();
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(GCAL_ID)}/events?key=${GCAL_API_KEY}&timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true&orderBy=startTime&maxResults=50`;

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

          console.log("PLAIN desc:", JSON.stringify(plainDesc));
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
      console.log("RAW description:", JSON.stringify(data.items[0].description));
      console.log("FULL item:", JSON.stringify(data.items[0], null, 2));
    }
  } catch(err) {
    console.warn("[SBS] Google Calendar fetch failed:", err);
  }
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

function getDaysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function isSaturday(year, month, day) {
  return new Date(year, month - 1, day).getDay() === 6;
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


async function initCalendar() {
  const container = document.getElementById("upcomingCalendar");
  if (!container) return;

  await fetchGoogleCalendarEvents();

  const now = new Date();
  let selectedYear = now.getFullYear();
  let selectedMonth = now.getMonth() + 1;
  let selectedDay = now.getDate();

  const isMobile = () => window.innerWidth <= 640;

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
            ${event.type ? `<div class="cal-popup__tag doto">${event.type}</div>` : ""}
            <div class="cal-popup__title doto">${event.artist || event.title}</div>
            ${event.event ? `<div class="cal-popup__sub">${event.event}</div>` : ""}
            <div class="cal-popup__time doto">
              <span class="cal-popup__dot"></span>
              ${MONTHS[event.month-1]} ${event.day}, ${event.year} — ${event.time}
            </div>
            <div class="cal-popup__countdown doto" data-eventidx="${i}"></div>
            ${isReleased && event.youtube ? `<a class="cal-popup__released doto" href="${event.youtube}" target="_blank">▶ WATCH ON YOUTUBE</a>` : ""}
          </div>
          ${event.image ? `<div class="cal-popup__img"><img src="${event.image}" alt="" /></div>` : ""}
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
      dot.className = "cal-carousel__dot" + (i === 0 ? " is-active" : "");
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

    prev.addEventListener("click", () => goTo(currentSlide - 1));
    next.addEventListener("click", () => goTo(currentSlide + 1));
    dots.addEventListener("click", e => {
      const dot = e.target.closest(".cal-carousel__dot");
      if (dot) goTo(Number(dot.dataset.idx));
    });

    let touchStartX = 0;
    track.addEventListener("touchstart", e => { touchStartX = e.touches[0].clientX; }, { passive: true });
    track.addEventListener("touchend", e => {
      const d = touchStartX - e.changedTouches[0].clientX;
      if (Math.abs(d) > 40) goTo(d > 0 ? currentSlide + 1 : currentSlide - 1);
    });

    allEvents.forEach((event, i) => {
      const cdEl = track.querySelector(`[data-eventidx="${i}"]`);
      if (!cdEl) return;
      const remaining = getEventDateTime(event) - new Date();
      if (remaining <= 0) { cdEl.textContent = ""; return; }
      cdEl.textContent = formatCountdown(remaining);
      const timer = setInterval(() => {
        const r = getEventDateTime(event) - new Date();
        if (r <= 0) { cdEl.textContent = ""; clearInterval(timer); }
        else { cdEl.textContent = formatCountdown(r); }
      }, 1000);
    });

    goTo(0);
  }

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

      const cell = document.createElement("div");
      cell.className = "cal-cell doto" +
          (sat ? " is-saturday" : "") +
          (event ? " has-event" : "");
      cell.textContent = String(d).padStart(2, "0");
      cell.dataset.day = d;

      if (event) {
        cell.addEventListener("click", () => showPopup(event, cell));
      } else {
        cell.addEventListener("click", () => showEmpty(d, cell));
      }

      dayGrid.appendChild(cell);
    }

    // Auto-show first event
    const firstEvent = getEventsForMonth(selectedYear, selectedMonth)[0];
    if (firstEvent) {
      setTimeout(() => {
        const cell = dayGrid.querySelector(`[data-day="${firstEvent.day}"]`);
        if (cell) showPopup(firstEvent, cell);
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

  function showPopup(event, cell) {
    // Clear any running popup countdown
    if (popupCountdownTimer) { clearInterval(popupCountdownTimer); popupCountdownTimer = null; }

    const eventTime = getEventDateTime(event);
    const now = new Date();
    const diff = eventTime - now;
    const isReleased = diff <= 0;

    popup.innerHTML = `
      <div class="cal-popup__inner">
        <div class="cal-popup__info">
          <div class="cal-popup__date doto">${String(event.day).padStart(2, "0")} ${MONTHS[event.month - 1]}</div>
          ${event.type ? `<div class="cal-popup__tag doto">${event.type}</div>` : ""}
          <div class="cal-popup__title doto">${event.artist || event.title}</div>
          ${event.event ? `<div class="cal-popup__sub">${event.event}</div>` : ""}
          <div class="cal-popup__time doto">
            <span class="cal-popup__dot"></span>
            ${MONTHS[event.month - 1]} ${event.day}, ${event.year} — ${event.time}
          </div>
          <div class="cal-popup__countdown doto" id="popupCountdown"></div>
          ${isReleased && event.youtube
        ? `<a class="cal-popup__released doto" href="${event.youtube}" target="_blank">▶ WATCH ON YOUTUBE</a>`
        : ""
    }
        </div>
        ${event.image ? `<div class="cal-popup__img"><img src="${event.image}" alt="" /></div>` : ""}
      </div>
    `;
    popup.classList.add("is-visible");

    // Start countdown in popup
    const cdEl = document.getElementById("popupCountdown");
    if (cdEl) {
      if (isReleased) {
        cdEl.textContent = "";
      } else {
        const timerId = setInterval(() => {
          const remaining = getEventDateTime(event) - new Date();
          if (remaining <= 0) {
            cdEl.textContent = "";
            clearInterval(timerId);
            popupCountdownTimer = null;
            // Show released link
            const rel = popup.querySelector(".cal-popup__released");
            if (!rel && event.youtube) {
              const a = document.createElement("a");
              a.className = "cal-popup__released doto";
              a.href = event.youtube;
              a.target = "_blank";
              a.textContent = "▶ WATCH ON YOUTUBE";
              cdEl.after(a);
            }
          } else {
            cdEl.textContent = formatCountdown(remaining);
          }
        }, 1000);
        popupCountdownTimer = timerId;
        cdEl.textContent = formatCountdown(diff);
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
      if (event) showPopup(event, null);
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
    if (event) showPopup(event, null);
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