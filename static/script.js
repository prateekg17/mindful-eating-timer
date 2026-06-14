/* ============================================================
   Mindful Eating Timer - script.js
   ============================================================ */

(function () {
  "use strict";

  // ---- Constants ----
  const TOTAL_SECONDS = 55 * 60;

  // ---- State ----
  let secondsLeft        = TOTAL_SECONDS;
  let intervalId         = null;
  let isRunning          = false;
  let soundEnabled       = true;

  // Monotonic clock reference point recorded at each start/resume.
  // tick() derives secondsLeft from performance.now() rather than a decrement
  // counter so the display snaps to the correct time immediately after iOS
  // resumes JS, and is unaffected by system clock adjustments.
  let startWallTime      = null;  // performance.now() at last start or resume
  let secondsLeftAtStart = null;  // secondsLeft value at that moment

  // Lazily created on first user gesture to comply with browser autoplay policies.
  let audioCtx = null;

  // Oscillator nodes scheduled in the audio graph; cancelled on pause or reset.
  let scheduledOscillators = [];

  // Near-silent looping buffer that keeps the iOS audio session alive when the
  // user switches to another app (screen still on).
  let keepAliveSource = null;

  // ---- DOM References ----
  const minutesEl        = document.getElementById("minutes");
  const secondsEl        = document.getElementById("seconds");
  const statusEl         = document.getElementById("timer-status");
  const minutesElapsed   = document.getElementById("minutes-elapsed");
  const minutesRemaining = document.getElementById("minutes-remaining");
  const progressEl       = document.getElementById("progress-fill");
  const timerDisplay     = document.querySelector(".timer-display");
  const timerCard        = document.querySelector(".timer-card");
  const btnStart         = document.getElementById("btn-start");
  const btnPause         = document.getElementById("btn-pause");
  const btnReset         = document.getElementById("btn-reset");
  const soundToggle      = document.getElementById("sound-toggle");

  // Monotonic clock helper - performance.now() is unaffected by system clock
  // adjustments (NTP, manual time change, DST); fall back to Date.now() only
  // if the Performance API is unavailable.
  function now() {
    return (typeof performance !== "undefined") ? performance.now() : Date.now();
  }

  function getAudioContext() {
    if (!audioCtx) {
      const AudioCtx = window.AudioContext || window["webkitAudioContext"];
      audioCtx = new AudioCtx();
    }
    if (audioCtx.state === "suspended") {
      audioCtx.resume();
    }
    return audioCtx;
  }

  /**
   * Schedule a single chime at a specific AudioContext timestamp.
   *
   * @param {number}  atTime  - AudioContext time at which the chime starts
   * @param {boolean} isFinal - use a richer tone for the completion chime
   */
  function scheduleChimeAt(atTime, isFinal) {
    const ctx = getAudioContext();

    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-6, atTime);
    compressor.knee.setValueAtTime(6, atTime);
    compressor.ratio.setValueAtTime(4, atTime);
    compressor.attack.setValueAtTime(0.003, atTime);
    compressor.release.setValueAtTime(0.25, atTime);
    compressor.connect(ctx.destination);

    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(1.0, atTime);
    masterGain.connect(compressor);

    const frequencies = isFinal
      ? [523.25, 659.25, 783.99]  // C5, E5, G5 - major chord
      : [659.25, 830.61];         // E5, Ab5 - two-note chime

    let endedCount = 0;

    frequencies.forEach(function (freq, i) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, atTime);

      const oscGain = ctx.createGain();
      oscGain.gain.setValueAtTime(0, atTime);
      oscGain.gain.linearRampToValueAtTime(0.6, atTime + 0.02 + i * 0.04);
      oscGain.gain.exponentialRampToValueAtTime(0.001, atTime + 1.4);

      osc.connect(oscGain);
      oscGain.connect(masterGain);

      osc.onended = function () {
        try { oscGain.disconnect(); } catch (_) { /* ignore */ }

        const idx = scheduledOscillators.indexOf(osc);
        if (idx !== -1) { scheduledOscillators.splice(idx, 1); }

        // Disconnect shared nodes once every oscillator in this chime has ended.
        endedCount += 1;
        if (endedCount === frequencies.length) {
          try { masterGain.disconnect(); } catch (_) { /* ignore */ }
          try { compressor.disconnect(); } catch (_) { /* ignore */ }
        }
      };

      osc.start(atTime + i * 0.04);
      osc.stop(atTime + 1.5);

      scheduledOscillators.push(osc);
    });
  }

  /**
   * Pre-schedule all remaining chimes into the audio graph.
   * Web Audio rendering runs on a dedicated thread, so chimes fire even when
   * the browser tab is in background (user switched to another app, screen on).
   */
  function scheduleAllChimes() {
    cancelScheduledChimes();
    if (!soundEnabled) return;

    const ctx = getAudioContext();
    const now = ctx.currentTime;

    const firstChimeAt = Math.floor((secondsLeft - 1) / 60) * 60;
    for (let s = firstChimeAt; s >= 60; s -= 60) {
      scheduleChimeAt(now + (secondsLeft - s), false);
    }

    // Final completion chime
    scheduleChimeAt(now + secondsLeft, true);
  }

  // Immediately stop all pre-scheduled oscillator nodes.
  function cancelScheduledChimes() {
    if (!audioCtx) return;
    const now = audioCtx.currentTime;
    scheduledOscillators.forEach(function (osc) {
      try { osc.stop(now); } catch (_) { /* ignore */ }
      try { osc.disconnect(); } catch (_) { /* already disconnected */ }
    });
    scheduledOscillators = [];
  }

  /**
   * Start a looping near-silent buffer to keep the iOS audio session alive.
   * iOS suspends the AudioContext when Safari backgrounds unless a session is
   * active; gain 0.001 is inaudible but sufficient to hold the session open.
   */
  function startKeepAlive() {
    stopKeepAlive();
    if (!soundEnabled) return;
    const ctx = getAudioContext();

    const silentBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const source = ctx.createBufferSource();
    source.buffer = silentBuffer;
    source.loop = true;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, ctx.currentTime);
    source.connect(gain);
    gain.connect(ctx.destination);

    source._keepAliveGain = gain;

    source.start();
    keepAliveSource = source;
  }

  // Stop the keep-alive source.
  function stopKeepAlive() {
    if (keepAliveSource) {
      const gain = keepAliveSource._keepAliveGain;
      try { keepAliveSource.stop(); } catch (_) { /* already stopped */ }
      try { keepAliveSource.disconnect(); } catch (_) { /* ignore */ }
      if (gain) {
        try { gain.disconnect(); } catch (_) { /* ignore */ }
      }
      keepAliveSource = null;
    }
  }

  // ---- Display Helpers ----

  function pad(n) {
    return String(n).padStart(2, "0");
  }

  function updateDisplay() {
    const mins = Math.floor(secondsLeft / 60);
    const secs = secondsLeft % 60;

    minutesEl.textContent = pad(mins);
    secondsEl.textContent = pad(secs);

    const elapsed   = Math.floor((TOTAL_SECONDS - secondsLeft) / 60);
    const remaining = Math.ceil(secondsLeft / 60);

    minutesElapsed.textContent   = String(elapsed);
    minutesRemaining.textContent = String(remaining);

    progressEl.value = elapsed;
  }

  function setStatus(text, modifier) {
    statusEl.textContent = text;
    statusEl.className   = "timer-label" + (modifier ? " " + modifier : "");
    timerDisplay.className = "timer-display" + (modifier ? " " + modifier : "");
  }

  function markFinished() {
    stopKeepAlive();
    timerCard.classList.add("finished");
    setStatus("Meal complete - well done!", "finished");
    minutesEl.textContent = "00";
    secondsEl.textContent = "00";
    minutesRemaining.textContent = "0";
    progressEl.value = 55;
    btnStart.disabled = true;
    btnPause.disabled = true;
    // Final chime is already pre-scheduled in the audio graph.
  }

  // ---- Timer Logic ----

  function tick() {
    // Derive remaining time from the monotonic clock so that when iOS resumes
    // JS after backgrounding, the display jumps straight to the correct value
    // rather than continuing from where it was frozen.
    const elapsed = Math.floor((now() - startWallTime) / 1000);
    secondsLeft = Math.max(0, secondsLeftAtStart - elapsed);

    if (secondsLeft <= 0) {
      clearInterval(intervalId);
      intervalId  = null;
      isRunning   = false;
      secondsLeft = 0;
      markFinished();
      return;
    }
    updateDisplay();
  }

  function startTimer() {
    if (isRunning) return;

    getAudioContext(); // warm up on user gesture

    // Capture monotonic clock reference so tick() can compute elapsed time
    // independently of how often setInterval actually fires.
    startWallTime      = now();
    secondsLeftAtStart = secondsLeft;

    isRunning = true;
    setStatus("Eating mindfully...", "running");
    btnStart.disabled = true;
    btnPause.disabled = false;
    timerCard.classList.remove("finished");

    scheduleAllChimes();
    startKeepAlive();

    intervalId = setInterval(tick, 1000);
  }

  function pauseTimer() {
    if (!isRunning) return;

    clearInterval(intervalId);
    intervalId = null;
    isRunning  = false;

    // Cancel future chimes; keep-alive stays running so resume does not need
    // a new user gesture to reschedule into the same audio session.
    cancelScheduledChimes();

    setStatus("Paused", "paused");

    btnStart.textContent = "";
    const icon = document.createElement("span");
    icon.className = "btn-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = "\u25B6";
    btnStart.appendChild(icon);
    btnStart.appendChild(document.createTextNode(" Resume"));

    btnStart.disabled = false;
    btnPause.disabled = true;
  }

  function resetTimer() {
    clearInterval(intervalId);
    intervalId         = null;
    isRunning          = false;
    secondsLeft        = TOTAL_SECONDS;
    startWallTime      = null;
    secondsLeftAtStart = null;

    cancelScheduledChimes();
    stopKeepAlive();

    setStatus("Ready to begin", "");
    updateDisplay();
    timerCard.classList.remove("finished");

    // Restore Start button label
    btnStart.innerHTML = '<span class="btn-icon" aria-hidden="true">&#9654;</span> Start';
    btnStart.disabled  = false;
    btnPause.disabled  = true;
  }

  // ---- Sound Toggle ----

  function toggleSound() {
    soundEnabled = !soundEnabled;
    soundToggle.classList.toggle("active", soundEnabled);
    soundToggle.setAttribute("aria-checked", String(soundEnabled));

    const icon = soundToggle.previousElementSibling.querySelector(".toggle-icon");
    icon.textContent = soundEnabled ? "\uD83D\uDD0A" : "\uD83D\uDD07";

    if (soundEnabled) {
      if (isRunning) {
        scheduleAllChimes();
        startKeepAlive();
      }
    } else {
      cancelScheduledChimes();
      stopKeepAlive();
    }
  }

  // ---- Event Listeners ----

  btnStart.addEventListener("click", startTimer);
  btnPause.addEventListener("click", pauseTimer);
  btnReset.addEventListener("click", resetTimer);
  soundToggle.addEventListener("click", toggleSound);

  // Snap the display to the correct time the instant the user returns to the
  // tab, without waiting for the next setInterval fire.
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden && isRunning) {
      tick();
    }
  });

  // ---- Initial Render ----

  updateDisplay();
})();
