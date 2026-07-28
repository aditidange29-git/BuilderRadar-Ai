import React from 'react'
import OpportunityCard from './OpportunityCard.jsx'

export function LoadingSkeleton() {
  return (
    <div style={styles.grid} aria-label="Loading opportunities" aria-busy="true">
      {[...Array(6)].map((_, i) => (
        <div key={i} style={styles.skeleton} aria-hidden="true">
          <div style={{...styles.skeletonLine, width: '40%', height: 20, marginBottom: 16}} />
          <div style={{...styles.skeletonLine, width: '85%', height: 24, marginBottom: 8}} />
          <div style={{...styles.skeletonLine, width: '70%', height: 16, marginBottom: 20}} />
          <div style={{...styles.skeletonLine, width: '100%', height: 60}} />
        </div>
      ))}
    </div>
  )
}

export function EmptyState({ category }) {
  return (
    <div style={styles.empty} role="status" aria-live="polite">
      <div style={styles.emptyIcon} aria-hidden="true">
        <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
          <circle cx="32" cy="32" r="30" stroke="#1e2d4a" strokeWidth="2"/>
          <circle cx="32" cy="32" r="20" stroke="#1e2d4a" strokeWidth="1.5" strokeOpacity="0.6"/>
          <circle cx="32" cy="32" r="10" stroke="#1e2d4a" strokeWidth="1.5" strokeOpacity="0.3"/>
          <circle cx="32" cy="32" r="3" fill="#2a3f6f"/>
          <line x1="32" y1="32" x2="50" y2="14" stroke="#2a3f6f" strokeWidth="2" strokeLinecap="round"/>
        </svg>
      </div>
      <h3 style={styles.emptyTitle}>No opportunities found</h3>
      <p style={styles.emptyText}>
        {category && category !== 'all'
          ? `No ${category} opportunities yet. The agent will pick some up on the next scrape run.`
          : 'The scrapers haven\'t run yet, or all items are still being enriched by the agent. Check back soon.'}
      </p>
    </div>
  )
}

export function ErrorState({ message, onRetry }) {
  return (
    <div style={styles.error} role="alert" aria-live="assertive">
      <div style={styles.errorIcon} aria-hidden="true">⚠</div>
      <h3 style={styles.errorTitle}>Failed to load opportunities</h3>
      <p style={styles.errorText}>{message}</p>
      <p style={styles.errorHint}>
        Make sure the API Gateway is deployed and <code style={styles.code}>VITE_API_URL</code> is set in <code style={styles.code}>.env.local</code>
      </p>
      {onRetry && (
        <button onClick={onRetry} style={styles.retryBtn} type="button">
          Try again
        </button>
      )}
    </div>
  )
}

export default function OpportunityGrid({ opportunities, loading, error, onRetry, category }) {
  if (loading) return <LoadingSkeleton />
  if (error)   return <ErrorState message={error} onRetry={onRetry} />
  if (!opportunities.length) return <EmptyState category={category} />

  return (
    <div
      style={styles.grid}
      role="list"
      aria-label={`${opportunities.length} opportunities`}
    >
      {opportunities.map(opp => (
        <div key={opp.id} role="listitem">
          <OpportunityCard opportunity={opp} />
        </div>
      ))}
    </div>
  )
}

const skeletonAnim = {
  background: 'linear-gradient(90deg, #141d35 25%, #1a2540 50%, #141d35 75%)',
  backgroundSize: '200% 100%',
}

const styles = {
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
    gap: 20,
    padding: '32px 0',
  },
  skeleton: {
    ...skeletonAnim,
    border: '1px solid #1e2d4a',
    borderRadius: 14,
    padding: 24,
    minHeight: 200,
  },
  skeletonLine: {
    borderRadius: 6,
    background: '#1e2d4a',
  },
  empty: {
    textAlign: 'center',
    padding: '80px 24px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 16,
  },
  emptyIcon: {
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 700,
    color: '#4d6280',
  },
  emptyText: {
    fontSize: 15,
    color: '#2a3f6f',
    maxWidth: 420,
    lineHeight: 1.6,
  },
  error: {
    textAlign: 'center',
    padding: '64px 24px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 12,
    background: 'rgba(251,113,133,0.05)',
    border: '1px solid rgba(251,113,133,0.15)',
    borderRadius: 14,
    margin: '32px 0',
  },
  errorIcon: {
    fontSize: 32,
    color: '#fb7185',
    marginBottom: 4,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: 700,
    color: '#fb7185',
  },
  errorText: {
    fontSize: 14,
    color: '#8fa3c0',
  },
  errorHint: {
    fontSize: 13,
    color: '#4d6280',
    maxWidth: 440,
    lineHeight: 1.6,
  },
  code: {
    fontFamily: 'monospace',
    background: '#1a2540',
    padding: '1px 6px',
    borderRadius: 4,
    fontSize: 12,
    color: '#FF9900',
  },
  retryBtn: {
    marginTop: 8,
    padding: '8px 20px',
    background: 'transparent',
    border: '1px solid rgba(251,113,133,0.4)',
    color: '#fb7185',
    borderRadius: 8,
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 600,
    fontFamily: 'inherit',
    transition: 'all 0.15s ease',
  },
}
