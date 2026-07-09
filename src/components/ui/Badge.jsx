const TONES = {
  neutral: 'bg-bg text-muted ring-1 ring-inset ring-border',
  accent: 'bg-accent-soft text-accent',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
}

const DOT_TONES = {
  neutral: 'bg-muted',
  accent: 'bg-accent',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
}

// `dot` renders a small status indicator ahead of the label — the Linear-
// style pattern for "this badge represents a state", as opposed to a plain
// label chip. Optional so existing call sites don't need to change.
export default function Badge({ children, tone = 'neutral', dot = false, className = '' }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-semibold capitalize leading-none ${TONES[tone]} ${className}`}
    >
      {dot && <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${DOT_TONES[tone]}`} />}
      {children}
    </span>
  )
}
