/**
 * config.js — API endpoint configuration
 *
 * After deploying with SAM, replace VITE_API_URL in a .env.local file:
 *   VITE_API_URL=https://YOUR_API_ID.execute-api.us-east-1.amazonaws.com
 *
 * For local dev with the Vite proxy, leave as /api (proxied to your API GW).
 */

export const API_BASE_URL =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.DEV ? '/api' : '')

export const ENDPOINTS = {
  opportunities: `${API_BASE_URL}/opportunities`,
}

export const CATEGORIES = [
  { id: 'all',                  label: 'All',                 color: '#8fa3c0' },
  { id: 'Cloud',                label: 'Cloud',               color: '#4da6ff' },
  { id: 'AI',                   label: 'AI',                  color: '#a855f7' },
  { id: 'Software Engineering', label: 'Software Eng.',       color: '#22d3a5' },
  { id: 'Open Source',          label: 'Open Source',         color: '#fb7185' },
]

export const CATEGORY_COLORS = {
  'Cloud':                '#4da6ff',
  'AI':                   '#a855f7',
  'Software Engineering': '#22d3a5',
  'Open Source':          '#fb7185',
}
