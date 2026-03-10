/* ================================
   SBS RADIO — radio.js
   Live Radio with Firebase sync
   Pre-fetch state before user interaction
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

  var radioReady    = false;
  var radioPlaying  = false;
  var radioLoaded   = false;
  var totalTracks   = 0;
  var playHistory   = [];
  var HISTORY_SIZE  = 6;
  var pendingSeekMs = 0;

  // წინასწარ წაკითხული state
  var cachedState   = undefined; // undefined = ჯერ არ წაკითხულა, null = ცარიელია

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

  function writeRadioState(trackIndex, startedAt) {
    waitForFirebase(function(fdb) {
      if (!fdb) return;
      var fns = window.__sbsFirebaseFns;
      fns.setDoc(fns.doc(fdb, "radio", "state"), {
        trackIndex: trackIndex,
        startedAt: startedAt
      }).catch(function(e) { console.warn("[SBS Radio] write:", e); });
    });
  }

  // გვერდის ჩატვირთვისას წინასწარ წავიკითხოთ
  function prefetchState() {
    waitForFirebase(function(fdb) {
      if (!fdb) { cachedState = null; return; }
      var fns = window.__sbsFirebaseFns;
      fns.getDoc(fns.doc(fdb, "radio", "state")).then(function(snap) {
        cachedState = snap.exists() ? snap.data() : null;
      }).catch(function() { cachedState = null; });
    });
  }

  // გვერდის ჩატვირთვისთანავე
  prefetchState();

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
  // Smart Shuffle
  // ================================
  function pickRandomIndex() {
    if (!totalTracks) return 0;
    var available = [];
    for (var i = 0; i < totalTracks; i++) {
      if (!playHistory.includes(i)) available.push(i);
    }
    if (!available.length) {
      var last = playHistory[playHistory.length - 1];
      for (var j = 0; j < totalTracks; j++) {
        if (j !== last) available.push(j);
      }
    }
    if (!available.length) return 0;
    var pick = available[Math.floor(Math.random() * available.length)];
    playHistory.push(pick);
    if (playHistory.length > HISTORY_SIZE) playHistory.shift();
    return pick;
  }

  // ================================
  // Widget Events
  // ================================
  radioWidget.bind(SC.Widget.Events.READY, function() {
    radioReady = true;
    radioWidget.setVolume(100);
    radioWidget.getSounds(function(sounds) {
      if (sounds && sounds.length) totalTracks = sounds.length;
    });
  });

  radioWidget.bind(SC.Widget.Events.PLAY, function() {
    radioPlaying = true;
    if (radioDot) radioDot.classList.add("is-playing");
    radioWidget.getCurrentSound(function(sound) {
      if (sound) animateTrackName(parseTrackTitle(sound.title));
    });
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
    var idx = pickRandomIndex();
    writeRadioState(idx, Date.now());
    radioWidget.skip(idx);
    radioWidget.play();
  });

  // ================================
  // Click — ყველა async გარეთ!
  // ================================
  radioBtnToggle.addEventListener("click", function() {
    if (!radioReady) return;

    // პაუზა
    if (radioLoaded && radioPlaying) {
      radioWidget.pause();
      return;
    }

    // resume პაუზიდან
    if (radioLoaded && !radioPlaying) {
      radioWidget.play();
      // seek async — iOS-ზე play() უკვე გასრულდა gesture-ში
      waitForFirebase(function(fdb) {
        if (!fdb) return;
        var fns = window.__sbsFirebaseFns;
        fns.getDoc(fns.doc(fdb, "radio", "state")).then(function(snap) {
          var state = snap.exists() ? snap.data() : null;
          if (state && state.startedAt) {
            var elapsed = Date.now() - state.startedAt;
            radioWidget.getDuration(function(dur) {
              var duration = Number(dur || 0);
              if (duration > 0 && elapsed >= duration) {
                var idx = pickRandomIndex();
                writeRadioState(idx, Date.now());
                radioWidget.skip(idx);
              } else {
                pendingSeekMs = Math.max(0, elapsed);
              }
            });
          }
        });
      });
      return;
    }

    // პირველი დაჭერა
    radioLoaded = true;

    // play() პირდაპირ — gesture context
    radioWidget.play();

    // cachedState უკვე მზადაა (async წინასწარ წავიკითხეთ)
    var state = cachedState;

    if (state && state.trackIndex != null && state.startedAt) {
      // სხვა visitor-ი უსმენდა
      var elapsed = Date.now() - state.startedAt;
      playHistory.push(state.trackIndex);
      radioWidget.skip(state.trackIndex);
      radioWidget.getDuration(function(dur) {
        var duration = Number(dur || 0);
        if (duration > 0 && elapsed >= duration) {
          var idx = pickRandomIndex();
          writeRadioState(idx, Date.now());
          radioWidget.skip(idx);
        } else {
          pendingSeekMs = Math.max(0, elapsed);
        }
      });
    } else {
      // პირველი visitor
      if (totalTracks > 0) {
        var idx = pickRandomIndex();
        radioWidget.skip(idx);
        radioWidget.getDuration(function(dur) {
          var duration = Number(dur || 0);
          var seekMs = Math.floor(duration * 0.10);
          writeRadioState(idx, Date.now() - seekMs);
          pendingSeekMs = seekMs;
        });
      }
    }
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