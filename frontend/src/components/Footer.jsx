import React from 'react'

export default function Footer() {
  const year = new Date().getFullYear()

  return (
    <footer style={styles.footer} role="contentinfo">
      <div style={styles.inner}>
        <div style={styles.top}>
          {/* Brand */}
          <div style={styles.brand}>
            <div style={styles.logoRow}>
              <svg width="24" height="24" viewBox="0 0 64 64" fill="none" aria-hidden="true">
                <circle cx="32" cy="32" r="29" stroke="#FF9900" strokeWidth="3"/>
                <circle cx="32" cy="32" r="19" stroke="#FF9900" strokeWidth="2" strokeOpacity="0.55"/>
                <circle cx="32" cy="32" r="3" fill="#FF9900"/>
                <line x1="32" y1="32" x2="50" y2="14" stroke="#FF9900" strokeWidth="2.5" strokeLinecap="round"/>
              </svg>
              <span style={styles.brandName}>BuilderRadar AI</span>
            </div>
            <p style={styles.brandDesc}>
              AI-powered student opportunity discovery.<br />
              Built with AWS Bedrock AgentCore &amp; Strands SDK.
            </p>
          </div>

          {/* Links */}
          <div style={styles.linksCol}>
            <p style={styles.linksHeading}>Resources</p>
            <a href="https://strands.sela.ai" target="_blank" rel="noopener noreferrer" style={styles.link}>Strands SDK</a>
            <a href="https://aws.amazon.com/bedrock/agentcore/" target="_blank" rel="noopener noreferrer" style={styles.link}>AgentCore Docs</a>
            <a href="https://devpost.com/hackathons" target="_blank" rel="noopener noreferrer" style={styles.link}>Devpost</a>
            <a href="https://unstop.com/hackathons" target="_blank" rel="noopener noreferrer" style={styles.link}>Unstop</a>
          </div>

          {/* Cost note */}
          <div style={styles.costCard}>
            <p style={styles.costLabel}>Estimated monthly cost</p>
            <p style={styles.costValue}>~$0.10</p>
            <p style={styles.costNote}>
              On-demand DynamoDB · Lambda free tier ·<br />
              Nova Micro · HTTP API Gateway
            </p>
          </div>
        </div>

        <div style={styles.bottom}>
          <p style={styles.copy}>© {year} BuilderRadar AI. Built for the AWS Bedrock AgentCore Challenge.</p>
          <div style={styles.poweredBy}>
            <span style={styles.poweredText}>Powered by</span>
            <span style={styles.awsBadge}>AWS</span>
          </div>
        </div>
      </div>
    </footer>
  )
}

const styles = {
  footer: {
    background: '#080c18',
    borderTop: '1px solid #1e2d4a',
    padding: '56px 24px 32px',
    marginTop: 80,
  },
  inner: {
    maxWidth: 1200,
    margin: '0 auto',
  },
  top: {
    display: 'grid',
    gridTemplateColumns: '2fr 1fr 1.5fr',
    gap: 48,
    marginBottom: 40,
    paddingBottom: 40,
    borderBottom: '1px solid #1e2d4a',
  },
  brand: {
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
  },
  logoRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  brandName: {
    fontSize: 16,
    fontWeight: 700,
    color: '#e8edf5',
  },
  brandDesc: {
    fontSize: 13,
    color: '#4d6280',
    lineHeight: 1.7,
  },
  linksCol: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  linksHeading: {
    fontSize: 11,
    fontWeight: 700,
    color: '#2a3f6f',
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  link: {
    fontSize: 13,
    color: '#4d6280',
    textDecoration: 'none',
    transition: 'color 0.15s ease',
  },
  costCard: {
    background: '#0f1628',
    border: '1px solid #1e2d4a',
    borderRadius: 12,
    padding: '20px 24px',
  },
  costLabel: {
    fontSize: 11,
    fontWeight: 600,
    color: '#4d6280',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  costValue: {
    fontSize: 32,
    fontWeight: 800,
    color: '#22d3a5',
    letterSpacing: '-0.02em',
    marginBottom: 8,
  },
  costNote: {
    fontSize: 11,
    color: '#2a3f6f',
    lineHeight: 1.6,
  },
  bottom: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    flexWrap: 'wrap',
  },
  copy: {
    fontSize: 12,
    color: '#2a3f6f',
  },
  poweredBy: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  poweredText: {
    fontSize: 11,
    color: '#2a3f6f',
  },
  awsBadge: {
    fontSize: 11,
    fontWeight: 800,
    color: '#FF9900',
    background: 'rgba(255,153,0,0.1)',
    border: '1px solid rgba(255,153,0,0.25)',
    padding: '2px 8px',
    borderRadius: 4,
    letterSpacing: '0.06em',
  },
}
