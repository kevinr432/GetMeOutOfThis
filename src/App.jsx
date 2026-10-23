import { useCallback, useEffect, useRef, useState } from 'react'

// Bump by .001 with every update so you can tell the new version has loaded.
// const APP_VERSION = '1.001'
// const APP_VERSION = '1.002'
// const APP_VERSION = '1.003'
// const APP_VERSION = '1.004'
// const APP_VERSION = '1.005'
// const APP_VERSION = '1.006'
const APP_VERSION = '1.007'

const STORE_KEY = 'getmeoutofthis-settings'
const FACE_DOWN_BETA = 150 // |beta| above this angle = screen facing the table
const FACE_UP_BETA = 120 // |beta| below this angle = picked up / turned over
const SETTLE_MS = 1000 // position must hold this long before it counts

function loadSettings() {
  const defaults = { minutes: 5, callerName: 'Mom' }
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(STORE_KEY) || '{}') }
  } catch {
    return defaults
  }
}

function saveSettings(s) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(s))
  } catch {
    /* storage unavailable (private mode) - settings just won't persist */
  }
}

function formatTime(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

// // Classic North American ring: 440 Hz + 480 Hz together, 2 s on / 4 s off.
// // Cell-phone style ringtone: an original marimba-like melody that repeats with no long gaps.
// Classic telephone bell: a striker hammers two metal bells ~20 times a second, 2 s on / 4 s off.
// A ringtone file chosen by the user replaces the bell when one is set.
function createRinger(ctx) {
  let timer = null
  let oscillators = []

  // function burst() {
  //   const t = ctx.currentTime
  //   const gain = ctx.createGain()
  //   gain.connect(ctx.destination)
  //   gain.gain.setValueAtTime(0, t)
  //   gain.gain.linearRampToValueAtTime(0.3, t + 0.03)
  //   gain.gain.setValueAtTime(0.3, t + 1.95)
  //   gain.gain.linearRampToValueAtTime(0, t + 2)
  //   ;[440, 480].forEach((freq) => {
  //     const osc = ctx.createOscillator()
  //     osc.frequency.value = freq
  //     osc.connect(gain)
  //     osc.start(t)
  //     osc.stop(t + 2)
  //     oscillators.push(osc)
  //   })
  //   if (navigator.vibrate) navigator.vibrate([1000, 200, 800])
  // }

  // // One mallet hit: a sine at the note plus a quieter, faster-fading overtone at 4x, like a marimba bar.
  // function note(freq, when) {
  //   const parts = [
  //     { mult: 1, peak: 0.45, decay: 0.45 },
  //     { mult: 4, peak: 0.08, decay: 0.08 },
  //   ]
  //   parts.forEach(({ mult, peak, decay }) => {
  //     const osc = ctx.createOscillator()
  //     const g = ctx.createGain()
  //     osc.type = 'sine'
  //     osc.frequency.value = freq * mult
  //     g.gain.setValueAtTime(0.0001, when)
  //     g.gain.exponentialRampToValueAtTime(peak, when + 0.005)
  //     g.gain.exponentialRampToValueAtTime(0.0001, when + decay)
  //     osc.connect(g)
  //     g.connect(ctx.destination)
  //     osc.start(when)
  //     osc.stop(when + decay + 0.05)
  //     oscillators.push(osc)
  //   })
  // }

  // // E major arpeggio phrase, played twice with a different ending (seconds, Hz).
  // const MELODY = [
  //   [0.0, 1318.5], [0.15, 987.8], [0.3, 1318.5], [0.45, 830.6], [0.6, 987.8], [0.75, 1318.5],
  //   [1.05, 1318.5], [1.2, 987.8], [1.35, 1318.5], [1.5, 1108.7], [1.65, 987.8], [1.8, 830.6],
  // ]
  // const LOOP_MS = 2400

  // function burst() {
  //   const t = ctx.currentTime + 0.05
  //   oscillators = oscillators.slice(-60)
  //   MELODY.forEach(([offset, freq]) => note(freq, t + offset))
  //   if (navigator.vibrate) navigator.vibrate([400, 200, 400])
  // }

  // Inharmonic overtones of a small metal bell (frequency multiple, relative loudness).
  const BELL_PARTIALS = [
    [1, 1],
    [2.76, 0.5],
    [5.4, 0.25],
    [8.93, 0.12],
  ]
  const BELLS = [950, 1180] // two gongs, struck alternately
  const STRIKE_PERIOD = 0.05 // each bell is hit 20 times a second
  const RING_SECONDS = 2
  const RING_CYCLE_MS = 6000 // 2 s ringing + 4 s silence

  const master = ctx.createGain()
  master.gain.value = 0.8
  master.connect(ctx.destination)

  let customBuffer = null
  let customSource = null

  function bell(t) {
    BELLS.forEach((freq, i) => {
      const g = ctx.createGain()
      g.gain.setValueAtTime(0, t)
      g.connect(master)
      BELL_PARTIALS.forEach(([mult, amp]) => {
        const osc = ctx.createOscillator()
        const og = ctx.createGain()
        osc.frequency.value = freq * mult
        og.gain.value = amp
        osc.connect(og)
        og.connect(g)
        osc.start(t)
        osc.stop(t + RING_SECONDS + 0.4)
        oscillators.push(osc)
      })
      const strikes = Math.round(RING_SECONDS / STRIKE_PERIOD)
      for (let k = 0; k < strikes; k++) {
        const ts = t + k * STRIKE_PERIOD + i * (STRIKE_PERIOD / 2)
        g.gain.setValueAtTime(0.32, ts)
        g.gain.setTargetAtTime(0.02, ts, 0.018)
      }
      g.gain.setTargetAtTime(0, t + RING_SECONDS, 0.08) // ring-out after the last strike
    })
  }

  function burst() {
    const t = ctx.currentTime + 0.05
    oscillators = oscillators.slice(-32)
    bell(t)
    if (navigator.vibrate) navigator.vibrate([1000, 200, 800])
  }

  function playCustom() {
    customSource = ctx.createBufferSource()
    customSource.buffer = customBuffer
    customSource.loop = true
    customSource.connect(master)
    customSource.start()
  }


  return {
    start() {
      this.stop()
      ctx.resume()
      // burst()
      // timer = setInterval(burst, 6000)
      // timer = setInterval(burst, LOOP_MS)
      if (customBuffer) {
        playCustom()
      } else {
        burst()
        timer = setInterval(burst, RING_CYCLE_MS)
      }
    },
    setCustom(buffer) {
      customBuffer = buffer
    },
    stop() {
      clearInterval(timer)
      timer = null
      oscillators.forEach((o) => {
        try {
          o.stop()
        } catch {
          /* already stopped */
        }
      })
      oscillators = []
      if (customSource) {
        try {
          customSource.stop()
        } catch {
          /* already stopped */
        }
        customSource = null
      }
      if (navigator.vibrate) navigator.vibrate(0)
    },
  }
}

// ---------- saved ringtone file (IndexedDB - too big for localStorage) ----------
const DB_NAME = 'getmeoutofthis'
const DB_STORE = 'files'

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(DB_STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function dbRun(mode, fn) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, mode)
    const req = fn(tx.objectStore(DB_STORE))
    tx.oncomplete = () => resolve(req && req.result)
    tx.onerror = () => reject(tx.error)
  })
}

const loadTone = () => dbRun('readonly', (st) => st.get('ringtone')).catch(() => null)
const saveTone = (blob, name) => dbRun('readwrite', (st) => st.put({ blob, name }, 'ringtone'))
const clearTone = () => dbRun('readwrite', (st) => st.delete('ringtone'))

export default function App() {
  const [settings, setSettings] = useState(loadSettings)
  // phase: setup -> armed (waiting for face down) -> counting -> ringing
  // const [phase, setPhaseState] = useState('setup')
  const [phase, setPhaseState] = useState('home') // home = photo screen with the Help Me button
  const [remaining, setRemaining] = useState(0)
  const [beta, setBeta] = useState(null)
  const [error, setError] = useState('')
  const [wakeLockOn, setWakeLockOn] = useState(false)
  const [callSeconds, setCallSeconds] = useState(0)
  const [toneName, setToneName] = useState('') // '' = classic bell
  const [previewing, setPreviewing] = useState(false)
  const toneBlobRef = useRef(null)
  const fileInputRef = useRef(null)
  const callStartRef = useRef(0)

  // const phaseRef = useRef('setup')
  const phaseRef = useRef('home')
  const settingsRef = useRef(settings)
  const deadlineRef = useRef(0)
  const posRef = useRef({ stable: 'up', candidate: 'up', since: 0 })
  const lastBetaUpdate = useRef(0)
  const audioCtxRef = useRef(null)
  const ringerRef = useRef(null)
  const wakeLockRef = useRef(null)

  const setPhase = useCallback((p) => {
    phaseRef.current = p
    setPhaseState(p)
  }, [])

  useEffect(() => {
    settingsRef.current = settings
    saveSettings(settings)
  }, [settings])

  // ---------- decoy colors: tint the page and Safari's bars to match the wallpaper ----------
  useEffect(() => {
    const decoy = phase === 'armed' || phase === 'counting'
    const color = decoy ? 'rgb(214, 210, 177)' : ''
    document.documentElement.style.background = color
    document.body.style.background = color
    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta) meta.setAttribute('content', decoy ? '#d6d2b1' : '#0b0d10')
  }, [phase])

  // ---------- wake lock (keeps the screen and timer alive while face down) ----------
  const requestWakeLock = useCallback(async () => {
    try {
      if ('wakeLock' in navigator) {
        wakeLockRef.current = await navigator.wakeLock.request('screen')
        setWakeLockOn(true)
        wakeLockRef.current.addEventListener('release', () => setWakeLockOn(false))
      }
    } catch {
      setWakeLockOn(false)
    }
  }, [])

  useEffect(() => {
    const onVisible = () => {
      // if (document.visibilityState === 'visible' && phaseRef.current !== 'setup') requestWakeLock()
      if (document.visibilityState === 'visible' && phaseRef.current !== 'setup' && phaseRef.current !== 'home') requestWakeLock()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [requestWakeLock])

  // ---------- ringing ----------
  const startRinging = useCallback(() => {
    setPhase('ringing')
    ringerRef.current?.start()
  }, [setPhase])

  const stopRinging = useCallback(() => {
    ringerRef.current?.stop()
  }, [])

  // ---------- position changes ----------
  const onPositionChange = useCallback(
    (pos) => {
      const p = phaseRef.current
      if (p === 'armed' && pos === 'down') {
        deadlineRef.current = Date.now() + Number(settingsRef.current.minutes) * 60000
        setRemaining(deadlineRef.current - Date.now())
        setPhase('counting')
      } else if (p === 'counting' && pos === 'up') {
        // Picked up before time ran out - cancel and wait for the next face-down.
        setPhase('armed')
      }
    },
    [setPhase],
  )

  const onOrientation = useCallback(
    (e) => {
      if (e.beta == null) return
      const now = Date.now()
      if (now - lastBetaUpdate.current > 250) {
        lastBetaUpdate.current = now
        setBeta(Math.round(e.beta))
      }
      const b = Math.abs(e.beta)
      const st = posRef.current
      const pos = b > FACE_DOWN_BETA ? 'down' : b < FACE_UP_BETA ? 'up' : st.candidate
      if (pos !== st.candidate) {
        st.candidate = pos
        st.since = now
      } else if (pos !== st.stable && now - st.since >= SETTLE_MS) {
        st.stable = pos
        onPositionChange(pos)
      }
    },
    [onPositionChange],
  )

  // ---------- countdown tick ----------
  useEffect(() => {
    if (phase !== 'counting') return
    const id = setInterval(() => {
      const left = deadlineRef.current - Date.now()
      setRemaining(left)
      if (left <= 0) startRinging()
    }, 500)
    return () => clearInterval(id)
  }, [phase, startRinging])

  // ---------- fake call-in-progress timer ----------
  useEffect(() => {
    if (phase !== 'incall') return
    const id = setInterval(() => setCallSeconds(Math.floor((Date.now() - callStartRef.current) / 1000)), 1000)
    return () => clearInterval(id)
  }, [phase])

  // ---------- ringtone file ----------
  useEffect(() => {
    loadTone().then((saved) => {
      if (saved && saved.blob) {
        toneBlobRef.current = saved.blob
        setToneName(saved.name || 'Custom ringtone')
      }
    })
  }, [])

  // Decode a sound file into the ringer. Returns false if the phone can't play it.
  const applyToneBlob = useCallback(async (blob) => {
    const ctx = audioCtxRef.current
    if (!ctx || !blob) return false
    try {
      const buffer = await ctx.decodeAudioData(await blob.arrayBuffer())
      ringerRef.current.setCustom(buffer)
      return true
    } catch {
      return false
    }
  }, [])

  // ---------- arm / disarm ----------
  const unlockAudio = useCallback(() => {
    if (!audioCtxRef.current) {
      const Ctx = window.AudioContext || window.webkitAudioContext
      audioCtxRef.current = new Ctx()
      ringerRef.current = createRinger(audioCtxRef.current)
      if (toneBlobRef.current) applyToneBlob(toneBlobRef.current)
    }
    // Ask iOS to play through the speaker even when the ring/silent switch is on silent.
    try {
      if (navigator.audioSession) navigator.audioSession.type = 'playback'
    } catch {
      /* not supported */
    }
    audioCtxRef.current.resume()
  }, [applyToneBlob])

  const stopPreview = () => {
    if (previewing) ringerRef.current?.stop()
    setPreviewing(false)
  }

  const togglePreview = () => {
    if (previewing) {
      stopPreview()
      return
    }
    unlockAudio()
    ringerRef.current.start()
    setPreviewing(true)
  }

  const onToneChosen = async (e) => {
    const file = e.target.files && e.target.files[0]
    e.target.value = ''
    if (!file) return
    setError('')
    stopPreview()
    unlockAudio()
    const ok = await applyToneBlob(file)
    if (!ok) {
      setError(`"${file.name}" couldn't be played. Try an MP3 or M4A file.`)
      return
    }
    toneBlobRef.current = file
    setToneName(file.name)
    try {
      await saveTone(file, file.name)
    } catch {
      setError('Ringtone will work now but could not be saved for next time.')
    }
  }

  const useClassicBell = async () => {
    stopPreview()
    toneBlobRef.current = null
    ringerRef.current?.setCustom(null)
    setToneName('')
    try {
      await clearTone()
    } catch {
      /* ignore */
    }
  }

  const arm = async () => {
    setError('')
    if (!(Number(settings.minutes) > 0)) {
      setError('Enter how many minutes to wait.')
      return
    }

    // Must happen inside the tap so iOS lets us make sound later.
    stopPreview()
    unlockAudio()

    if (typeof DeviceOrientationEvent === 'undefined') {
      setError('This device has no motion sensors. Use "Simulate face down" to test.')
    } else if (typeof DeviceOrientationEvent.requestPermission === 'function') {
      try {
        const res = await DeviceOrientationEvent.requestPermission()
        if (res !== 'granted') {
          setError('Motion access was denied. In Safari, tap aA > Website Settings and allow Motion & Orientation, then try again.')
          return
        }
      } catch {
        setError('Could not get motion access. Make sure the page is opened over https.')
        return
      }
    }

    posRef.current = { stable: 'up', candidate: 'up', since: Date.now() }
    window.addEventListener('deviceorientation', onOrientation)
    requestWakeLock()
    setPhase('armed')
  }

  const disarm = useCallback(() => {
    window.removeEventListener('deviceorientation', onOrientation)
    stopRinging()
    try {
      wakeLockRef.current?.release()
    } catch {
      /* ignore */
    }
    wakeLockRef.current = null
    setBeta(null)
    setPhase('setup')
  }, [onOrientation, stopRinging, setPhase])

  useEffect(() => () => window.removeEventListener('deviceorientation', onOrientation), [onOrientation])

  const decline = () => {
    stopRinging()
    posRef.current = { stable: 'up', candidate: 'up', since: Date.now() }
    setPhase('armed')
  }

  const answer = () => {
    stopRinging()
    callStartRef.current = Date.now()
    setCallSeconds(0)
    setPhase('incall')
  }

  const endCall = () => {
    posRef.current = { stable: 'up', candidate: 'up', since: Date.now() }
    setPhase('armed')
  }

  const testRing = () => {
    unlockAudio()
    startRinging()
  }

  const simulateFaceDown = () => onPositionChange('down')

  const callerLabel = settings.callerName.trim() || 'Unknown'

  // ---------- screens ----------
  if (phase === 'home') {
    return (
      <div className="home-screen">
        <img className="home-photo" src="/hero.jpg" alt="A man talking excitedly on a date while the woman looks bored" />
        <div className="home-bottom">
          <button className="help-me" onClick={() => setPhase('setup')}>
            {/* Help Me */}
            Get Me Out of This
          </button>
          <div className="version">Version {APP_VERSION}</div>
        </div>
      </div>
    )
  }

  if (phase === 'ringing') {
    return (
      <div className="call-screen">
        <div className="call-top">
          <div className="call-avatar">{(settings.callerName.trim()[0] || '').toUpperCase() || <PersonIcon />}</div>
          <div className="call-name">{callerLabel}</div>
          <div className="call-sub">mobile</div>
        </div>

        <div className="call-bottom">
          <div className="call-extras">
            <div className="call-extra">
              <AlarmIcon />
              <span>Remind Me</span>
            </div>
            <div className="call-extra">
              <MessageIcon />
              <span>Message</span>
            </div>
          </div>
          <div className="call-buttons">
            <button className="call-btn decline" onClick={decline} aria-label="Decline">
              <PhoneIcon rotate />
              <span>Decline</span>
            </button>
            <button className="call-btn accept" onClick={answer} aria-label="Accept">
              <PhoneIcon />
              <span>Accept</span>
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (phase === 'incall') {
    return (
      <div className="call-screen">
        <div className="call-top">
          <div className="call-avatar">{(settings.callerName.trim()[0] || '').toUpperCase() || <PersonIcon />}</div>
          <div className="call-name">{callerLabel}</div>
          <div className="call-sub">{formatTime(callSeconds * 1000)}</div>
        </div>
        <div className="call-bottom">
          <div className="call-buttons center">
            <button className="call-btn decline" onClick={endCall} aria-label="End call">
              <PhoneIcon rotate />
              <span>End</span>
            </button>
          </div>
        </div>
      </div>
    )
  }

  // While armed or counting, look like an ordinary iPhone home screen.
  // A faint "Stop" pill sits in the empty space right of the last app row.
  if (phase === 'armed' || phase === 'counting') {
    return (
      <div className="decoy-screen">
        <img className="decoy-backdrop" src="/decoy-home.jpg" alt="" draggable="false" />
        <div className="decoy-frame">
          <img className="decoy-photo" src="/decoy-home.jpg" alt="" draggable="false" />
          {/* <button className="decoy-stop" onClick={disarm} aria-label="Stop"> */}
          {/*   Stop */}
          {/* </button> */}
          <button className="decoy-stop" onClick={disarm} aria-label="Stop">
            <span className="decoy-stop-icon" />
            <span className="decoy-stop-label">Stop</span>
          </button>
        </div>
      </div>
    )
  }

  // Previous armed/counting status screen - no longer shown, kept for reference.
  // if (phase === 'armed' || phase === 'counting') {
  if (false && (phase === 'armed' || phase === 'counting')) {
    return (
      <div className="app">
        <h1>GetMeOutOfThis</h1>
        {phase === 'armed' ? (
          <div className="status-card">
            <div className="status-big">Ready</div>
            <p>Place the phone face down. After {settings.minutes} min it will ring.</p>
          </div>
        ) : (
          <div className="status-card counting">
            <div className="status-big">{formatTime(remaining)}</div>
            <p>Face down. Ringing when this reaches 0:00. Pick the phone up to cancel.</p>
          </div>
        )}

        <div className="meta">
          <div>Caller shown: {callerLabel}</div>
          <div>Tilt: {beta == null ? 'no sensor data yet' : `${beta}°`} · Screen lock: {wakeLockOn ? 'kept awake' : 'not held'}</div>
          <div>Keep this page open, sound up, and the phone unlocked.</div>
        </div>

        {error && <div className="error">{error}</div>}

        <div className="row">
          {phase === 'armed' && (
            <button className="secondary" onClick={simulateFaceDown}>
              Simulate face down
            </button>
          )}
          <button className="secondary" onClick={testRing}>
            Test ring now
          </button>
        </div>
        <button className="stop" onClick={disarm}>
          Stop
        </button>
        <div className="version">Version {APP_VERSION}</div>
      </div>
    )
  }

  return (
    <div className="app">
      <button className="link back" onClick={() => setPhase('home')}>
        ‹ Back
      </button>
      <h1>GetMeOutOfThis</h1>
      {/* <img className="hero" src="/hero.jpg" alt="A man talking excitedly on a date while the woman looks bored" /> */}
      <p className="lede">Set it, flip your phone face down, and it will ring with a fake incoming call when you need an exit.</p>

      <label>
        Ring after (minutes) face down
        <input
          type="number"
          inputMode="decimal"
          min="0.5"
          step="0.5"
          value={settings.minutes}
          onChange={(e) => setSettings({ ...settings, minutes: e.target.value })}
        />
      </label>

      <label>
        Caller name shown when it rings
        <input
          type="text"
          placeholder="Mom"
          value={settings.callerName}
          onChange={(e) => setSettings({ ...settings, callerName: e.target.value })}
        />
      </label>

      <div className="tone">
        <div className="tone-label">Ringtone</div>
        <div className="tone-name">{toneName || 'Classic phone bell'}</div>
        <div className="row">
          <button className="secondary" onClick={() => fileInputRef.current.click()}>
            Choose ringtone file
          </button>
          <button className="secondary" onClick={togglePreview}>
            {previewing ? 'Stop preview' : 'Preview'}
          </button>
        </div>
        {toneName && (
          <button className="link" onClick={useClassicBell}>
            Use classic phone bell instead
          </button>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*,.mp3,.m4a,.m4r,.wav,.aac"
          onChange={onToneChosen}
          hidden
        />
      </div>

      {error && <div className="error">{error}</div>}

      <button className="primary" onClick={arm}>
        Start
      </button>
      <div className="version">Version {APP_VERSION}</div>
    </div>
  )
}

function PhoneIcon({ rotate }) {
  return (
    <svg viewBox="0 0 24 24" width="34" height="34" style={rotate ? { transform: 'rotate(135deg)' } : undefined}>
      <path
        fill="currentColor"
        d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1A17 17 0 0 1 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1z"
      />
    </svg>
  )
}

function PersonIcon() {
  return (
    <svg viewBox="0 0 24 24" width="56" height="56">
      <path fill="currentColor" d="M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9zm0 2.2c-4.3 0-8 2.2-8 5V21h16v-1.8c0-2.8-3.7-5-8-5z" />
    </svg>
  )
}

function AlarmIcon() {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26">
      <path fill="none" stroke="currentColor" strokeWidth="1.8" d="M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM12 9v4l2.5 2M4 5l3-2M20 5l-3-2" />
    </svg>
  )
}

function MessageIcon() {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26">
      <path fill="none" stroke="currentColor" strokeWidth="1.8" d="M4 5h16v11H9l-5 4z" />
    </svg>
  )
}
