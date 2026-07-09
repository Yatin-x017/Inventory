import { useEffect, useRef, useState } from 'react'
import { animate } from 'framer-motion'

// A restrained "counting up" number — the one signature motion moment for
// hero stats. Ties to framer-motion (already a dependency) rather than a
// dedicated counter library. Defaults to the metric typeface (Space
// Grotesk, tabular figures) since this component only ever renders numbers.
export default function AnimatedNumber({ value, prefix = '', duration = 0.9, className = '', metric = true }) {
  const [display, setDisplay] = useState(0)
  const prev = useRef(0)

  useEffect(() => {
    const controls = animate(prev.current, value, {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setDisplay(v),
    })
    prev.current = value
    return () => controls.stop()
  }, [value, duration])

  return (
    <span className={`${metric ? 'text-metric' : ''} ${className}`}>
      {prefix}
      {Math.round(display).toLocaleString('en-IN')}
    </span>
  )
}
