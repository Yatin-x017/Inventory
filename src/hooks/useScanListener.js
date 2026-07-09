import { useEffect, useRef } from 'react'

// Barcode/HID scanners "type" into the page by firing keydown events only a
// few milliseconds apart, then send Enter. A human never types a 4+
// character code that consistently fast, so a tight inter-key gap is a
// reliable signal that a scanner (not a person) produced the keystrokes.
const MAX_KEY_INTERVAL_MS = 40
const MIN_SCAN_LENGTH = 4

function isEditableElement(el) {
  if (!el) return false
  const tag = el.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (el.isContentEditable) return true
  return false
}

function makeBuffer() {
  return { chars: [], times: [] }
}

function isBurst(buf) {
  if (buf.chars.length < MIN_SCAN_LENGTH) return false
  let totalGap = 0
  for (let i = 1; i < buf.times.length; i++) totalGap += buf.times[i] - buf.times[i - 1]
  const avgGap = totalGap / (buf.times.length - 1)
  return avgGap <= MAX_KEY_INTERVAL_MS
}

/**
 * Listens on `window` for the fast burst-typing + Enter pattern that marks a
 * barcode scan, from anywhere in the app. Skips handling entirely while
 * focus is already inside an input/textarea/select/contenteditable so it
 * never fights with normal typing in forms — those fields can run their own
 * scoped detector (see `useScanKeyHandler`) if they need scan awareness too.
 *
 * `onScan(code)` fires once, with the scanned string, the moment a burst is
 * confirmed by Enter.
 */
export function useGlobalScanListener(onScan, { enabled = true } = {}) {
  const bufferRef = useRef(makeBuffer())
  const onScanRef = useRef(onScan)
  onScanRef.current = onScan

  useEffect(() => {
    if (!enabled) return

    function reset() {
      bufferRef.current = makeBuffer()
    }

    function handleKeyDown(e) {
      if (isEditableElement(document.activeElement)) {
        reset()
        return
      }
      if (e.ctrlKey || e.metaKey || e.altKey) {
        reset()
        return
      }

      const buf = bufferRef.current
      const now = performance.now()

      if (e.key === 'Enter') {
        if (isBurst(buf)) {
          e.preventDefault()
          onScanRef.current(buf.chars.join(''))
        }
        reset()
        return
      }

      if (e.key.length !== 1) return // ignore Shift, Tab, arrows, etc.

      if (buf.times.length > 0 && now - buf.times[buf.times.length - 1] > MAX_KEY_INTERVAL_MS) {
        reset()
      }
      buf.chars.push(e.key)
      buf.times.push(now)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [enabled])
}

/**
 * Same burst-detection logic, scoped to a single input via its onKeyDown.
 * Unlike the global listener this doesn't check `document.activeElement`
 * (the input receiving the events *is* the target), so it's safe to attach
 * to a search box that also accepts normal manual typing — genuine human
 * typing simply never satisfies the burst timing, so `onScan` only fires
 * for real scans.
 */
export function useScanKeyHandler(onScan) {
  const bufferRef = useRef(makeBuffer())
  const onScanRef = useRef(onScan)
  onScanRef.current = onScan

  return function onKeyDown(e) {
    const buf = bufferRef.current
    const now = performance.now()

    if (e.key === 'Enter') {
      if (isBurst(buf)) onScanRef.current(buf.chars.join(''))
      bufferRef.current = makeBuffer()
      return
    }

    if (e.key.length !== 1) return

    if (buf.times.length > 0 && now - buf.times[buf.times.length - 1] > MAX_KEY_INTERVAL_MS) {
      bufferRef.current = makeBuffer()
    }
    bufferRef.current.chars.push(e.key)
    bufferRef.current.times.push(now)
  }
}
