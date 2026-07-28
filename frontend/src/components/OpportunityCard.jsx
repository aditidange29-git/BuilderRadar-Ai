import React, { useState } from 'react'
import { CATEGORY_COLORS } from '../config.js'

export default function OpportunityCard({ opportunity }) {
  const [hovered, setHovered] = useState(false)
  const {
    title,
    source,
    url,
    posted_date,
    deadline,
    eligibility,
    category,
    relevance_reason,
  } = opportunity

  const color = CATEGORY_COLORS[category] || '#8fa3c0'
  const sourceLabel = source === 'devpost' ? 'Devpost' : 'Unstop'
  const sourceColor = source === 'devpost' ? '#3b82f6' : '#f59e0b'

  return (
    <article
      style={{
        ...styles.card,
        ...(hovered ? styles.cardHover : {}),
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      aria-label={`Opportunity: ${title}`}
    >
      {/* Accent line top */}
      <div
        style={{
          ...styles.accentLine,
          background: `linear-gradient(90deg, ${color}, transparent)`,
          opacity: hovered ? 1 : 0.6,
        }}
        aria-hidden="true"
      />

      {/* Header row */}
      <div style={styles.cardHeader}>
        <div style={styles.badges}>
          {/* Category badge */}
          <span
            style={{
              ...styles.badge,
              background: color + '15',
              border: `1px solid ${color}40`,
              color: color,
            }}
          >
            {category}
          </span>
          {/* Source badge */}
          <span
            style={{
              ...styles.badge,
              background: sourceColor + '12',
              border: `1px solid ${sourceColor}30`,
              color: sourceColor,
            }}
          >
            {sourceLabel}
          </span>
        </div>
        {/* Deadline chip */}
        {deadline && deadline !== 'unknown' && (
          <DeadlineChip deadline={deadline} />
        )}
      </div>

      {/* Title */}
      <h3 style={styles.title}>
        <a
          href={url || '#'}
          target="_blank"
          rel="noopener noreferrer"
          style={styles.titleLink}
          aria-label={`Open ${title} on ${sourceLabel} (opens in new tab)`}
        >
          {title}
        </a>
      </h3>

      {/* Relevance reason */}
      {relevance_reason && (
        <div style={styles.relevanceBox}>
          <span style={styles.relevanceIcon} aria-hidden="true">⚡</span>
          <p style={styles.relevanceText}>{relevance_reason}</p>
        </div>
      )}

      {/* Footer meta */}
      <div style={styles.footer}>
        {eligibility && eligibility !== 'unknown' && (
          <div style={styles.metaItem}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#4d6280" strokeWidth="2" aria-hidden="true">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
            <span style={styles.metaText}>{eligibility}</span>
          </div>
        )}
        {posted_date && (
          <div style={styles.metaItem}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#4d6280" strokeWidth="2" aria-hidden="true">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
              <line x1="16" y1="2" x2="16" y2="6"/>
              <line x1="8" y1="2" x2="8" y2="6"/>
              <line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
            <span style={styles.metaText}>Added {formatDate(posted_date)}</span>
          </div>
        )}
        {url && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            style={styles.viewLink}
            aria-label={`View ${title} details (opens in new tab)`}
          >
            View details →
          </a>
        )}
      </div>
    </article>
  )
}

function DeadlineChip({ deadline }) {
  const daysLeft = getDaysLeft(deadline)
  const urgent = daysLeft !== null && daysLeft <= 7

  return (
    <span
      style={{
        ...styles.deadlineChip,
        background: urgent ? 'rgba(251,113,133,0.12)' : 'rgba(34,211,165,0.08)',
        border: `1px solid ${urgent ? 'rgba(251,113,133,0.3)' : 'rgba(34,211,165,0.2)'}`,
        color: urgent ? '#fb7185' : '#22d3a5',
      }}
      aria-label={`Deadline: ${formatDate(deadline)}${urgent ? ' (urgent)' : ''}`}
    >
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
        <circle cx="12" cy="12" r="10"/>
        <polyline points="12 6 12 12 16 14"/>
      </svg>
      {daysLeft !== null
        ? daysLeft <= 0
          ? 'Closing soon'
          : daysLeft <= 7
          ? `${daysLeft}d left`
          : formatDate(deadline)
        : formatDate(deadline)
      }
    </span>
  )
}

function formatDate(dateStr) {
  if (!dateStr || dateStr === 'unknown') return 'Unknown'
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    })
  } catch {
    return dateStr
  }
}

function getDaysLeft(dateStr) {
  if (!dateStr || dateStr === 'unknown') return null
  try {
    const deadline = new Date(dateStr)
    const today = new Date()
    const diff = Math.ceil((deadline - today) / (1000 * 60 * 60 * 24))
    return diff
  } catch {
    return null
  }
}

const styles = {
  card: {
    position: 'relative',
    background: '#141d35',
    border: '1px solid #1e2d4a',
    borderRadius: 14,
    padding: '24px',
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    transition: 'all 0.2s ease',
    overflow: 'hidden',
    cursor: 'default',
  },
  cardHover: {
    background: '#1a2540',
    borderColor: '#2a3f6f',
    transform: 'translateY(-2px)',
    boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
  },
  accentLine: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 2,
    transition: 'opacity 0.2s ease',
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    flexWrap: 'wrap',
  },
  badges: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
  },
  badge: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '3px 10px',
    borderRadius: 20,
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    whiteSpace: 'nowrap',
  },
  deadlineChip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    padding: '3px 10px',
    borderRadius: 20,
    fontSize: 11,
    fontWeight: 600,
    whiteSpace: 'nowrap',
    letterSpacing: '0.02em',
  },
  title: {
    fontSize: 17,
    fontWeight: 700,
    lineHeight: 1.4,
    color: '#e8edf5',
    letterSpacing: '-0.01em',
  },
  titleLink: {
    color: 'inherit',
    textDecoration: 'none',
    transition: 'color 0.15s ease',
  },
  relevanceBox: {
    display: 'flex',
    gap: 10,
    padding: '12px 14px',
    background: 'rgba(255,153,0,0.06)',
    border: '1px solid rgba(255,153,0,0.15)',
    borderRadius: 10,
    alignItems: 'flex-start',
  },
  relevanceIcon: {
    fontSize: 14,
    lineHeight: 1.6,
    flexShrink: 0,
  },
  relevanceText: {
    fontSize: 13,
    color: '#c9a84c',
    lineHeight: 1.6,
    margin: 0,
  },
  footer: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    flexWrap: 'wrap',
    marginTop: 4,
    paddingTop: 12,
    borderTop: '1px solid #1a2540',
  },
  metaItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    minWidth: 0,
  },
  metaText: {
    fontSize: 12,
    color: '#4d6280',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  viewLink: {
    fontSize: 13,
    color: '#FF9900',
    textDecoration: 'none',
    fontWeight: 600,
    flexShrink: 0,
    marginLeft: 'auto',
    transition: 'color 0.15s ease',
    letterSpacing: '-0.01em',
  },
}
