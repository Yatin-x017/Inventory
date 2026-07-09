const TONE_CHIP = {
  accent: 'bg-accent-soft text-accent',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
}

const TONE_BAR = {
  accent: 'bg-accent',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
}

export default function StatCard({ icon: Icon, label, value, hint, tone = 'accent', className = '' }) {
  return (
    <div
      className={`group relative overflow-hidden glass rounded-2xl border border-border p-3.5 shadow-card transition-all duration-200 hover:-translate-y-1 hover:shadow-card-hover sm:p-5 ${className}`}
    >
      {/* Slim tone bar — quiet color-coding instead of a colorful card;
          this is what makes a strip of 8 stats scannable at a glance. */}
      <span className={`absolute inset-x-0 top-0 h-[3px] ${TONE_BAR[tone]}`} />

      <div className="flex items-center justify-between">
        <span className="truncate text-[12px] font-medium text-muted sm:text-[13px]">{label}</span>
        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg sm:h-9 sm:w-9 sm:rounded-xl ${TONE_CHIP[tone]}`}>
          <Icon size={14} strokeWidth={2.2} className="sm:hidden" />
          <Icon size={16} strokeWidth={2.2} className="hidden sm:block" />
        </span>
      </div>
      <div className="text-metric mt-2 truncate text-[21px] leading-none sm:mt-3 sm:text-[27px]">
        {value}
      </div>
      {hint && (
        <div className="mt-1.5 truncate text-[11.5px] text-muted sm:mt-2 sm:whitespace-normal sm:text-[12.5px]">
          {hint}
        </div>
      )}
    </div>
  )
}
