export default function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-surface px-6 py-16 text-center animate-fade-in">
      {Icon && (
        <div className="relative mb-5 flex h-14 w-14 items-center justify-center">
          {/* Soft light bloom instead of a flat colored chip — a quiet
              glow reads as more premium than a solid accent square. */}
          <span className="absolute inset-0 rounded-full bg-accent-soft blur-md" />
          <span className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-soft text-accent">
            <Icon size={22} strokeWidth={1.8} />
          </span>
        </div>
      )}
      <p className="text-headline text-[15.5px]">{title}</p>
      {description && <p className="mt-1.5 max-w-sm text-[13px] leading-relaxed text-muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
