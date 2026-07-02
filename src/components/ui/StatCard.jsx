export default function StatCard({ icon: Icon, label, value, hint, tone = 'accent', className = '' }) {
  const toneClasses = {
    accent: 'bg-accent-soft text-accent',
    success: 'bg-success-soft text-success',
    warning: 'bg-warning-soft text-warning',
    danger: 'bg-danger-soft text-danger',
  }[tone]

  return (
    <div
      className={`group glass rounded-2xl border border-border p-3.5 shadow-card transition-all duration-200 hover:-translate-y-1 hover:shadow-card-hover sm:p-5 ${className}`}
    >
      <div className="flex items-center justify-between">
        <span className="truncate text-[12px] font-medium text-muted sm:text-[13px]">{label}</span>
        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg sm:h-9 sm:w-9 sm:rounded-xl ${toneClasses}`}>
          <Icon size={14} strokeWidth={2.2} className="sm:hidden" />
          <Icon size={16} strokeWidth={2.2} className="hidden sm:block" />
        </span>
      </div>
      <div className="text-headline mt-2 truncate text-[21px] font-semibold leading-none sm:mt-3 sm:text-[27px]">
        {value}
      </div>
      {hint && <div className="mt-1.5 truncate text-[11.5px] text-muted sm:mt-2 sm:whitespace-normal sm:text-[12.5px]">{hint}</div>}
    </div>
  )
}
