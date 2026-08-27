(() => {
  'use strict';

  const EXERCISE_SECONDS = 60;
  const RING_CIRCUMFERENCE = 2 * Math.PI * 88;
  const CHALLENGE_LENGTH = 30;
  const STORAGE_KEY = 'dailyTen.completedDates';
  const MUTE_KEY = 'dailyTen.muted';
  const MUSIC_MUTE_KEY = 'dailyTen.musicMuted';
  // Must match CACHE_NAME in sw.js — this is the cache the preloader fills
  // and the one the service worker reads from when offline.
  const CACHE_NAME = 'daily-ten-v10';
  const COUNT_TRACKS = [
    'audio/count_01.wav', 'audio/count_02.wav', 'audio/count_03.wav', 'audio/count_04.wav',
    'audio/count_05.wav', 'audio/count_06.wav', 'audio/count_07.wav', 'audio/count_08.wav',
    'audio/count_09.wav', 'audio/count_10.wav',
  ];
  const REST_START_CUE = 'audio/rest_start.wav';
  const REST_READY_CUE = 'audio/rest_ready.wav';
  const BG_TRACKS = [
    'audio/Music1.mp3',
    'audio/Music2.mp3',
    'audio/Music3.mp3',
    'audio/Music4.mp3',
    'audio/Music5.mp3',
    'audio/Music6.mp3',
    'audio/Music7.mp3',
  ];
  const LAST_TRACK_KEY = 'dailyTen.lastTrackIdx';
  const BG_VOLUME = 0.5;
  const BG_VOLUME_DUCKED = 0.15;

  // Returns track paths in random order, biased away from repeating last
  // session's pick first — used as a try-in-order fallback list in case a
  // track hasn't been added to the folder yet.
  function shuffledTracks() {
    const last = Number(localStorage.getItem(LAST_TRACK_KEY) ?? -1);
    const indices = BG_TRACKS.map((_, i) => i);
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    if (indices.length > 1 && indices[0] === last) {
      [indices[0], indices[1]] = [indices[1], indices[0]];
    }
    localStorage.setItem(LAST_TRACK_KEY, String(indices[0]));
    return indices.map((i) => BG_TRACKS[i]);
  }

  // ---------- DOM ----------
  const screens = {
    home: document.getElementById('screen-home'),
    workout: document.getElementById('screen-workout'),
    complete: document.getElementById('screen-complete'),
  };
  const streakNumEl = document.getElementById('streak-num');
  const streakCaptionEl = document.getElementById('streak-caption');
  const dotsGridEl = document.getElementById('dots-grid');
  const btnStart = document.getElementById('btn-start');
  const preloaderEl = document.getElementById('preloader');
  const preloaderFillEl = document.getElementById('preloader-fill');
  const preloaderCountEl = document.getElementById('preloader-count');

  const btnPause = document.getElementById('btn-pause');
  const iconPause = document.getElementById('icon-pause');
  const iconPlay = document.getElementById('icon-play');
  const btnMute = document.getElementById('btn-mute');
  const iconSoundOn = document.getElementById('icon-sound-on');
  const iconSoundOff = document.getElementById('icon-sound-off');
  const btnMusicMute = document.getElementById('btn-music-mute');
  const iconMusicOn = document.getElementById('icon-music-on');
  const iconMusicOff = document.getElementById('icon-music-off');
  const exIndexEl = document.getElementById('ex-index');
  const progressFillEl = document.getElementById('progress-fill');
  const exImageWrap = document.getElementById('exercise-image-wrap');
  const exImageEl = document.getElementById('ex-image');
  const exNameEl = document.getElementById('ex-name');
  const ringProgressEl = document.getElementById('ring-progress');
  const timerNumberEl = document.getElementById('timer-number');
  const timerCaptionEl = document.getElementById('timer-caption');
  const timerRingWrapEl = document.getElementById('timer-ring-wrap');

  const motivationTextEl = document.getElementById('motivation-text');
  const streakUpdateEl = document.getElementById('streak-update');
  const btnDone = document.getElementById('btn-done');

  const audioAnnounce = document.getElementById('audio-announce');
  const audioComplete = document.getElementById('audio-complete');
  const audioBg = document.getElementById('audio-bg');
  const audioCount = document.getElementById('audio-count');

  const MOTIVATION_LINES = [
    "Amazing work! You crushed today's workout. See you tomorrow!",
    "That's a wrap! Your future self just said thank you. See you tomorrow!",
    "Well done! Another day, another step closer to your goal. Rest up!",
    "You did it! Consistency is your superpower. Come back tomorrow!",
    "Great job today! Small steps, big changes. See you tomorrow!",
    "Workout complete! You're building something amazing. Keep it up!",
    "Fantastic effort! Your body thanks you. Same time tomorrow?",
    "You showed up and finished strong! That's what matters. See you tomorrow!",
    "Awesome work! Progress isn't always loud, but it's always there. Rest well!",
    "Done for today! You're one day stronger. Let's do it again tomorrow!",
  ];

  // Embedded directly (not fetched) so the app works fully offline from local
  // files on a phone — file:// pages can't fetch() local JSON.
  const EXERCISES = [
    { id: 1,  name: "Lymphatic Hops",   image: "Images/1.png",  announce: "audio/announce_01.wav" },
    { id: 2,  name: "Body Waves",       image: "Images/2.png",  announce: "audio/announce_02.wav" },
    { id: 3,  name: "Trunk Twists",     image: "Images/3.png",  announce: "audio/announce_03.wav" },
    { id: 4,  name: "Arm Swings",       image: "Images/4.png",  announce: "audio/announce_04.wav" },
    { id: 5,  name: "Dead Arms",        image: "Images/5.png",  announce: "audio/announce_05.wav" },
    { id: 6,  name: "Golf Swings",      image: "Images/6.png",  announce: "audio/announce_06.wav" },
    { id: 7,  name: "Marches",          image: "Images/7.png",  announce: "audio/announce_07.wav" },
    { id: 8,  name: "Ballet Squats",    image: "Images/8.png",  announce: "audio/announce_08.wav" },
    { id: 9,  name: "Horseback Stance", image: "Images/9.png",  announce: "audio/announce_09.wav" },
    { id: 10, name: "Push-Ups",         image: "Images/10.png", announce: "audio/announce_10.wav", mode: 'reps', reps: 10, sets: 2, restSeconds: 15 },
    { id: 11, name: "Standing Knee Raises", image: "Images/11.png", announce: "audio/announce_11.wav", mode: 'reps', reps: 10, sets: 2, restSeconds: 15 },
    { id: 12, name: "Clap Under Knee",      image: "Images/12.png", announce: "audio/announce_12.wav", mode: 'reps', reps: 10, sets: 2, restSeconds: 15 },
    { id: 13, name: "Knee to Elbow",        image: "Images/13.png", announce: "audio/announce_13.wav", mode: 'reps', reps: 10, sets: 2, restSeconds: 15 },
    { id: 14, name: "Knee Closes",          image: "Images/14.png", announce: "audio/announce_14.wav", mode: 'reps', reps: 10, sets: 2, restSeconds: 15 },
    { id: 15, name: "Toe Touches",          image: "Images/15.png", announce: "audio/announce_15.wav", mode: 'reps', reps: 10, sets: 2, restSeconds: 15 },
  ];

  let exercises = [];
  let currentIndex = 0;
  let wakeLock = null;
  let remaining = EXERCISE_SECONDS;
  let tickHandle = null;
  let isPaused = false;
  // Reps-based exercises (e.g. Push-Ups) walk through 'set' -> 'rest' -> 'set'
  // instead of a single 60s countdown. null means "this exercise is time-based".
  let repsPhase = null;
  let repsSetNum = 1;
  let currentPhaseDuration = EXERCISE_SECONDS;
  // Which rep count (1-10) is currently being spoken during a 'set' phase.
  let countIdx = 0;
  let isMuted = localStorage.getItem(MUTE_KEY) === '1';
  let isMusicMuted = localStorage.getItem(MUSIC_MUTE_KEY) === '1';

  // ---------- Placeholder image (data URI, generated once) ----------
  const PLACEHOLDER_SRC = (() => {
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">
        <rect width="400" height="400" fill="#FFFFFF"/>
        <circle cx="200" cy="160" r="46" fill="#F1E9F5"/>
        <path d="M200 214c-58 0-96 32-104 84a10 10 0 0010 12h188a10 10 0 0010-12c-8-52-46-84-104-84z" fill="#F1E9F5"/>
      </svg>`;
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
  })();

  // ---------- Background music: real track if present, else a generative beat ----------
  const Music = (() => {
    let ctx = null;
    let masterGain = null;
    let bgGain = null;
    let bgSourceConnected = false;
    let noiseBuffer = null;
    let running = false;
    let schedulerTimer = null;
    let usingRealTrack = false;
    // Music has its own independent mute state (separate from voice cues).
    let muted = isMusicMuted;

    const BPM = 126;
    const SECONDS_PER_BEAT = 60 / BPM;
    const LOOKAHEAD_MS = 25;
    const SCHEDULE_AHEAD = 0.12;
    let nextNoteTime = 0;
    let beatCount = 0;
    const BASE_VOLUME = 0.10;

    // Underlying two-chord pad, very low in the mix, just for warmth.
    const CHORDS = [
      [130.81, 164.81, 196.00], // Cmaj-ish, low
      [110.00, 130.81, 164.81], // Am-ish, low
    ];
    let chordIdx = 0;
    let chordTimer = null;

    function ensureCtx() {
      if (!ctx) {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        masterGain = ctx.createGain();
        masterGain.gain.value = muted ? 0 : BASE_VOLUME;
        masterGain.connect(ctx.destination);

        // Pre-render a short noise buffer for the hi-hat.
        const len = ctx.sampleRate * 0.12;
        noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
        const data = noiseBuffer.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      }
      // Route the <audio> background track through a Web Audio gain node.
      // iOS Safari silently ignores audio.volume on <audio> elements — only
      // Web Audio GainNode automation actually changes loudness there, which
      // is why mute/duck must go through this instead of audioBg.volume.
      if (!bgSourceConnected) {
        const bgSource = ctx.createMediaElementSource(audioBg);
        bgGain = ctx.createGain();
        bgGain.gain.value = muted ? 0 : BG_VOLUME;
        bgSource.connect(bgGain);
        bgGain.connect(ctx.destination);
        bgSourceConnected = true;
      }
    }

    function playKick(time) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(150, time);
      osc.frequency.exponentialRampToValueAtTime(42, time + 0.12);
      g.gain.setValueAtTime(0.9, time);
      g.gain.exponentialRampToValueAtTime(0.001, time + 0.22);
      osc.connect(g);
      g.connect(masterGain);
      osc.start(time);
      osc.stop(time + 0.24);
    }

    function playHat(time, volume) {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = 7000;
      const g = ctx.createGain();
      g.gain.setValueAtTime(volume, time);
      g.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
      src.connect(filter);
      filter.connect(g);
      g.connect(masterGain);
      src.start(time);
      src.stop(time + 0.06);
    }

    function scheduleBeat(time, beatIndex) {
      // Four-on-the-floor kick, with an off-beat hi-hat for drive.
      playKick(time);
      playHat(time + SECONDS_PER_BEAT / 2, 0.35);
      if (beatIndex % 4 === 0) playHat(time, 0.2);
    }

    function scheduler() {
      while (nextNoteTime < ctx.currentTime + SCHEDULE_AHEAD) {
        scheduleBeat(nextNoteTime, beatCount);
        beatCount++;
        nextNoteTime += SECONDS_PER_BEAT;
      }
    }

    function playChord(freqs) {
      const now = ctx.currentTime;
      const chordGain = ctx.createGain();
      chordGain.gain.setValueAtTime(0, now);
      chordGain.gain.linearRampToValueAtTime(0.5, now + 1.2);
      chordGain.gain.linearRampToValueAtTime(0, now + 7.6);
      chordGain.connect(masterGain);

      freqs.forEach((f) => {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = f;
        osc.connect(chordGain);
        osc.start(now);
        osc.stop(now + 7.8);
      });
    }

    function chordLoop() {
      playChord(CHORDS[chordIdx % CHORDS.length]);
      chordIdx++;
      chordTimer = setTimeout(chordLoop, 8 * SECONDS_PER_BEAT * 1000);
    }

    function startGenerative() {
      usingRealTrack = false;
      ensureCtx();
      if (ctx.state === 'suspended') ctx.resume();
      running = true;
      if (schedulerTimer) return; // already looping — just switched from a real track
      beatCount = 0;
      nextNoteTime = ctx.currentTime + 0.05;
      schedulerTimer = setInterval(scheduler, LOOKAHEAD_MS);
      chordLoop();
    }

    function tryTracks(paths) {
      if (paths.length === 0) { startGenerative(); return; }
      ensureCtx();
      const [next, ...rest] = paths;
      audioBg.src = next;
      bgGain.gain.value = muted ? 0 : BG_VOLUME;
      const playPromise = audioBg.play();
      if (playPromise && playPromise.then) {
        playPromise
          .then(() => { usingRealTrack = true; running = true; })
          .catch(() => tryTracks(rest));
      } else {
        startGenerative();
      }
    }

    return {
      start() {
        if (running) return;
        tryTracks(shuffledTracks());
      },
      // Switch to a fresh random track — called on every exercise change so
      // each exercise gets a different one of the 7 tracks.
      nextTrack() {
        audioBg.pause();
        tryTracks(shuffledTracks());
      },
      stop() {
        running = false;
        audioBg.pause();
        audioBg.currentTime = 0;
        if (schedulerTimer) clearInterval(schedulerTimer);
        if (chordTimer) clearTimeout(chordTimer);
      },
      // Temporarily silence playback when the app is backgrounded (tab
      // hidden / user switched away) without losing session state — unlike
      // stop(), a later resumeBackground() picks back up where it left off.
      pauseBackground() {
        if (!running) return;
        if (usingRealTrack) {
          audioBg.pause();
        } else {
          if (schedulerTimer) { clearInterval(schedulerTimer); schedulerTimer = null; }
          if (chordTimer) { clearTimeout(chordTimer); chordTimer = null; }
        }
      },
      resumeBackground() {
        if (!running) return;
        if (usingRealTrack) {
          audioBg.play().catch(() => {});
        } else {
          if (ctx && ctx.state === 'suspended') ctx.resume();
          if (!schedulerTimer) {
            nextNoteTime = ctx.currentTime + 0.05;
            schedulerTimer = setInterval(scheduler, LOOKAHEAD_MS);
            chordLoop();
          }
        }
      },
      duck(active) {
        if (usingRealTrack) {
          if (!bgGain) return;
          const target = muted ? 0 : (active ? BG_VOLUME_DUCKED : BG_VOLUME);
          bgGain.gain.linearRampToValueAtTime(target, ctx.currentTime + 0.3);
          return;
        }
        if (!masterGain) return;
        const target = muted ? 0 : (active ? 0.035 : BASE_VOLUME);
        masterGain.gain.linearRampToValueAtTime(target, ctx.currentTime + 0.3);
      },
      setMuted(m) {
        muted = m;
        if (bgGain) {
          bgGain.gain.linearRampToValueAtTime(muted ? 0 : BG_VOLUME, (ctx ? ctx.currentTime : 0) + 0.15);
        }
        if (usingRealTrack) return;
        if (!masterGain) return;
        masterGain.gain.linearRampToValueAtTime(muted ? 0 : BASE_VOLUME, (ctx ? ctx.currentTime : 0) + 0.2);
      },
      beep() {
        ensureCtx();
        if (isMuted) return;
        const now = ctx.currentTime;
        [880, 1175].forEach((freq, i) => {
          const osc = ctx.createOscillator();
          const g = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.value = freq;
          const start = now + i * 0.16;
          g.gain.setValueAtTime(0, start);
          g.gain.linearRampToValueAtTime(0.22, start + 0.02);
          g.gain.exponentialRampToValueAtTime(0.001, start + 0.22);
          osc.connect(g);
          g.connect(ctx.destination);
          osc.start(start);
          osc.stop(start + 0.24);
        });
      },
    };
  })();

  // ---------- Keep screen awake during the workout ----------
  async function requestWakeLock() {
    try {
      if ('wakeLock' in navigator) {
        wakeLock = await navigator.wakeLock.request('screen');
      }
    } catch (e) { /* not supported / denied — ignore */ }
  }
  function releaseWakeLock() {
    if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
  }
  let isBackgroundPaused = false;
  document.addEventListener('visibilitychange', () => {
    const workoutActive = screens.workout.classList.contains('is-active');
    if (document.visibilityState === 'visible') {
      if (workoutActive && !isPaused) {
        requestWakeLock();
        Music.resumeBackground();
        if (isBackgroundPaused) {
          startTimer();
          if (repsPhase === 'set' && !isMuted && !audioCount.ended) audioCount.play().catch(() => {});
          isBackgroundPaused = false;
        }
      }
    } else {
      Music.pauseBackground();
      if (workoutActive && !isPaused && (tickHandle || (repsPhase === 'set' && !audioCount.paused))) {
        stopTimer();
        if (repsPhase === 'set') audioCount.pause();
        isBackgroundPaused = true;
      }
    }
  });

  // ---------- Streak / storage ----------
  function todayKey(d = new Date()) {
    return d.toISOString().slice(0, 10);
  }
  function getCompletedDates() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    } catch { return []; }
  }
  function saveCompletedDates(arr) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
  }
  function markTodayComplete() {
    const dates = getCompletedDates();
    const key = todayKey();
    if (!dates.includes(key)) dates.push(key);
    saveCompletedDates(dates);
    return computeStreak(dates);
  }
  function computeStreak(dates) {
    const set = new Set(dates);
    let streak = 0;
    let cursor = new Date();
    if (!set.has(todayKey(cursor))) {
      cursor.setDate(cursor.getDate() - 1);
      if (!set.has(todayKey(cursor))) return 0;
    }
    while (set.has(todayKey(cursor))) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    }
    return Math.min(streak, CHALLENGE_LENGTH);
  }

  function renderHome() {
    const dates = getCompletedDates();
    const streak = computeStreak(dates);
    streakNumEl.textContent = streak;
    streakCaptionEl.textContent =
      streak === 0 ? "Let's start your streak today" :
      streak >= CHALLENGE_LENGTH ? "Challenge complete — incredible!" :
      `${streak} day${streak === 1 ? '' : 's'} strong. Keep it going!`;

    dotsGridEl.innerHTML = '';
    for (let i = 0; i < CHALLENGE_LENGTH; i++) {
      const dot = document.createElement('div');
      dot.className = 'dot' + (i < streak ? ' is-done' : '');
      dotsGridEl.appendChild(dot);
    }
  }

  // ---------- Screen navigation ----------
  function showScreen(name) {
    Object.values(screens).forEach(s => s.classList.remove('is-active'));
    screens[name].classList.add('is-active');
  }

  // ---------- Workout flow ----------
  function loadExercise(index) {
    const ex = exercises[index];
    exIndexEl.textContent = index + 1;
    progressFillEl.style.width = `${((index + 1) / exercises.length) * 100}%`;
    exNameEl.textContent = ex.name;
    exImageEl.onerror = () => { exImageEl.onerror = null; exImageEl.src = PLACEHOLDER_SRC; };
    exImageEl.src = ex.image;
    exImageEl.alt = ex.name;

    if (ex.mode === 'reps') {
      startRepsSet(ex, 1, { afterAnnounce: true });
    } else {
      repsPhase = null;
      timerRingWrapEl.classList.remove('is-tappable');
      timerCaptionEl.textContent = '';
      currentPhaseDuration = EXERCISE_SECONDS;
      remaining = EXERCISE_SECONDS;
      updateRing();
      timerNumberEl.textContent = remaining;
    }
  }

  // Shows "Set N of M · X reps". With voice on, the coach counts the reps
  // out loud (1..reps) and the set auto-completes when she finishes; the
  // ring stays tappable throughout so a faster/slower set can be confirmed
  // manually at any point. With voice muted there's no way to pace the
  // count, so it falls back to a plain tap-to-confirm checkmark.
  //
  // opts.afterAnnounce delays the spoken count until the "Next up: <name>"
  // announcement finishes, so the two voice lines don't overlap — used only
  // when entering a fresh exercise (set 1); set 2 (after a rest, no
  // announce playing) always counts immediately.
  function startRepsSet(ex, setNum, opts = {}) {
    repsPhase = 'set';
    repsSetNum = setNum;
    stopTimer();
    ringProgressEl.style.strokeDashoffset = 0;
    ringProgressEl.style.stroke = 'var(--accent-coral)';
    timerCaptionEl.textContent = `Set ${setNum} of ${ex.sets} · ${ex.reps} reps`;
    timerRingWrapEl.classList.add('is-tappable');

    if (isMuted) {
      timerNumberEl.textContent = '✓';
      return;
    }

    const announcePlaying = opts.afterAnnounce && !audioAnnounce.paused && !audioAnnounce.ended;
    if (announcePlaying) {
      timerNumberEl.textContent = '✓';
      const startCounting = () => {
        if (repsPhase === 'set' && repsSetNum === setNum && exercises[currentIndex] === ex) {
          playCount(1, ex.reps);
        }
      };
      audioAnnounce.addEventListener('ended', startCounting, { once: true });
      audioAnnounce.addEventListener('error', startCounting, { once: true });
    } else {
      playCount(1, ex.reps);
    }
  }

  // Speaks rep number n aloud and shows it on the ring; onCountAudioEnded
  // advances to n+1, or auto-completes the set once the final rep is spoken.
  function playCount(n, totalReps) {
    if (repsPhase !== 'set') return;
    countIdx = n;
    timerNumberEl.textContent = String(n);
    if (n > totalReps) {
      setTimeout(() => { if (repsPhase === 'set') completeRepsSet(); }, 400);
      return;
    }
    audioCount.src = COUNT_TRACKS[n - 1];
    audioCount.muted = isMuted;
    audioCount.play().catch(() => onCountAudioEnded());
  }

  function onCountAudioEnded() {
    if (repsPhase !== 'set') return;
    const ex = exercises[currentIndex];
    playCount(countIdx + 1, ex.reps);
  }

  // Automatic countdown between sets.
  function startRest(ex) {
    repsPhase = 'rest';
    timerRingWrapEl.classList.remove('is-tappable');
    timerCaptionEl.textContent = 'Rest';
    currentPhaseDuration = ex.restSeconds;
    remaining = ex.restSeconds;
    updateRing();
    timerNumberEl.textContent = remaining;
    playAnnounce(REST_START_CUE);
    startTimer();
  }

  // Ring tap during a rep set: move to rest after set 1, or to the next
  // exercise after the final set (mirrors a normal timed exercise ending).
  function completeRepsSet() {
    const ex = exercises[currentIndex];
    if (repsPhase !== 'set') return;
    audioCount.pause();
    if (repsSetNum < ex.sets) {
      startRest(ex);
    } else {
      nextExercise();
    }
  }

  const TRANSITION_OUT_MS = 90;

  // Fades the current exercise image out, swaps in the new exercise's
  // content while hidden, then fades it back in — used for every exercise
  // change, whether reached automatically or by a manual skip tap.
  function transitionToExercise(index) {
    exImageEl.classList.add('is-transitioning');
    setTimeout(() => {
      loadExercise(index);
      requestAnimationFrame(() => {
        exImageEl.classList.remove('is-transitioning');
      });
    }, TRANSITION_OUT_MS);
  }

  function updateRing() {
    const fraction = remaining / currentPhaseDuration;
    ringProgressEl.style.strokeDashoffset = RING_CIRCUMFERENCE * (1 - fraction);
    if (remaining <= 5) {
      ringProgressEl.style.stroke = 'var(--accent-mint)';
    } else {
      ringProgressEl.style.stroke = 'var(--accent-coral)';
    }
  }

  function playAnnounce(src) {
    if (isMuted || !src) return;
    audioAnnounce.src = src;
    audioAnnounce.play().catch(() => {});
  }

  function goToExercise(index) {
    currentIndex = index;
    Music.nextTrack();
    Music.duck(true);
    playAnnounce(exercises[currentIndex].announce);
    transitionToExercise(currentIndex);
    setTimeout(() => Music.duck(false), 1800);
  }

  function nextExercise() {
    if (currentIndex + 1 < exercises.length) {
      goToExercise(currentIndex + 1);
    } else {
      finishWorkout();
    }
  }

  function prevExercise() {
    if (currentIndex > 0) {
      goToExercise(currentIndex - 1);
    }
  }

  function tick() {
    remaining--;
    timerNumberEl.textContent = Math.max(remaining, 0);
    updateRing();

    if (repsPhase === 'rest' && remaining === 2) {
      playAnnounce(REST_READY_CUE);
    }

    if (remaining <= 0) {
      Music.beep();
      if (repsPhase === 'rest') {
        startRepsSet(exercises[currentIndex], 2);
      } else {
        nextExercise();
      }
    }
  }

  function startTimer() {
    stopTimer();
    if (repsPhase === 'set') return; // waiting on a manual tap, not a countdown
    tickHandle = setInterval(tick, 1000);
  }
  function stopTimer() {
    if (tickHandle) clearInterval(tickHandle);
    tickHandle = null;
  }

  function startWorkout() {
    currentIndex = 0;
    isPaused = false;
    iconPause.style.display = '';
    iconPlay.style.display = 'none';
    showScreen('workout');
    loadExercise(0);
    Music.start();
    playAnnounce(exercises[0].announce);
    startTimer();
    requestWakeLock();
  }

  function togglePause() {
    isPaused = !isPaused;
    if (isPaused) {
      stopTimer();
      if (repsPhase === 'set') audioCount.pause();
      iconPause.style.display = 'none';
      iconPlay.style.display = '';
      Music.duck(true);
      releaseWakeLock();
    } else {
      startTimer();
      if (repsPhase === 'set' && !isMuted && !audioCount.ended) audioCount.play().catch(() => {});
      iconPause.style.display = '';
      iconPlay.style.display = 'none';
      Music.duck(false);
      requestWakeLock();
    }
  }

  function toggleMute() {
    isMuted = !isMuted;
    localStorage.setItem(MUTE_KEY, isMuted ? '1' : '0');
    iconSoundOn.style.display = isMuted ? 'none' : '';
    iconSoundOff.style.display = isMuted ? '' : 'none';
    audioAnnounce.muted = isMuted;
    audioComplete.muted = isMuted;
    audioCount.muted = isMuted;
  }

  function toggleMusicMute() {
    isMusicMuted = !isMusicMuted;
    localStorage.setItem(MUSIC_MUTE_KEY, isMusicMuted ? '1' : '0');
    iconMusicOn.style.display = isMusicMuted ? 'none' : '';
    iconMusicOff.style.display = isMusicMuted ? '' : 'none';
    Music.setMuted(isMusicMuted);
  }

  function pickMotivation() {
    const lastKey = 'dailyTen.lastMotivationIdx';
    const last = Number(localStorage.getItem(lastKey) ?? -1);
    let idx = Math.floor(Math.random() * MOTIVATION_LINES.length);
    if (MOTIVATION_LINES.length > 1) {
      while (idx === last) idx = Math.floor(Math.random() * MOTIVATION_LINES.length);
    }
    localStorage.setItem(lastKey, String(idx));
    return idx;
  }

  function finishWorkout() {
    stopTimer();
    Music.stop();
    releaseWakeLock();
    const idx = pickMotivation();
    motivationTextEl.textContent = MOTIVATION_LINES[idx];
    const streak = markTodayComplete();
    streakUpdateEl.textContent = `Day ${streak} of ${CHALLENGE_LENGTH} complete`;
    showScreen('complete');

    if (!isMuted) {
      const src = `audio/completion_${String(idx + 1).padStart(2, '0')}.wav`;
      audioComplete.src = src;
      audioComplete.play().catch(() => {});
    }
  }

  // ---------- Offline readiness ----------
  function buildAssetManifest() {
    const urls = [];
    EXERCISES.forEach((ex) => { urls.push(ex.image); urls.push(ex.announce); });
    for (let i = 1; i <= MOTIVATION_LINES.length; i++) {
      urls.push(`audio/completion_${String(i).padStart(2, '0')}.wav`);
    }
    BG_TRACKS.forEach((t) => urls.push(t));
    COUNT_TRACKS.forEach((t) => urls.push(t));
    urls.push(REST_START_CUE, REST_READY_CUE);
    urls.push('icons/icon-192.png', 'icons/icon-512.png');
    return urls;
  }

  // Downloads every exercise image/voice line/music track into Cache Storage
  // up front, so the workout works with the WiFi off — not just whatever
  // happened to be viewed already. Only shows the preloader if there's
  // actually something missing; repeat visits skip straight past it.
  async function ensureOfflineReady() {
    if (!('caches' in window)) return;
    let cache;
    try {
      cache = await caches.open(CACHE_NAME);
    } catch (e) { return; }

    const urls = buildAssetManifest();
    const missing = [];
    for (const url of urls) {
      const hit = await cache.match(url).catch(() => null);
      if (!hit) missing.push(url);
    }
    if (missing.length === 0) return;

    preloaderEl.classList.add('is-active');
    let done = 0;
    const total = missing.length;
    const updateProgress = () => {
      preloaderFillEl.style.width = `${(done / total) * 100}%`;
      preloaderCountEl.textContent = `${done} / ${total}`;
    };
    updateProgress();

    let idx = 0;
    async function worker() {
      while (idx < missing.length) {
        const url = missing[idx++];
        try { await cache.add(url); } catch (e) { /* not on server yet — skip */ }
        done++;
        updateProgress();
      }
    }
    const CONCURRENCY = 5;
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, missing.length) }, worker));

    preloaderEl.classList.remove('is-active');
  }

  // ---------- Init ----------
  async function init() {
    iconSoundOn.style.display = isMuted ? 'none' : '';
    iconSoundOff.style.display = isMuted ? '' : 'none';
    iconMusicOn.style.display = isMusicMuted ? 'none' : '';
    iconMusicOff.style.display = isMusicMuted ? '' : 'none';

    exercises = EXERCISES;

    const count = exercises.length;
    document.getElementById('home-footnote').textContent =
      `${count} exercises · 1 minute each · ~${count} minutes`;
    document.getElementById('progress-of').textContent = `/${count}`;

    renderHome();
    showScreen('home');

    btnStart.addEventListener('click', startWorkout);
    btnPause.addEventListener('click', togglePause);
    btnMute.addEventListener('click', toggleMute);
    btnMusicMute.addEventListener('click', toggleMusicMute);
    btnDone.addEventListener('click', () => {
      renderHome();
      showScreen('home');
    });

    // Tap zones: right half of the screen = previous exercise, left half = next.
    screens.workout.addEventListener('click', (e) => {
      if (e.target.closest('.icon-btn')) return;
      const half = screens.workout.getBoundingClientRect().width / 2;
      if (e.clientX < half) {
        nextExercise();
      } else {
        prevExercise();
      }
    });

    // During a rep set (no countdown running), tapping the ring confirms
    // the set is done. Otherwise let the tap fall through to the normal
    // left/right skip zones above.
    timerRingWrapEl.addEventListener('click', (e) => {
      if (repsPhase === 'set') {
        e.stopPropagation();
        completeRepsSet();
      }
    });

    audioCount.addEventListener('ended', onCountAudioEnded);

    ensureOfflineReady();
  }

  init();
})();
