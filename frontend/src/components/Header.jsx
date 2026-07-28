import React from 'react'

export default function Header() {
  return (
    <header style={styles.header}>
      {/* Top bar */}
      <div style={styles.topBar}>
        <div style={styles.topBarInner}>
          <span style={styles.topBarText}>Powered by AWS Bedrock AgentCore + Strands</span>
          <span style={styles.topBarBadge}>
            <span style={styles.dot} aria-hidden="true" />
            Live
          </span>
        </div>
      </div>

      {/* Main nav */}
      <nav style={styles.nav} role="navigation" aria-label="Main navigation">
        <div style={styles.navInner}>
          {/* Logo */}
          <a href="/" style={styles.logo} aria-label="BuilderRadar AI home">
            <svg width="36" height="36" viewBox="0 0 64 64" fill="none" aria-hidden="true">
              <circle cx="32" cy="32" r="29" stroke="#FF9900" strokeWidth="3"/>
              <circle cx="32" cy="32" r="19" stroke="#FF9900" strokeWidth="2" strokeOpacity="0.55"/>
              <circle cx="32" cy="32" r="9"  stroke="#FF9900" strokeWidth="2" strokeOpacity="0.3"/>
              <circle cx="32" cy="32" r="3"  fill="#FF9900"/>
              <line x1="32" y1="32" x2="50" y2="14" stroke="#FF9900" strokeWidth="2.5" strokeLinecap="round"/>
            </svg>
            <div>
              <div style={styles.logoName}>BuilderRadar</div>
              <div style={styles.logoSub}>AI Opportunity Discovery</div>
            </div>
          </a>

          {/* Nav links */}
          <div style={styles.navLinks}>
            <a href="#opportunities" style={styles.navLink}>Opportunities</a>
            <a href="#how-it-works" style={styles.navLink}>About</a>
            <a
              href="https://github.com"
              target="_blank"
              rel="noopener noreferrer"
              style={styles.navLinkGhost}
            >
              GitHub
            </a>
          </div>
        </div>
      </nav>
    </header>
  )
}

const styles = {
  header: {
    position: 'sticky',
    top: 0,
    zIndex: 100,
    background: 'rgba(10,14,26,0.96)',
    backdropFilter: 'blur(12px)',
    borderBottom: '1px solid #1e2d4a',
  },
  topBar: {
    background: '#0d1526',
    borderBottom: '1px solid #1a2540',
    padding: '6px 0',
  },
  topBarInner: {
    maxWidth: 1200,
    margin: '0 auto',
    padding: '0 24px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  topBarText: {
    fontSize: 12,
    color: '#8fa3c0',
    letterSpacing: '0.02em',
  },
  topBarBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 11,
    fontWeight: 600,
    color: '#22d3a5',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
  },
  dot: {
    display: 'inline-block',
    width: 6,
    height: 6,
    borderRadius: '50%',
    background: '#22d3a5',
    boxShadow: '0 0 6px #22d3a5',
    animation: 'pulse 2s infinite',
  },
  nav: {
    padding: '0',
  },
  navInner: {
    maxWidth: 1200,
    margin: '0 auto',
    padding: '0 24px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 64,
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    textDecoration: 'none',
    color: 'inherit',
  },
  logoName: {
    fontSize: 18,
    fontWeight: 700,
    color: '#e8edf5',
    lineHeight: 1.2,
    letterSpacing: '-0.01em',
  },
  logoSub: {
    fontSize: 11,
    color: '#FF9900',
    fontWeight: 500,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
  },
  navLinks: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  navLink: {
    color: '#8fa3c0',
    textDecoration: 'none',
    fontSize: 14,
    fontWeight: 500,
    padding: '6px 14px',
    borderRadius: 8,
    transition: 'all 0.2s ease',
  },
  navLinkGhost: {
    color: '#FF9900',
    textDecoration: 'none',
    fontSize: 13,
    fontWeight: 600,
    padding: '6px 16px',
    borderRadius: 8,
    border: '1px solid rgba(255,153,0,0.35)',
    transition: 'all 0.2s ease',
    marginLeft: 8,
  },
}
