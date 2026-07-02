import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { TrendingUp, PackageCheck } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useLanguage } from '../context/LanguageContext'
import Button from '../components/ui/Button'
import SplitText from '../components/ui/SplitText'
import SoftAurora from '../components/effects/SoftAurora'

function FloatingCard({ icon: Icon, label, value, tone, className, delay = 0 }) {
  const toneClasses = {
    accent: 'bg-accent-soft text-accent',
    success: 'bg-success-soft text-success',
  }[tone]

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: [0, -10, 0] }}
      transition={{
        opacity: { duration: 0.6, delay },
        y: { duration: 5, repeat: Infinity, ease: 'easeInOut', delay: delay + 0.6 },
      }}
      className={`glass absolute flex items-center gap-3 rounded-2xl border border-border px-4 py-3 shadow-card-hover ${className}`}
    >
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${toneClasses}`}>
        <Icon size={16} strokeWidth={2.2} />
      </span>
      <div className="leading-tight">
        <div className="text-[11px] font-medium text-muted">{label}</div>
        <div className="text-headline text-[15px] font-semibold">{value}</div>
      </div>
    </motion.div>
  )
}

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { signIn } = useAuth()
  const { t } = useLanguage()
  const navigate = useNavigate()

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await signIn(email, password)
      navigate('/')
    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }

  return (
    <div className="grid min-h-screen grid-cols-1 bg-bg lg:grid-cols-2">
      {/* Left — brand panel. Same white canvas as the rest of the app,
          separated only by a hairline border and a whisper of color. */}
      <div className="relative hidden overflow-hidden border-r border-border lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="pointer-events-none absolute inset-0 -z-10">
          <SoftAurora
            speed={0.5}
            scale={1.6}
            brightness={0.55}
            color1="#0071E3"
            color2="#10B981"
            noiseFrequency={2.2}
            noiseAmplitude={0.9}
            bandHeight={0.55}
            bandSpread={0.9}
            octaveDecay={0.12}
            layerOffset={1.4}
            colorSpeed={0.6}
            enableMouseInteraction
            mouseInfluence={0.15}
          />
        </div>

        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent text-[17px] shadow-sm">
            📱
          </div>
          <span className="text-headline text-[16px] font-semibold">DR Telecom</span>
        </div>

        <div className="relative">
          <h2 className="text-headline max-w-sm text-[36px] font-semibold leading-[1.15]">
            <SplitText text="Smart inventory." as="span" className="block" />
            <SplitText text="Faster sales." as="span" className="block" delay={0.25} />
          </h2>
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.55, duration: 0.5 }}
            className="mt-4 max-w-sm text-[14px] leading-relaxed text-muted"
          >
            Everything your mobile store needs — stock, billing, and customers, in one
            place built for speed.
          </motion.p>

          {/* Floating proof points — restrained motion, on-brand data */}
          <div className="relative mt-16 h-[120px] w-full max-w-sm">
            <FloatingCard
              icon={PackageCheck}
              label="Inventory value"
              value="₹12.8L"
              tone="accent"
              className="left-0 top-0"
              delay={0.7}
            />
            <FloatingCard
              icon={TrendingUp}
              label="Today's sales"
              value="₹64,700"
              tone="success"
              className="left-16 top-16"
              delay={0.9}
            />
          </div>
        </div>

        <p className="relative text-[12px] text-muted">Powered by DR Telecom</p>
      </div>

      {/* Right — auth form */}
      <div className="flex items-center justify-center px-4 py-12">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          className="w-full max-w-[380px]"
        >
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent text-[17px]">
              📱
            </div>
            <span className="text-headline text-[16px] font-semibold">DR Telecom</span>
          </div>

          <h1 className="text-headline text-[24px] font-semibold">{t('login.title')}</h1>
          <p className="mt-1.5 text-[13.5px] text-muted">{t('login.subtitle')}</p>

          <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] font-medium text-muted">{t('login.email')}</label>
              <input
                type="email"
                autoFocus
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="rounded-xl border border-border bg-surface px-3.5 py-3 text-[13.5px] outline-none transition-all placeholder:text-muted focus:border-accent focus:ring-4 focus:ring-accent/10"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] font-medium text-muted">{t('login.password')}</label>
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="rounded-xl border border-border bg-surface px-3.5 py-3 text-[13.5px] outline-none transition-all placeholder:text-muted focus:border-accent focus:ring-4 focus:ring-accent/10"
              />
            </div>
            {error && <p className="text-[12.5px] text-danger">{error}</p>}
            <Button type="submit" className="btn-shine mt-2 w-full py-3" disabled={loading}>
              {loading ? t('login.signingIn') : t('login.signIn')}
            </Button>
          </form>

          <p className="mt-8 text-center text-[11.5px] text-muted lg:text-left">Powered by DR Telecom</p>
        </motion.div>
      </div>
    </div>
  )
}
