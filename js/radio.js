/* ================================
   SBS RADIO — radio.js
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
  const radioDot       = document.getElementById("radioDot");


  if (!radioIframe || !radioBtnToggle) return;
  if (typeof SC === "undefined" || !SC.Widget) return;

  let radioReady   = false;
  let radioPlaying = false;
  let radioLoaded  = false;
  let currentRadioUrl = "";
  let shuffledTracks = [];
  let shuffleIndex   = 0;

  const radioWidget = SC.Widget(radioIframe);

  // ================================
  // Widget Events
  // ================================
  radioWidget.bind(SC.Widget.Events.READY, function () {
    radioReady = true;
    radioWidget.setVolume(100);

    radioWidget.getSounds(function (sounds) {
      if (!sounds || !sounds.length) return;
      const urls = sounds
          .filter(s => s && s.permalink_url)
          .map(s => ({ url: s.permalink_url, title: parseTrackTitle(s.title) }));
      shuffledTracks = shuffleArray(urls);
      shuffleIndex = 0;
    });
  });

  const radioLabel     = document.getElementById("radioLabel");
  const radioTrackLabel = document.getElementById("radioTrackLabel");

  let animLoop = null;

  function animateTrackName(title) {
    if (!radioLabel || !radioTrackLabel) return;

    // გავასუფთავოთ წინა loop
    if (animLoop) { clearTimeout(animLoop); animLoop = null; }

    function runCycle() {
      // reset
      radioLabel.style.animation = "none";
      radioTrackLabel.style.animation = "none";
      radioLabel.style.opacity = "1";
      radioLabel.style.transform = "translateY(0)";
      radioTrackLabel.style.opacity = "0";
      radioTrackLabel.style.transform = "translateX(100%)";
      radioTrackLabel.textContent = title;

      void radioLabel.offsetWidth;

      // 1. LIVE RADIO ქვევით გადის
      radioLabel.style.animation = "slideOutDown 0.3s ease forwards";

      animLoop = setTimeout(function() {
        // 2. ტრეკი მარცხნიდან გადარბის
        radioLabel.style.opacity = "0";
        radioLabel.style.animation = "none";
        radioTrackLabel.style.animation = "marqueeIn 4s linear forwards";

        animLoop = setTimeout(function() {
          // 3. 2.5 წამი ჩერდება
          radioTrackLabel.style.animation = "none";
          radioTrackLabel.style.transform = "translateX(0)";
          radioTrackLabel.style.opacity = "1";

          animLoop = setTimeout(function() {
            // 4. ტრეკი ქვევით ქრება
            radioTrackLabel.style.animation = "slideOutDown 0.3s ease forwards";

            // 5. LIVE RADIO ზემოდან ჩამოდის
            radioLabel.style.animation = "slideInTop 0.3s ease forwards";

            animLoop = setTimeout(function() {
              // 6. ხელახლა იწყება
              runCycle();
            }, 5000); // 5 წამი LIVE RADIO-ს ჩვენება, მერე ისევ

          }, 2500);
        }, 4000);
      }, 300);
    }

    runCycle();
  }

  radioWidget.bind(SC.Widget.Events.PLAY, function () {
    radioPlaying = true;
    if (radioDot) radioDot.classList.add("is-playing");

    radioWidget.getCurrentSound(function (sound) {
      if (sound) {
        currentRadioUrl = sound.permalink_url || "";
        animateTrackName(parseTrackTitle(sound.title));
      }
    });
  });

  setInterval(function () {
    if (!radioPlaying || !currentRadioUrl) return;
    radioWidget.getPosition(function (pos) {
      saveRadioState(currentRadioUrl, Number(pos || 0));
    });
  }, 5000);

  radioWidget.bind(SC.Widget.Events.PAUSE, function () {
    radioPlaying = false;
    if (radioDot) radioDot.classList.remove("is-playing");
  });

  radioWidget.bind(SC.Widget.Events.FINISH, function () {
    radioPlaying = false;
    if (radioDot) radioDot.classList.remove("is-playing");
    playNextShuffled();
  });

  // ================================
  // Smart Shuffle — ბოლო N ტრეკი არ მეორდება
  // ================================
  // საშ. ტრეკი ~45 წთ, 6 საათი = ~8 ტრეკი — history = 6 (7 ტრეკზე max 6)
  const HISTORY_SIZE = 6;
  let playHistory = []; // ბოლოს დაკრული URL-ები

  function pickNextTrack() {
    if (!shuffledTracks.length) return null;

    // ისეთი ტრეკები რომლებიც ბოლო HISTORY_SIZE-ში არ იყო
    const available = shuffledTracks.filter(t => !playHistory.includes(t.url));

    // თუ ყველა ისტორიაშია (ძალიან მცირე playlist) — ყველაზე ძველი ამოვიღოთ
    const pool = available.length > 0 ? available : shuffledTracks.filter(
        t => t.url !== playHistory[playHistory.length - 1]
    );

    if (!pool.length) return shuffledTracks[0];

    // რანდომი pool-იდან
    const pick = pool[Math.floor(Math.random() * pool.length)];

    // ისტორიაში დავამატოთ
    playHistory.push(pick.url);
    if (playHistory.length > HISTORY_SIZE) playHistory.shift();

    return pick;
  }

  function playNextShuffled() {
    if (!shuffledTracks.length) return;
    const next = pickNextTrack();
    if (!next) return;
    radioWidget.load(next.url, { auto_play: true });
  }

  // ================================
  // Click — Play / Pause
  // ================================
  radioBtnToggle.addEventListener("click", function () {
    if (!radioReady) return;

    if (!radioLoaded) {
      radioLoaded = true;

      const saved = loadRadioState();

      if (saved && saved.url && saved.pos > 0) {
        currentRadioUrl = saved.url;
        radioWidget.load(saved.url, { auto_play: true });
        radioWidget.bind(SC.Widget.Events.PLAY_PROGRESS, function onResume() {
          radioWidget.unbind(SC.Widget.Events.PLAY_PROGRESS);
          radioWidget.seekTo(saved.pos);
        });
      } else if (shuffledTracks.length) {
        const first = pickNextTrack();
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

    radioWidget.toggle();
  });

  // ================================
  // Mobile — touch class for hover effect
  // ================================
  radioBtnToggle.addEventListener("touchstart", function () {
    radioBtnToggle.classList.add("touched");
  }, { passive: true });

  radioBtnToggle.addEventListener("touchend", function () {
    setTimeout(() => radioBtnToggle.classList.remove("touched"), 300);
  }, { passive: true });

  // ავტომატურად დაიწყოს გვერდის ჩატვირთვისთანავე
  animateTrackName("LIVE RADIO");
}

if (document.readyState === "complete") {
  initRadio();
} else {
  window.addEventListener("load", initRadio);
}