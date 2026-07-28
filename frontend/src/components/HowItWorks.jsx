import React from 'react'

const STEPS = [
  {
    icon: '🕷️',
    title: 'Scrape',
    desc: 'EventBridge fires two Lambda scrapers at 08:00 and 20:00 UTC. Each fetches listings sorted by recency and takes exactly the 2 newest — hard-capped, no exceptions.',
    color: '#4da6ff',
  },
  {
    icon: '🔍',
    title: 'Deduplicate',
    desc: 'Each listing gets a SHA-256 ID from its normalized title and source. A conditional DynamoDB write rejects anything already seen — the agent never touches duplicates.',
    color: '#a855f7',
  },
  {
    icon: '🤖',
    title: 'Classify & Explain',
    desc: 'A Strands agent on Bedrock AgentCore Runtime invokes Nova Micro for each new item: picks a category, extracts deadline and eligibility, and writes a one-sentence why-it-matters for your profile.',
    color: '#FF9900',
  },
  {
    icon: '🚀',
    title: 'Serve',
    desc: 'Enriched records land in DynamoDB. The read API queries only status=enriched rows — no model calls, no latency, instant dashboard.',
    color: '#22d3a5',
  },
]

export default function HowItWorks() {
  return (
    <section id="how-it-works" style={styles.section} aria-labelledby="how-heading">
      <div style={styles.inner}>
        <div style={styles.sectionHeader}>
          <p style={styles.eyebrow}>Architecture</p>
          <h2 id="how-heading" style={styles.heading}>How It Works</h2>
          <p style={styles.subheading}>
            A four-stage automated pipeline — scrape → dedup → classify → serve —
            runs twice daily on AWS at under $0.10/month.
          </p>
        </div>

        <div style={styles.steps} role="list">
          {STEPS.map((step, i) => (
            <div key={step.title} style={styles.step} role="listitem">
              {/* Connector line */}
              {i < STEPS.length - 1 && (
                <div style={styles.connector} aria-hidden="true" />
              )}
              <div
                style={{
                  ...styles.iconWrap,
                  background: step.color + '15',
                  border: `1px solid ${step.color}30`,
                }}
              >
                <span style={styles.icon} role="img" aria-label={step.title}>{step.icon}</span>
              </div>
              <div style={styles.stepNum} aria-hidden="true">{String(i + 1).padStart(2, '0')}</div>
              <h3 style={{ ...styles.stepTitle, color: step.color }}>{step.title}</h3>
              <p style={styles.stepDesc}>{step.desc}</p>
            </div>
          ))}
        </div>

        {/* Tech stack pills */}
        <div style={styles.stackRow} role="list" aria-label="Technology stack">
          {[
            'AWS Lambda', 'DynamoDB', 'EventBridge', 'API Gateway',
            'Bedrock AgentCore', 'Strands SDK', 'Nova Micro', 'React + Vite',
          ].map(tech => (
            <span key={tech} style={styles.techPill} role="listitem">{tech}</span>
          ))}
        </div>
      </div>
    </section>
  )
}

const styles = {
  section: {
    padding: '80px 24px',
    borderTop: '1px solid #1e2d4a',
    background: '#0d1526',
  },
  inner: {
    maxWidth: 1100,
    margin: '0 auto',
  },
  sectionHeader: {
    textAlign: 'center',
    marginBottom: 56,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: 600,
    color: '#FF9900',
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  heading: {
    fontSize: 'clamp(1.6rem, 3.5vw, 2.5rem)',
    fontWeight: 800,
    color: '#e8edf5',
    letterSpacing: '-0.02em',
    marginBottom: 16,
  },
  subheading: {
    fontSize: 16,
    color: '#8fa3c0',
    maxWidth: 480,
    margin: '0 auto',
    lineHeight: 1.6,
  },
  steps: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: 32,
    position: 'relative',
    marginBottom: 48,
  },
  step: {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    gap: 12,
  },
  connector: {
    position: 'absolute',
    top: 32,
    left: '75%',
    width: '50%',
    height: 1,
    background: 'linear-gradient(90deg, #2a3f6f, transparent)',
    display: 'none', // shown via media query in real CSS; simplified here
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 16,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    fontSize: 28,
  },
  stepNum: {
    fontSize: 11,
    fontWeight: 700,
    color: '#2a3f6f',
    letterSpacing: '0.08em',
    fontFamily: 'monospace',
  },
  stepTitle: {
    fontSize: 17,
    fontWeight: 700,
    letterSpacing: '-0.01em',
  },
  stepDesc: {
    fontSize: 13,
    color: '#4d6280',
    lineHeight: 1.65,
    maxWidth: 240,
  },
  stackRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'center',
    padding: '32px 0 0',
    borderTop: '1px solid #1e2d4a',
  },
  techPill: {
    padding: '5px 14px',
    background: '#0f1628',
    border: '1px solid #1e2d4a',
    borderRadius: 20,
    fontSize: 12,
    fontWeight: 500,
    color: '#8fa3c0',
    letterSpacing: '0.02em',
  },
}
