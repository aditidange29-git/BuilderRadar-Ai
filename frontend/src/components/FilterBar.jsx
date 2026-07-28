import React from 'react'
import { CATEGORIES } from '../config.js'

export default function FilterBar({ active, onChange, total, lastUpdated }) {
  return (
    <div style={styles.wrapper} role="navigation" aria-label="Filter opportunities">
      <div style={styles.inner}>
        {/* Category pills */}
        <div style={styles.pills} role="list" aria-label="Category filters">
          {CATEGORIES.map(cat => (
            <button
              key={cat.id}
              onClick={() => onChange(cat.id)}
              style={{
                ...styles.pill,
                ...(active === cat.id ? {
                  background: cat.color + '18',
                  borderColor: cat.color + '80',
                  color: cat.color,
                  fontWeight: 600,
                } : {}),
              }}
              aria-pressed={active === cat.id}
              aria-label={`Filter by ${cat.label}`}
              role="listitem"
            >
              {active === cat.id && (
                <span
                  style={{
                    display: 'inline-block',
                    width: 6, height: 6,
                    borderRadius: '50%',
                    background: cat.color,
                    marginRight: 6,
                    flexShrink: 0,
                  }}
                  aria-hidden="true"
                />
              )}
              {cat.label}
            </button>
          ))}
        </div>

        {/* Right side: count + last updated */}
        <div style={styles.meta} aria-live="polite" aria-atomic="true">
          <span style={styles.count}>
            {total} {total === 1 ? 'result' : 'results'}
          </span>
          {lastUpdated && (
            <span style={styles.updated}>
              Updated {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

const styles = {
  wrapper: {
    background: 'rgba(15,22,40,0.8)',
    backdropFilter: 'blur(8px)',
    borderTop: '1px solid #1e2d4a',
    borderBottom: '1px solid #1e2d4a',
    padding: '14px 0',
    position: 'sticky',
    top: 97,   // below header (64 topbar+nav + ~33 topbar)
    zIndex: 90,
  },
  inner: {
    maxWidth: 1200,
    margin: '0 auto',
    padding: '0 24px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    flexWrap: 'wrap',
  },
  pills: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
  },
  pill: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '6px 14px',
    borderRadius: 20,
    border: '1px solid #1e2d4a',
    background: 'transparent',
    color: '#8fa3c0',
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    fontFamily: 'inherit',
    letterSpacing: '0.01em',
  },
  meta: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    flexShrink: 0,
  },
  count: {
    fontSize: 13,
    color: '#4d6280',
    fontWeight: 500,
  },
  updated: {
    fontSize: 12,
    color: '#2a3f6f',
    fontWeight: 400,
  },
}
