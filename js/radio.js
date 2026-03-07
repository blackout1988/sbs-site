/* ================================
   SBS RADIO — radio.js
   Playlist: https://soundcloud.com/bulbulberlin/sets/bulbul-radio
   Shuffle mode: ყოველ გახსნაზე რანდომი თანმიმდევრობა
   ================================ */

const RADIO_PLAYLIST = "https://soundcloud.com/bulbulberlin/sets/bulbul-radio";
const RADIO_STORAGE_KEY = "sbs_radio_state";

function saveRadioState(trackUrl, positionMs) {
  try {
    localStorage.setItem(RADIO_STORAGE_KEY, JSON.stringify({ url: trackUrl, pos: positionMs }));
  } catch(e) {}
}

function loadRadioState() {
  try {
    const raw = localStorage.getItem(RADIO_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch(e) { return null; }
}

// ტრეკის სახელიდან ტირის შემდეგ ნაწილი ამოჭრის
// მაგ: "Bulbul Radio 12 - Nino Gvalia" → "Nino Gvalia"
function parseTrackTitle(title) {
  if (!title) return "SBS Radio";
  const idx = title.indexOf(" - ");
  if (idx !== -1) return title.slice(idx + 3).trim();
  return title.trim();
}

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function initRadio() {
  const radioIframe    = document.getElementById("radioWidget");
  const radioBtnToggle = document.getElementById("radioBtnToggle");
  const radioPopup     = document.getElementById("radioPopup");
  const radioClose     = document.getElementById("radioClose");
  const radioPlayBtn   = document.getElementById("radioPlayBtn");
  const radioTrackEl   = document.getElementById("radioTrack");
  const radioVolEl     = document.getElementById("radioVol");
  const radioDot       = document.getElementById("radioDot");

  if (!radioIframe || !radioBtnToggle) return;
  if (typeof SC === "undefined" || !SC.Widget) return;

  let radioReady   = false;
  let radioPlaying = false;
  let popupOpen    = false;

  // Shuffle state
  let shuffledTracks = [];  // shuffled permalink URLs
  let shuffleIndex   = 0;   // ახლა რომელ ტრეკზე ვართ
  let radioLoaded    = false;
  let currentRadioUrl = "";

  const radioWidget = SC.Widget(radioIframe);

  // ================================
  // Widget Events
  // ================================
  radioWidget.bind(SC.Widget.Events.READY, function () {
    radioReady = true;
    radioWidget.setVolume(Number(radioVolEl?.value || 70));

    // ყველა ტრეკის ჩამოტვირთვა და shuffle
    radioWidget.getSounds(function (sounds) {
      if (!sounds || !sounds.length) return;
      const urls = sounds
          .filter(s => s && s.permalink_url)
          .map(s => ({ url: s.permalink_url, title: parseTrackTitle(s.title) }));
      shuffledTracks = shuffleArray(urls);
      shuffleIndex = 0;
      console.log("[SBS Radio] Shuffled", shuffledTracks.length, "tracks");
    });
  });

  radioWidget.bind(SC.Widget.Events.PLAY, function () {
    radioPlaying = true;
    if (radioPlayBtn) radioPlayBtn.textContent = "⏸";
    if (radioDot) radioDot.classList.add("is-playing");
    radioWidget.getCurrentSound(function (sound) {
      if (sound && radioTrackEl) radioTrackEl.textContent = parseTrackTitle(sound.title);
      // მიმდინარე ტრეკის URL შევინახოთ
      if (sound) currentRadioUrl = sound.permalink_url || "";
    });
  });

  // ყოველ 5 წამში პოზიციას ვინახავთ localStorage-ში
  setInterval(function () {
    if (!radioPlaying || !currentRadioUrl) return;
    radioWidget.getPosition(function (pos) {
      saveRadioState(currentRadioUrl, Number(pos || 0));
    });
  }, 5000);

  radioWidget.bind(SC.Widget.Events.PAUSE, function () {
    radioPlaying = false;
    if (radioPlayBtn) radioPlayBtn.textContent = "▶";
    if (radioDot) radioDot.classList.remove("is-playing");
  });

  // ტრეკი დამთავრდა — შემდეგი რანდომი ტრეკი
  radioWidget.bind(SC.Widget.Events.FINISH, function () {
    radioPlaying = false;
    if (radioPlayBtn) radioPlayBtn.textContent = "▶";
    if (radioDot) radioDot.classList.remove("is-playing");
    playNextShuffled();
  });

  // ================================
  // Shuffle — შემდეგი ტრეკი
  // ================================
  function playNextShuffled() {
    if (!shuffledTracks.length) return;

    shuffleIndex++;

    // სია დამთავრდა — ხელახლა shuffle და თავიდან
    if (shuffleIndex >= shuffledTracks.length) {
      shuffledTracks = shuffleArray(shuffledTracks);
      shuffleIndex = 0;
    }

    const next = shuffledTracks[shuffleIndex];
    if (!next) return;

    if (radioTrackEl) radioTrackEl.textContent = "Loading...";
    radioWidget.load(next.url, { auto_play: true });
  }

  // ================================
  // UI Controls
  // ================================

  // Toggle popup
  radioBtnToggle.addEventListener("click", function (e) {
    e.stopPropagation();
    popupOpen = !popupOpen;
    radioPopup.classList.toggle("is-open", popupOpen);
    radioPopup.setAttribute("aria-hidden", String(!popupOpen));
  });

  // Close button
  radioClose?.addEventListener("click", function (e) {
    e.stopPropagation();
    popupOpen = false;
    radioPopup.classList.remove("is-open");
    radioPopup.setAttribute("aria-hidden", "true");
  });

  // Play / Pause
  radioPlayBtn?.addEventListener("click", function () {
    if (!radioReady) return;

    if (!radioLoaded) {
      radioLoaded = true;
      if (radioTrackEl) radioTrackEl.textContent = "Loading...";

      const saved = loadRadioState();

      if (saved && saved.url && saved.pos > 0) {
        // დარეფრეშამდე სადაც იყო — იქიდან გავაგრძელოთ
        currentRadioUrl = saved.url;
        radioWidget.load(saved.url, { auto_play: true });
        radioWidget.bind(SC.Widget.Events.PLAY_PROGRESS, function onResume() {
          radioWidget.unbind(SC.Widget.Events.PLAY_PROGRESS);
          radioWidget.seekTo(saved.pos);
        });
      } else if (shuffledTracks.length) {
        // პირველი შესვლა — 25%-დან (ვითომ ლაივშია)
        const first = shuffledTracks[0];
        radioWidget.load(first.url, { auto_play: true });
        radioWidget.bind(SC.Widget.Events.PLAY_PROGRESS, function onFirstSeek() {
          radioWidget.unbind(SC.Widget.Events.PLAY_PROGRESS);
          radioWidget.getDuration(function (dur) {
            const seekTo = Math.floor(Number(dur || 0) * 0.25);
            if (seekTo > 0) radioWidget.seekTo(seekTo);
          });
        });
      } else {
        radioWidget.load(RADIO_PLAYLIST, { auto_play: true });
      }
      return;
    }

    // შემდეგი დაჭერები — pause / resume
    radioWidget.toggle();
  });

  // Volume
  radioVolEl?.addEventListener("input", function () {
    const v = Number(radioVolEl.value || 0);
    if (radioReady) radioWidget.setVolume(v);
    radioVolEl.style.background = `linear-gradient(90deg, var(--brand-red) ${v}%, rgba(255,255,255,0.15) ${v}%)`;
  });

  // Close on outside click
  document.addEventListener("click", function (e) {
    if (!radioPopup?.contains(e.target) && !radioBtnToggle?.contains(e.target)) {
      popupOpen = false;
      radioPopup?.classList.remove("is-open");
      radioPopup?.setAttribute("aria-hidden", "true");
    }
  });

  // Init volume slider style
  if (radioVolEl) {
    radioVolEl.style.background = `linear-gradient(90deg, var(--brand-red) 70%, rgba(255,255,255,0.15) 70%)`;
  }
}

// გამოვიძახოთ გვერდის სრული ჩატვირთვის შემდეგ
if (document.readyState === "complete") {
  initRadio();
} else {
  window.addEventListener("load", initRadio);
}