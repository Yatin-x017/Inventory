const VARIANTS = {
  primary: 'bg-accent text-white shadow-sm hover:brightness-110',
  secondary: 'bg-surface border border-border text-text hover:border-accent/40 hover:text-accent',
  ghost: 'bg-transparent border border-border text-muted hover:text-text hover:border-text/30',
  danger: 'bg-transparent border border-border text-muted hover:text-danger hover:border-danger/50',
}

export default function Button({
  children,
  variant = 'primary',
  className = '',
  type = 'button',
  ...props
}) {
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-medium tracking-tight transition-all duration-150 active:scale-[0.97] hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:active:scale-100 ${VARIANTS[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}
