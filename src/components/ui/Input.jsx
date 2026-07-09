import { forwardRef } from 'react'

const SIZES = {
  md: 'h-12 text-[13.5px]',
  lg: 'h-14 text-[14.5px]',
}

// The one input style for the whole app. Every modal currently hand-rolls
// its own `inputClass` string — this is the primitive that replaces them,
// wired in one form at a time in a later batch so nothing breaks mid-way.
//
// `label` and `error` are optional so this also works for bare, unlabeled
// fields (e.g. inline search bars).
const Input = forwardRef(function Input(
  { label, icon: Icon, error, size = 'md', className = '', containerClassName = '', ...props },
  ref
) {
  return (
    <label className={`flex flex-col gap-1.5 ${containerClassName}`}>
      {label && (
        <span className="text-[11.5px] font-semibold uppercase tracking-wide text-muted">{label}</span>
      )}
      <div
        className={[
          'group relative flex items-center rounded-2xl border bg-bg/70 backdrop-blur-sm transition-all duration-200',
          'focus-within:border-accent focus-within:bg-surface focus-within:ring-4 focus-within:ring-accent/15',
          error ? 'border-danger' : 'border-border',
          SIZES[size],
        ].join(' ')}
      >
        {Icon && (
          <Icon
            size={16}
            strokeWidth={2}
            className="ml-4 shrink-0 text-muted transition-colors group-focus-within:text-accent"
          />
        )}
        <input
          ref={ref}
          className={[
            'w-full flex-1 bg-transparent text-text outline-none placeholder:text-muted',
            'disabled:cursor-not-allowed disabled:opacity-50',
            Icon ? 'pl-2.5 pr-4' : 'px-4',
            className,
          ].join(' ')}
          {...props}
        />
      </div>
      {error && <span className="text-[11.5px] font-medium text-danger">{error}</span>}
    </label>
  )
})

export default Input
