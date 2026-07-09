// One button, four variants, three sizes — the whole app draws from this
// single primitive so "button" never has to be reinvented per screen.
const VARIANTS = {
  primary:
    'bg-gradient-to-b from-accent to-[#1d4ed8] text-white shadow-button hover:shadow-button-hover hover:brightness-[1.04]',
  secondary:
    'bg-surface border border-border text-text shadow-card hover:border-accent/40 hover:text-accent',
  ghost:
    'bg-transparent border border-transparent text-muted hover:bg-accent-soft hover:text-accent',
  danger:
    'bg-transparent border border-border text-muted hover:border-danger/40 hover:bg-danger-soft hover:text-danger',
}

const SIZES = {
  sm: 'h-9 px-3.5 text-[12.5px] gap-1.5',
  md: 'h-11 px-5 text-[13.5px] gap-2',
  lg: 'h-12 px-6 text-[14.5px] gap-2',
}

export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  icon: Icon,
  iconPosition = 'trailing',
  className = '',
  type = 'button',
  ...props
}) {
  return (
    <button
      type={type}
      className={[
        'btn-shine inline-flex shrink-0 items-center justify-center rounded-full font-semibold tracking-tight',
        'transition-all duration-200 ease-out active:scale-[0.97] hover:-translate-y-px',
        'disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:active:scale-100 disabled:shadow-none',
        VARIANTS[variant],
        SIZES[size],
        className,
      ].join(' ')}
      {...props}
    >
      {Icon && iconPosition === 'leading' && <Icon size={size === 'sm' ? 14 : 15} strokeWidth={2.3} />}
      {children}
      {Icon && iconPosition === 'trailing' && (
        <Icon
          size={size === 'sm' ? 14 : 15}
          strokeWidth={2.3}
          className="transition-transform duration-200 group-hover:translate-x-0.5"
        />
      )}
    </button>
  )
}
