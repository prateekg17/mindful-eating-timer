/* ============================================================
   Mindful Eating Timer - script.js
   ============================================================ */

(function () {
  "use strict";

  // ---- Constants ----
  const TOTAL_SECONDS = 55 * 60;

  // ---- State ----
  let secondsLeft = TOTAL_SECONDS;
  let intervalId   = null;
  let isRunning    = false;
  let soundEnabled = true;

  // AudioContext is lazily created on first user gesture to comply with
  // browser autoplay policies.
  let audioCtx = null;

  // ---- DOM References ----
  const minutesEl       = document.getElementById("minutes");
  const secondsEl       = document.getElementById("seconds");
  const statusEl        = document.getElementById("timer-status");
  const minutesElapsed  = document.getElementById("minutes-elapsed");
  const minutesRemaining = document.getElementById("minutes-remaining");
  const progressEl      = document.getElementById("progress-fill");
  const timerDisplay    = document.querySelector(".timer-display");
  const timerCard       = document.querySelector(".timer-card");
  const btnStart        = document.getElementById("btn-start");
  const btnPause        = document.getElementById("btn-pause");
  const btnReset        = document.getElementById("btn-reset");
  const soundToggle     = document.getElementById("sound-toggle");

  // ---- Audio ----

  function getAudioContext() {
    if (!audioCtx) {
      const AudioCtx = window.AudioContext || window["webkitAudioContext"];
      audioCtx = new AudioCtx();
    }
    // Resume if suspended (Safari policy)
    if (audioCtx.state === "suspended") {
      audioCtx.resume();
    }
    return audioCtx;
  }

  /**
   * Play a gentle chime using the Web Audio API.
   * Two overlapping sine tones give a soft bell-like quality that will
   * play through whatever audio output the user has set as their default.
   *
   * @param {boolean} isFinal - use a slightly richer tone for the final chime
   */
  function playChime(isFinal = false) {
    if (!soundEnabled) return;

    const ctx        = getAudioContext();
    const now        = ctx.currentTime;

    // DynamicsCompressorNode normalises the signal closer to the system
    // media volume ceiling, boosting perceived loudness without clipping.
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-6, now);   // dB - start compressing early
    compressor.knee.setValueAtTime(6, now);          // dB - soft knee
    compressor.ratio.setValueAtTime(4, now);         // 4:1 compression ratio
    compressor.attack.setValueAtTime(0.003, now);    // seconds
    compressor.release.setValueAtTime(0.25, now);    // seconds
    compressor.connect(ctx.destination);

    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(1.0, now);
    masterGain.connect(compressor);

    const frequencies = isFinal
      ? [523.25, 659.25, 783.99]   // C5, E5, G5 - a pleasant major chord
      : [659.25, 830.61];          // E5, Ab5 - a gentle two-note chime

    frequencies.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, now);

      const oscGain = ctx.createGain();
      oscGain.gain.setValueAtTime(0, now);
      oscGain.gain.linearRampToValueAtTime(0.6, now + 0.02 + i * 0.04);
      oscGain.gain.exponentialRampToValueAtTime(0.001, now + 1.4);

      osc.connect(oscGain);
      oscGain.connect(masterGain);

      osc.start(now + i * 0.04);
      osc.stop(now + 1.5);
    });
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
    timerCard.classList.add("finished");
    setStatus("Meal complete - well done!", "finished");
    minutesEl.textContent = "00";
    secondsEl.textContent = "00";
    minutesRemaining.textContent = "0";
    progressEl.value = 55;

    btnStart.disabled = true;
    btnPause.disabled = true;

    playChime(true);
  }

  // ---- Timer Logic ----

  function tick() {
    if (secondsLeft <= 0) {
      clearInterval(intervalId);
      intervalId = null;
      isRunning  = false;
      secondsLeft = 0;
      markFinished();
      return;
    }

    secondsLeft -= 1;
    updateDisplay();

    // Chime on every exact minute boundary (seconds == 0) while running
    if (secondsLeft % 60 === 0 && secondsLeft > 0) {
      playChime(false);
    }
  }

  function startTimer() {
    if (isRunning) return;

    getAudioContext(); // warm up on user gesture

    isRunning  = true;
    setStatus("Eating mindfully...", "running");

    btnStart.disabled = true;
    btnPause.disabled = false;

    timerCard.classList.remove("finished");

    intervalId = setInterval(tick, 1000);
  }

  function pauseTimer() {
    if (!isRunning) return;

    clearInterval(intervalId);
    intervalId = null;
    isRunning  = false;

    setStatus("Paused", "paused");

    btnStart.textContent = "";
    const icon = document.createElement("span");
    icon.className   = "btn-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = "\u25B6";
    btnStart.appendChild(icon);
    btnStart.appendChild(document.createTextNode(" Resume"));

    btnStart.disabled = false;
    btnPause.disabled = true;
  }

  function resetTimer() {
    clearInterval(intervalId);
    intervalId  = null;
    isRunning   = false;
    secondsLeft = TOTAL_SECONDS;

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
  }

  // ---- Event Listeners ----

  btnStart.addEventListener("click", startTimer);
  btnPause.addEventListener("click", pauseTimer);
  btnReset.addEventListener("click", resetTimer);
  soundToggle.addEventListener("click", toggleSound);

  // ---- Initial Render ----

  updateDisplay();
})();

