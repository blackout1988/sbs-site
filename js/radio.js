/* ================================
   SBS RADIO — radio.js
   Live Radio with Firebase sync
   Mobile fix: load(url, auto_play) instead of skip()
   ================================ */

const RADIO_PLAYLIST = "https://soundcloud.com/bulbulberlin/sets/bulbul-radio";

function parseTrackTitle(title) {
  if (!title) return "SBS Radio";
  var idx = title.indexOf(" - ");
  if (idx !== -1) return title.slice(idx + 3).trim();
  return title.trim();
}

function initRadio() {
  var radioIframe     = document.getElementById("radioWidget");
  var radioBtnToggle  = document.getElementById("radioBtnToggle");
  var radioDot        = document.getElementById("radioDot");
  var radioLabel      = document.getElementById("radioLabel");
  var radioTrackLabel = document.getElementById("radioTrackLabel");

  if (!radioIframe || !radioBtnToggle) return;
  if (typeof SC === "undefined" || !SC.Widget) return;

  var radioReady   = false;
  var radioPlaying = false;
  var radioLoaded  = false;
  var tracks       = [];   // {url, title} სია
  var playHistory  = [];   // ბოლო N URL
  var HISTORY_SIZE = 6;
  var pendingSeekMs = 0;

  var radioWidget = SC.Widget(radioIframe);

  // ================================
  // Firebase
  // ================================
  function waitForFirebase(cb) {
    if (window.__sbsFirebaseDb) { cb(window.__sbsFirebaseDb); return; }
    var tries = 0;
    var t = setInterval(function() {
      if (window.__sbsFirebaseDb) { clearInterval(t); cb(window.__sbsFirebaseDb); }
      else if (++tries > 20) { clearInterval(t); cb(null); }
    }, 200);
  }

  function writeRadioState(trackUrl, startedAt) {
    waitForFirebase(function(fdb) {
      if (!fdb) return;
      var fns = window.__sbsFirebaseFns;
      fns.setDoc(fns.doc(fdb, "radio", "state"), {
        trackUrl: trackUrl,
        startedAt: startedAt
      }).catch(function(e) { console.warn("[SBS Radio] write:", e); });
    });
  }

  function readRadioState(cb) {
    waitForFirebase(function(fdb) {
      if (!fdb) { cb(null); return; }
      var fns = window.__sbsFirebaseFns;
      fns.getDoc(fns.doc(fdb, "radio", "state")).then(function(snap) {
        cb(snap.exists() ? snap.data() : null);
      }).catch(function() { cb(null); });
    });
  }

  // ================================
  // Animations
  // ================================
  var animLoop = null;

  function animateTrackName(title) {
    if (!radioLabel || !radioTrackLabel) return;
    if (animLoop) { clearTimeout(animLoop); animLoop = null; }

    function runCycle() {
      radioLabel.style.animation = "none";
      radioTrackLabel.style.animation = "none";
      radioLabel.style.opacity = "1";
      radioLabel.style.transform = "translateY(0)";
      radioTrackLabel.style.opacity = "0";
      radioTrackLabel.style.transform = "translateX(100%)";
      radioTrackLabel.textContent = title;
      void radioLabel.offsetWidth;

      radioLabel.style.animation = "slideOutDown 0.3s ease forwards";
      animLoop = setTimeout(function() {
        radioLabel.style.opacity = "0";
        radioLabel.style.animation = "none";
        radioTrackLabel.style.animation = "marqueeIn 4s linear forwards";
        animLoop = setTimeout(function() {
          radioTrackLabel.style.animation = "none";
          radioTrackLabel.style.transform = "translateX(0)";
          radioTrackLabel.style.opacity = "1";
          animLoop = setTimeout(function() {
            radioTrackLabel.style.animation = "slideOutDown 0.3s ease forwards";
            radioLabel.style.animation = "slideInTop 0.3s ease forwards";
            animLoop = setTimeout(function() { runCycle(); }, 5000);
          }, 2500);
        }, 4000);
      }, 300);
    }
    runCycle();
  }

  // ================================
  // Smart Shuffle — URL-ებით
  // ================================
  function pickRandomTrack() {
    if (!tracks.length) return null;
    var available = tracks.filter(function(t) {
      return !playHistory.includes(t.url);
    });
    if (!available.length) {
      var lastUrl = playHistory[playHistory.length - 1];
      available = tracks.filter(function(t) { return t.url !== lastUrl; });
    }
    if (!available.length) return tracks[0];
    var pick = available[Math.floor(Math.random() * available.length)];
    playHistory.push(pick.url);
    if (playHistory.length > HISTORY_SIZE) playHistory.shift();
    return pick;
  }

  // ================================
  // load() — მობილურზე auto_play მუშაობს
  // ================================
  function loadTrack(url, seekMs) {
    pendingSeekMs = seekMs || 0;
    radioWidget.load(url, {
      auto_play: true,
      hide_related: true,
      show_comments: false,
      show_user: false,
      show_reposts: false
    });
  }

  // ================================
  // Widget Events
  // ================================
  radioWidget.bind(SC.Widget.Events.READY, function() {
    radioReady = true;
    radioWidget.setVolume(100);
    radioWidget.getSounds(function(sounds) {
      if (!sounds || !sounds.length) return;
      tracks = sounds
          .filter(function(s) { return s && s.permalink_url; })
          .map(function(s) {
            return { url: s.permalink_url, title: parseTrackTitle(s.title) };
          });
    });
  });

  radioWidget.bind(SC.Widget.Events.PLAY, function() {
    radioPlaying = true;
    if (radioDot) radioDot.classList.add("is-playing");
    radioWidget.getCurrentSound(function(sound) {
      if (sound) animateTrackName(parseTrackTitle(sound.title));
    });
    // seek პენდინგი?
    if (pendingSeekMs > 0) {
      var ms = pendingSeekMs;
      pendingSeekMs = 0;
      setTimeout(function() { radioWidget.seekTo(ms); }, 400);
    }
  });

  radioWidget.bind(SC.Widget.Events.PAUSE, function() {
    radioPlaying = false;
    if (radioDot) radioDot.classList.remove("is-playing");
  });

  radioWidget.bind(SC.Widget.Events.FINISH, function() {
    radioPlaying = false;
    if (radioDot) radioDot.classList.remove("is-playing");
    // შემდეგი ტრეკი
    var next = pickRandomTrack();
    if (!next) return;
    writeRadioState(next.url, Date.now());
    loadTrack(next.url, 0);
  });

  // ================================
  // პირველი დაჭერა
  // ================================
  function doStart() {
    readRadioState(function(state) {
      if (state && state.trackUrl && state.startedAt) {
        // სხვა visitor-ი უსმენდა
        var elapsed = Date.now() - state.startedAt;
        playHistory.push(state.trackUrl);

        // duration გვჭირდება — ჯერ ჩვეულებრივ ტრეკი ჩავტვირთოთ
        // შემდეგ PLAY event-ში seek გავაკეთოთ
        radioWidget.getDuration(function(dur) {
          var duration = Number(dur || 0);
          if (duration > 0 && elapsed >= duration) {
            // ტრეკი დამთავრდებოდა — შემდეგი
            var next = pickRandomTrack();
            if (!next) return;
            writeRadioState(next.url, Date.now());
            loadTrack(next.url, 0);
          } else {
            loadTrack(state.trackUrl, Math.max(0, elapsed));
          }
        });
      } else {
        // პირველი visitor
        var first = pickRandomTrack();
        if (!first) return;
        // 10%-ზე დავიწყოთ — seekMs PLAY event-ში
        // duration ჯერ არ ვიცით, loadTrack-ის შემდეგ PLAY-ზე გამოვთვლით
        pendingSeekMs = -1; // სიგნალი: 10% გამოვთვალოს
        writeRadioState(first.url, Date.now()); // დაახლ. სწორი
        loadTrack(first.url, 0);
      }
    });
  }

  // PLAY event-ში 10% seek
  radioWidget.bind(SC.Widget.Events.PLAY, function() {}); // override below

  var playBound = false;
  function bindPlayEvent() {
    if (playBound) return;
    playBound = true;
    radioWidget.bind(SC.Widget.Events.PLAY, function() {
      radioPlaying = true;
      if (radioDot) radioDot.classList.add("is-playing");
      radioWidget.getCurrentSound(function(sound) {
        if (sound) animateTrackName(parseTrackTitle(sound.title));
      });

      if (pendingSeekMs === -1) {
        // პირველი visitor — 10%
        pendingSeekMs = 0;
        radioWidget.getDuration(function(dur) {
          var duration = Number(dur || 0);
          var seekMs = Math.floor(duration * 0.10);
          if (seekMs > 0) {
            // Firebase-ში განვაახლოთ სწორი startedAt
            readRadioState(function(state) {
              if (state && state.trackUrl) {
                writeRadioState(state.trackUrl, Date.now() - seekMs);
              }
            });
            radioWidget.seekTo(seekMs);
          }
        });
      } else if (pendingSeekMs > 0) {
        var ms = pendingSeekMs;
        pendingSeekMs = 0;
        setTimeout(function() { radioWidget.seekTo(ms); }, 400);
      }
    });
  }

  // ================================
  // Click
  // ================================
  radioBtnToggle.addEventListener("click", function() {
    if (!radioReady) return;

    if (!radioLoaded) {
      radioLoaded = true;
      bindPlayEvent();

      if (tracks.length > 0) {
        doStart();
      } else {
        // tracks ჯერ არ ჩამოტვირთულა
        var waited = 0;
        var t = setInterval(function() {
          if (tracks.length > 0 || waited++ > 10) {
            clearInterval(t);
            doStart();
          }
        }, 500);
      }
      return;
    }

    // პაუზა
    if (radioPlaying) {
      radioWidget.pause();
      return;
    }

    // resume — Firebase-ს ვკითხავთ
    readRadioState(function(state) {
      if (state && state.trackUrl && state.startedAt) {
        var elapsed = Date.now() - state.startedAt;
        radioWidget.getDuration(function(dur) {
          var duration = Number(dur || 0);
          if (duration > 0 && elapsed >= duration) {
            var next = pickRandomTrack();
            if (!next) return;
            writeRadioState(next.url, Date.now());
            loadTrack(next.url, 0);
          } else {
            loadTrack(state.trackUrl, Math.max(0, elapsed));
          }
        });
      } else {
        radioWidget.play();
      }
    });
  });

  // ================================
  // Mobile touch
  // ================================
  radioBtnToggle.addEventListener("touchstart", function() {
    radioBtnToggle.classList.add("touched");
  }, { passive: true });

  radioBtnToggle.addEventListener("touchend", function() {
    setTimeout(function() { radioBtnToggle.classList.remove("touched"); }, 300);
  }, { passive: true });

  animateTrackName("LIVE RADIO");
}

if (document.readyState === "complete") {
  initRadio();
} else {
  window.addEventListener("load", initRadio);
}