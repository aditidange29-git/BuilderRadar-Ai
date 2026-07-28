import React from 'react'

/**
 * Hero receives:
 *   count   — number of enriched opportunities, or null while loading
 *   loading — true while the first API fetch is in flight
 *
 * Stat display rules:
 *   loading          → '—'   (dash, data is on its way)
 *   loaded, count=0  → 'Coming soon'
 *   loaded, count>0  → actual number
 */
export default function Hero({ count, loading }) {
  const opportunityValue = loading
    ? '—'
    : (count === 0 ? 'Coming soon' : String(count))

  return (
    <section style={styles.hero} aria-labelledby="hero-heading">
      {/* Background grid pattern */}
      <div style={styles.bgGrid} aria-hidden="true" />
      {/* Glow orbs */}
      <div style={{...styles.orb, ...styles.orb1}} aria-hidden="true" />
      <div style={{...styles.orb, ...styles.orb2}} aria-hidden="true" />

      <div style={styles.inner}>
        {/* Badge */}
        <div style={styles.badge}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="#FF9900" aria-hidden="true">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
          </svg>
          <span>AWS Bedrock AgentCore Runtime</span>
        </div>

        <h1 id="hero-heading" style={styles.heading}>
          Discover Your Next
          <span style={styles.headingAccent}> Big Opportunity</span>
        </h1>

        {/* Subheading — describes the actual pipeline, not just "AI-powered" */}
        <p style={styles.subheading}>
          Every 12 hours, two Lambda scrapers pull the newest hackathons from Devpost and Unstop,
          deduplicate by SHA-256 hash, then hand off only genuinely new listings to a Strands agent
          on Bedrock AgentCore — which classifies, extracts deadlines, and writes a one-sentence
          relevance explanation tailored to your profile. No manual curation, no noise.
        </p>

        {/* Stats row — values derived from live API data */}
        <div style={styles.stats} role="list">
          <Stat
            value={opportunityValue}
            label="Opportunities"
            compact={opportunityValue === 'Coming soon'}
          />
          <Stat value="2×"     label="Daily Scrapes" />
          <Stat value="4"      label="Categories" />
          <Stat value="~$0.10" label="/ Month" />
        </div>

        <div style={styles.actions}>
          <a href="#opportunities" style={styles.btnPrimary}>
            Browse Opportunities
          </a>
          <a href="#how-it-works" style={styles.btnSecondary}>
            How It Works
          </a>
        </div>
      </div>
    </section>
  )
}

function Stat({ value, label, compact }) {
  return (
    <div style={styles.stat}>
      <span style={{ ...styles.statValue, ...(compact ? styles.statValueCompact : {}) }}>
        {value}
      </span>
      <span style={styles.statLabel}>{label}</span>
    </div>
  )
}

const styles = {
  hero: {
    position: 'relative',
    overflow: 'hidden',
    padding: '96px 24px 80px',
    textAlign: 'center',
  },
  bgGrid: {
    position: 'absolute',
    inset: 0,
    backgroundImage: `
      linear-gradient(rgba(255,153,0,0.03) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255,153,0,0.03) 1px, transparent 1px)
    `,
    backgroundSize: '48px 48px',
    pointerEvents: 'none',
  },
  orb: {
    position: 'absolute',
    borderRadius: '50%',
    filter: 'blur(80px)',
    pointerEvents: 'none',
  },
  orb1: {
    width: 500,
    height: 500,
    background: 'rgba(255,153,0,0.06)',
    top: -100,
    left: '50%',
    transform: 'translateX(-60%)',
  },
  orb2: {
    width: 300,
    height: 300,
    background: 'rgba(77,166,255,0.07)',
    bottom: -50,
    right: '15%',
  },
  inner: {
    position: 'relative',
    maxWidth: 760,
    margin: '0 auto',
  },
  badge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 16px',
    background: 'rgba(255,153,0,0.08)',
    border: '1px solid rgba(255,153,0,0.25)',
    borderRadius: 20,
    fontSize: 12,
    fontWeight: 600,
    color: '#FF9900',
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    marginBottom: 28,
  },
  heading: {
    fontSize: 'clamp(2rem, 5vw, 3.25rem)',
    fontWeight: 800,
    lineHeight: 1.15,
    letterSpacing: '-0.02em',
    color: '#e8edf5',
    marginBottom: 20,
  },
  headingAccent: {
    color: '#FF9900',
    display: 'block',
  },
  subheading: {
    fontSize: 17,
    color: '#8fa3c0',
    lineHeight: 1.7,
    maxWidth: 600,
    margin: '0 auto 40px',
  },
  stats: {
    display: 'flex',
    justifyContent: 'center',
    gap: 40,
    flexWrap: 'wrap',
    marginBottom: 40,
  },
  stat: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
  },
  statValue: {
    fontSize: 28,
    fontWeight: 800,
    color: '#FF9900',
    letterSpacing: '-0.02em',
  },
  // Shrink font when "Coming soon" needs to fit in the same box
  statValueCompact: {
    fontSize: 14,
    letterSpacing: '0',
    fontWeight: 600,
    paddingTop: 6,
  },
  statLabel: {
    fontSize: 12,
    color: '#4d6280',
    fontWeight: 500,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
  },
  actions: {
    display: 'flex',
    gap: 12,
    justifyContent: 'center',
    flexWrap: 'wrap',
  },
  btnPrimary: {
    display: 'inline-block',
    padding: '12px 28px',
    background: '#FF9900',
    color: '#0a0e1a',
    borderRadius: 10,
    textDecoration: 'none',
    fontWeight: 700,
    fontSize: 15,
    transition: 'all 0.2s ease',
    letterSpacing: '-0.01em',
  },
  btnSecondary: {
    display: 'inline-block',
    padding: '12px 28px',
    background: 'transparent',
    color: '#8fa3c0',
    borderRadius: 10,
    textDecoration: 'none',
    fontWeight: 600,
    fontSize: 15,
    border: '1px solid #1e2d4a',
    transition: 'all 0.2s ease',
  },
}
