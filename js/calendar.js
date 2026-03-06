/* ================================
   SBS CALENDAR — calendar.js
   ================================ */

const SBS_EVENTS = [
  {
    year: 2026,
    month: 3,
    day: 8,
    title: "NØCTURNE D",
    type: "SBS PODCAST 008",
    time: "22:00",
    desc: "Saturday Evening Session",
    image: "assets/tk.jpg",
    youtube: "https://www.youtube.com/watch?v=xylNIY-e1FI"
  }
];

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


// Countdown / released logic
const countdownTimers = {};

function getEventDateTime(event) {
  const [h, m] = event.time.split(":").map(Number);
  return new Date(event.year, event.month - 1, event.day, h, m, 0);
}

function formatCountdown(ms) {
  if (ms <= 0) return null;
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

function startCellCountdown(cell, event) {
  const id = event.year + "-" + event.month + "-" + event.day;
  if (countdownTimers[id]) clearInterval(countdownTimers[id]);

  const eventTime = getEventDateTime(event);

  function tick() {
    const now = new Date();
    const diff = eventTime - now;

    // Clear old countdown content
    let badge = cell.querySelector(".cal-countdown");
    if (!badge) {
      badge = document.createElement("div");
      badge.className = "cal-countdown";
      cell.appendChild(badge);
    }

    if (diff > 0) {
      badge.textContent = formatCountdown(diff);
      badge.classList.remove("is-released");
    } else {
      badge.textContent = "RELEASED";
      badge.classList.add("is-released");
      if (event.youtube) {
        badge.style.cursor = "pointer";
        badge.onclick = (e) => {
          e.stopPropagation();
          window.open(event.youtube, "_blank");
        };
      }
      clearInterval(countdownTimers[id]);
    }
  }

  tick();
  countdownTimers[id] = setInterval(tick, 1000);
}

function initCalendar() {
  const container = document.getElementById("upcomingCalendar");
  if (!container) return;

  const now = new Date();
  let selectedYear = now.getFullYear();
  let selectedMonth = now.getMonth() + 1;

  container.innerHTML = `
    <div class="cal-wrap">
      <div class="cal-picker">
        <div class="cal-picker__header">
          <span class="cal-picker__year doto">${selectedYear}</span>
        </div>
        <div class="cal-picker__body">
          <div class="cal-picker__highlight"></div>
          <div class="cal-picker__scroll" id="calMonthScroll"></div>
        </div>
      </div>
      <div class="cal-right">
        <div class="cal-grid" id="calDayGrid"></div>
        <div class="cal-event-popup" id="calEventPopup"></div>
      </div>
    </div>
  `;

  const monthScroll = document.getElementById("calMonthScroll");
  const dayGrid = document.getElementById("calDayGrid");
  const popup = document.getElementById("calEventPopup");

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

  function showPopup(event, cell) {
    const eventTime = getEventDateTime(event);
    const now = new Date();
    const diff = eventTime - now;
    const isReleased = diff <= 0;

    popup.innerHTML = `
      <div class="cal-popup__inner">
        <div class="cal-popup__info">
          <div class="cal-popup__date doto">${String(event.day).padStart(2, "0")} ${MONTHS[event.month - 1]}</div>
          <div class="cal-popup__tag doto">${event.type}</div>
          <div class="cal-popup__title doto">${event.title}</div>
          <div class="cal-popup__sub">${event.desc}</div>
          <div class="cal-popup__time doto">
            <span class="cal-popup__dot"></span>
            ${MONTHS[event.month - 1]} ${event.day}, ${event.year} — ${event.time}
          </div>
          <div class="cal-popup__countdown doto" id="popupCountdown"></div>
          ${isReleased && event.youtube ? `<a class="cal-popup__released doto" href="${event.youtube}" target="_blank">▶ WATCH ON YOUTUBE</a>` : ""}
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
        cdEl.textContent = formatCountdown(diff);
      }
    }
    dayGrid.querySelectorAll(".cal-cell").forEach(c => { c.classList.remove("is-active"); c.classList.remove("is-active-empty"); });
    cell.classList.add("is-active");
  }

  function showEmpty(day, cell) {
    // If already active-empty, toggle off
    if (cell.classList.contains("is-active-empty")) {
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
    dayGrid.querySelectorAll(".cal-cell").forEach(c => {
      c.classList.remove("is-active");
      c.classList.remove("is-active-empty");
    });
    cell.classList.add("is-active-empty");
  }

  let monthTimer;
  monthScroll.addEventListener("scroll", () => {
    clearTimeout(monthTimer);
    monthTimer = setTimeout(() => {
      const idx = Math.round(monthScroll.scrollTop / 44);
      selectedMonth = Math.max(1, Math.min(12, idx + 1));
      buildMonthPicker();
      buildDayGrid();
    }, 80);
  });

  monthScroll.addEventListener("click", e => {
    const item = e.target.closest(".cal-picker__item");
    if (!item) return;
    selectedMonth = Number(item.dataset.month);
    monthScroll.scrollTo({ top: (selectedMonth - 1) * 44, behavior: "smooth" });
    buildMonthPicker();
    buildDayGrid();
  });

  buildMonthPicker();
  buildDayGrid();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initCalendar);
} else {
  initCalendar();
}