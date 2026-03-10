/* ================================
   SBS RADIO — radio.js
   Live Radio with Firebase sync
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
  var currentTrackIndex = -1;

  var radioWidget = SC.Widget(radioIframe);

  // ================================
  // Firebase (ჩაიტვირთება index.html-იდან)
  // ================================
  var db = null;
  var fbApp = null;

  function waitForFirebase(cb) {
    if (window.__sbsFirebaseDb) {
      cb(window.__sbsFirebaseDb);
      return;
    }
    var tries = 0;
    var t = setInterval(function() {
      if (window.__sbsFirebaseDb) {
        clearInterval(t);
        cb(window.__sbsFirebaseDb);
      } else if (++tries > 20) {
        clearInterval(t);
        cb(null);
      }
    }, 200);
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
  // Firebase — state წაკითხვა / ჩაწერა
  // ================================
  function writeRadioState(trackIndex, startedAt) {
    waitForFirebase(function(fdb) {
      if (!fdb) return;
      var { doc, setDoc } = window.__sbsFirebaseFns;
      setDoc(doc(fdb, "radio", "state"), {
        trackIndex: trackIndex,
        startedAt: startedAt
      }).catch(function(e) {
        console.warn("[SBS Radio] Firebase write error:", e);
      });
    });
  }

  function readRadioState(cb) {
    waitForFirebase(function(fdb) {
      if (!fdb) { cb(null); return; }
      var { doc, getDoc } = window.__sbsFirebaseFns;
      getDoc(doc(fdb, "radio", "state")).then(function(snap) {
        cb(snap.exists() ? snap.data() : null);
      }).catch(function() { cb(null); });
    });
  }

  // ================================
  // ტრეკის დაკვრა — index + seekMs
  // ================================
  function playTrackAt(index, seekMs) {
    currentTrackIndex = index;
    radioWidget.skip(index);
    radioWidget.play();
    if (seekMs > 0) {
      setTimeout(function() {
        radioWidget.seekTo(seekMs);
      }, 600);
    }
  }

  // ================================
  // ტრეკის დასრულება → შემდეგი
  // ================================
  function playNextTrack() {
    var idx = pickRandomIndex();
    var now = Date.now();
    writeRadioState(idx, now);
    playTrackAt(idx, 0);
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
  // პირველი დაჭერა — Firebase-ს კითხულობს
  // ================================
  function startRadio() {
    // ჯერ Firebase-ს ვკითხავთ — არის სტეიტი?
    readRadioState(function(state) {
      if (state && state.trackIndex != null && state.startedAt) {
        // სხვა visitor-ი უსმენდა — ვუერთდებით
        var elapsed = Date.now() - state.startedAt;
        var idx = state.trackIndex;
        playHistory.push(idx);

        // duration-ს ვიღებთ skip-ის შემდეგ
        radioWidget.skip(idx);
        radioWidget.play();
        setTimeout(function() {
          radioWidget.getDuration(function(dur) {
            var duration = Number(dur || 0);
            if (duration > 0 && elapsed >= duration) {
              // ტრეკი დამთავრდებოდა — შემდეგი
              playNextTrack();
            } else {
              var seekMs = Math.max(0, elapsed);
              if (seekMs > 0) radioWidget.seekTo(seekMs);
            }
          });
        }, 600);

      } else {
        // პირველი visitor — ახალი ტრეკი 10%-იდან
        var idx = pickRandomIndex();
        radioWidget.skip(idx);
        radioWidget.play();
        setTimeout(function() {
          radioWidget.getDuration(function(dur) {
            var duration = Number(dur || 0);
            var seekMs = Math.floor(duration * 0.10);
            var startedAt = Date.now() - seekMs;
            writeRadioState(idx, startedAt);
            if (seekMs > 0) radioWidget.seekTo(seekMs);
          });
        }, 600);
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
      if (totalTracks > 0) {
        startRadio();
      } else {
        setTimeout(function() {
          radioWidget.getSounds(function(sounds) {
            totalTracks = sounds ? sounds.length : 0;
            startRadio();
          });
        }, 1000);
      }
      return;
    }

    // პაუზა/ფლეი — ლაივ რადიოში პაუზა არ არსებობს!
    // ღილაკი მხოლოდ აჩვენებს/მალავს — ტრეკი გრძელდება
    if (radioPlaying) {
      radioWidget.pause();
    } else {
      // resume — Firebase-ს ვკითხავთ სად ვართ ახლა
      readRadioState(function(state) {
        if (state && state.trackIndex != null && state.startedAt) {
          var elapsed = Date.now() - state.startedAt;
          radioWidget.getDuration(function(dur) {
            var duration = Number(dur || 0);
            if (duration > 0 && elapsed >= duration) {
              playNextTrack();
            } else {
              radioWidget.play();
              setTimeout(function() {
                radioWidget.seekTo(Math.max(0, elapsed));
              }, 300);
            }
          });
        } else {
          radioWidget.play();
        }
      });
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