import React, { useState } from 'react'
import Header from './components/Header.jsx'
import Hero from './components/Hero.jsx'
import FilterBar from './components/FilterBar.jsx'
import OpportunityGrid from './components/OpportunityGrid.jsx'
import HowItWorks from './components/HowItWorks.jsx'
import Footer from './components/Footer.jsx'
import { useOpportunities } from './hooks/useOpportunities.js'

export default function App() {
  const [activeCategory, setActiveCategory] = useState('all')
  const { opportunities, loading, error, lastUpdated, refetch } = useOpportunities(activeCategory)

  return (
    <>
      {/* Global keyframe animations */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        a:hover { opacity: 0.85; }
        button:hover { opacity: 0.88; }
        @media (max-width: 600px) {
          .footer-top { grid-template-columns: 1fr !important; }
        }
      `}</style>

      <Header />

      <main id="main-content">
        {/* Hero */}
        <Hero count={loading ? null : opportunities.length} loading={loading} />

        {/* Opportunities section */}
        <section
          id="opportunities"
          aria-labelledby="opps-heading"
          style={styles.section}
        >
          <div style={styles.inner}>
            <div style={styles.sectionHeader}>
              <p style={styles.eyebrow}>Live Feed</p>
              <h2 id="opps-heading" style={styles.heading}>
                Latest Opportunities
              </h2>
              <p style={styles.subheading}>
                Scraped, classified, and explained by AI — updated twice daily.
                {' '}
                <span style={styles.hint}>
                  No fluff, no noise — only what's relevant to you.
                </span>
              </p>
            </div>
          </div>

          {/* Sticky filter bar */}
          <FilterBar
            active={activeCategory}
            onChange={setActiveCategory}
            total={loading ? 0 : opportunities.length}
            lastUpdated={lastUpdated}
          />

          <div style={styles.inner}>
            <OpportunityGrid
              opportunities={opportunities}
              loading={loading}
              error={error}
              onRetry={refetch}
              category={activeCategory}
            />
          </div>
        </section>

        {/* How it works */}
        <HowItWorks />
      </main>

      <Footer />
    </>
  )
}

const styles = {
  section: {
    paddingBottom: 40,
  },
  inner: {
    maxWidth: 1200,
    margin: '0 auto',
    padding: '0 24px',
  },
  sectionHeader: {
    maxWidth: 1200,
    margin: '0 auto',
    padding: '56px 24px 32px',
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: 600,
    color: '#FF9900',
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  heading: {
    fontSize: 'clamp(1.5rem, 3vw, 2.25rem)',
    fontWeight: 800,
    color: '#e8edf5',
    letterSpacing: '-0.02em',
    marginBottom: 12,
  },
  subheading: {
    fontSize: 15,
    color: '#8fa3c0',
    lineHeight: 1.65,
    maxWidth: 520,
  },
  hint: {
    color: '#4d6280',
  },
}
