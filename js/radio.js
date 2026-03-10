/* ================================
   SBS RADIO — radio.js
   Live Radio with Firebase sync
   Mobile-friendly: play() always in gesture context
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
  var totalTracks  = 0;
  var playHistory  = [];
  var HISTORY_SIZE = 6;

  // seek რომ PLAY event-ში გავაკეთოთ
  var pendingSeekMs = 0;
  var pendingNextTrack = false;

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
      }).catch(function(e) { console.warn("[SBS Radio] write error:", e); });
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

  // PLAY event — seek აქ გავაკეთოთ (gesture context-ი არ გვჭირდება)
  radioWidget.bind(SC.Widget.Events.PLAY, function() {
    radioPlaying = true;
    if (radioDot) radioDot.classList.add("is-playing");

    radioWidget.getCurrentSound(function(sound) {
      if (sound) animateTrackName(parseTrackTitle(sound.title));
    });

    // pending seek?
    if (pendingSeekMs > 0) {
      var ms = pendingSeekMs;
      pendingSeekMs = 0;
      setTimeout(function() { radioWidget.seekTo(ms); }, 300);
    }

    // pending next track? (ტრეკი უკვე დამთავრდებოდა)
    if (pendingNextTrack) {
      pendingNextTrack = false;
      setTimeout(function() { playNextTrack(); }, 100);
    }
  });

  radioWidget.bind(SC.Widget.Events.PAUSE, function() {
    radioPlaying = false;
    if (radioDot) radioDot.classList.remove("is-playing");
  });

  radioWidget.bind(SC.Widget.Events.FINISH, function() {
    radioPlaying = false;
    if (radioDot) radioDot.classList.remove("is-playing");
    playNextTrack();
  });

  // ================================
  // playNextTrack — ტრეკი მოხდა
  // ================================
  function playNextTrack() {
    var idx = pickRandomIndex();
    writeRadioState(idx, Date.now());
    radioWidget.skip(idx);
    radioWidget.play();
  }

  // ================================
  // Click handler — play() ყოველთვის აქ, gesture context-ში
  // ================================
  radioBtnToggle.addEventListener("click", function() {
    if (!radioReady) return;

    // პაუზიდან resume
    if (radioLoaded && !radioPlaying) {
      readRadioState(function(state) {
        if (state && state.trackIndex != null && state.startedAt) {
          var elapsed = Date.now() - state.startedAt;
          // duration გვჭირდება — ვიყენებთ getDuration
          radioWidget.getDuration(function(dur) {
            var duration = Number(dur || 0);
            if (duration > 0 && elapsed >= duration) {
              pendingNextTrack = true;
            } else {
              pendingSeekMs = Math.max(0, elapsed);
            }
            // play() — gesture context-ში ვართ (click callback-ში)
            radioWidget.play();
          });
        } else {
          radioWidget.play();
        }
      });
      return;
    }

    // პაუზა
    if (radioLoaded && radioPlaying) {
      radioWidget.pause();
      return;
    }

    // პირველი დაჭერა — skip() + play() gesture-ში, seek კი PLAY event-ში
    radioLoaded = true;

    // Firebase-ს წავიკითხავთ, მაგრამ play()-ს მანამდე გამოვიძახებთ
    // skip(0) პირველ ტრეკზე მივდივართ — play() gesture-ში
    var firstIdx = pickRandomIndex();
    radioWidget.skip(firstIdx);
    radioWidget.play(); // gesture context — მობილურიც მუშაობს!

    // Firebase-ს async ვკითხავთ — seek PLAY event-ში მოხდება
    readRadioState(function(state) {
      if (state && state.trackIndex != null && state.startedAt) {
        var elapsed = Date.now() - state.startedAt;
        // სხვა visitor-ის ტრეკზე გადავიდეთ
        // playHistory-ში ჩავამატოთ ახალი idx-ი
        playHistory.pop(); // firstIdx-ი ამოვიღოთ
        playHistory.push(state.trackIndex);

        radioWidget.getDuration(function(dur) {
          var duration = Number(dur || 0);
          if (duration > 0 && elapsed >= duration) {
            pendingNextTrack = true;
            radioWidget.skip(state.trackIndex);
          } else {
            pendingSeekMs = Math.max(0, elapsed);
            radioWidget.skip(state.trackIndex);
          }
        });
      } else {
        // პირველი visitor — 10%-ზე + Firebase-ში ჩაწერა
        radioWidget.getDuration(function(dur) {
          var duration = Number(dur || 0);
          var seekMs = Math.floor(duration * 0.10);
          writeRadioState(firstIdx, Date.now() - seekMs);
          pendingSeekMs = seekMs;
        });
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