import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { TrendingUp, PackageCheck } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useLanguage } from '../context/LanguageContext'
import Button from '../components/ui/Button'
import SplitText from '../components/ui/SplitText'
import SoftAurora from '../components/effects/SoftAurora'

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.9-2.26 5.36-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59A14.5 14.5 0 0 1 9.5 24c0-1.59.27-3.13.76-4.59l-7.98-6.19A23.94 23.94 0 0 0 0 24c0 3.87.92 7.53 2.56 10.78z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  )
}

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
  const [googleLoading, setGoogleLoading] = useState(false)
  const { signIn, signInWithGoogle, signOut } = useAuth()
  const { t } = useLanguage()
  const navigate = useNavigate()

  // ProtectedRoute sends Supabase-authenticated-but-no-`profiles`-row
  // sessions here (e.g. someone signed in with a Google account the owner
  // hasn't added as staff yet) with ?error=no-account. Sign them out so
  // they land on a clean login screen instead of bouncing in a loop.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('error') === 'no-account') {
      signOut()
      setError("That account isn't set up yet. Ask the owner to add you under Staff, then try again.")
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

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

  async function handleGoogleSignIn() {
    setError('')
    setGoogleLoading(true)
    try {
      await signInWithGoogle()
      // Browser redirects to Google from here; nothing else to do.
    } catch (err) {
      setError(err.message)
      setGoogleLoading(false)
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
          <span className="text-headline text-[16px] font-semibold">DR Telecommunication</span>
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

        <p className="relative text-[12px] text-muted">Powered by DR Telecommunication</p>
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
            <span className="text-headline text-[16px] font-semibold">DR Telecommunication</span>
          </div>

          <h1 className="text-headline text-[24px] font-semibold">{t('login.title')}</h1>
          <p className="mt-1.5 text-[13.5px] text-muted">{t('login.subtitle')}</p>

          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={googleLoading}
            className="mt-6 flex w-full items-center justify-center gap-2.5 rounded-xl border border-border bg-surface py-3 text-[13.5px] font-medium text-text transition-colors hover:border-accent/40 hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-60"
          >
            <GoogleIcon />
            {googleLoading ? t('login.signingIn') : t('login.continueWithGoogle')}
          </button>

          <div className="mt-5 flex items-center gap-3">
            <span className="h-px flex-1 bg-border" />
            <span className="text-[11.5px] uppercase tracking-wide text-muted">{t('login.orContinueWith')}</span>
            <span className="h-px flex-1 bg-border" />
          </div>

          <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-4">
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

          <p className="mt-8 text-center text-[11.5px] text-muted lg:text-left">Powered by DR Telecommunication</p>
        </motion.div>
      </div>
    </div>
  )
}
