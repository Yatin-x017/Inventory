import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts'

const PALETTE = ['#0071E3', '#10B981', '#F97316', '#8B5CF6', '#06B6D4', '#EC4899', '#EF4444', '#84CC16']

function ChartTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const p = payload[0]
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2 text-[12px] shadow-card-hover">
      <div className="font-medium">{p.name}</div>
      <div className="text-muted">{p.value} item{p.value === 1 ? '' : 's'}</div>
    </div>
  )
}

export function CategoryPieChart({ data }) {
  if (!data.length) return null
  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          innerRadius={56}
          outerRadius={84}
          paddingAngle={2}
          strokeWidth={0}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
          ))}
        </Pie>
        <Tooltip content={<ChartTooltip />} />
      </PieChart>
    </ResponsiveContainer>
  )
}

export function LocationBarChart({ data }) {
  if (!data.length) return null
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} barSize={28}>
        <CartesianGrid vertical={false} stroke="var(--chart-grid, #e2e8f0)" strokeDasharray="3 3" />
        <XAxis
          dataKey="name"
          axisLine={false}
          tickLine={false}
          tick={{ fontSize: 12, fill: '#64748b' }}
        />
        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} allowDecimals={false} />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(0,113,227,0.06)' }} />
        <Bar dataKey="value" name="Items" fill="#0071E3" radius={[6, 6, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
