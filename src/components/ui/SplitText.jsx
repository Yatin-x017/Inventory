import { motion } from 'framer-motion'

// Word-by-word reveal, inspired by React Bits' SplitText — built on
// framer-motion (already a project dependency) instead of pulling in GSAP.
// Tuned to the app's 150–250ms motion language: quick per-word reveal,
// stagger fast enough that a full greeting still resolves in well under
// a second rather than lingering.
export default function SplitText({ text, as = 'span', className = '', delay = 0, stagger = 0.035 }) {
  const words = text.split(' ')
  const Tag = motion[as] ?? motion.span

  return (
    <Tag className={className} aria-label={text}>
      {words.map((word, i) => (
        <motion.span
          key={`${word}-${i}`}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.38, ease: [0.16, 1, 0.3, 1], delay: delay + i * stagger }}
          style={{ display: 'inline-block', marginRight: '0.28em' }}
        >
          {word}
        </motion.span>
      ))}
    </Tag>
  )
}
