import React from 'react'

export function SHubIcon({ name, size = 22, ...props }) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.9,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
    ...props,
  }

  if (name === 'home') {
    return <svg {...common}><path d="M3.5 10.7 12 3.8l8.5 6.9"/><path d="M5.5 9.8v10h13v-10"/><path d="M9.2 19.8v-6.2h5.6v6.2"/></svg>
  }
  if (name === 'class') {
    return <svg {...common}><path d="M8.3 11.2a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/><path d="M3.5 19.4v-1.2a4.8 4.8 0 0 1 4.8-4.8h.1a4.8 4.8 0 0 1 4.8 4.8v1.2"/><path d="M15.6 11.1a2.6 2.6 0 1 0 0-5.2"/><path d="M15.8 13.5a4.3 4.3 0 0 1 4.7 4.3v1.6"/></svg>
  }
  if (name === 'ai') {
    return <svg {...common}><path d="M12 3.5c.5 3.3 2.2 5 5.5 5.5-3.3.5-5 2.2-5.5 5.5-.5-3.3-2.2-5-5.5-5.5 3.3-.5 5-2.2 5.5-5.5Z"/><path d="M18.2 14.5c.25 1.65 1.1 2.5 2.75 2.75-1.65.25-2.5 1.1-2.75 2.75-.25-1.65-1.1-2.5-2.75-2.75 1.65-.25 2.5-1.1 2.75-2.75Z"/></svg>
  }
  if (name === 'study') {
    return <svg {...common}><path d="M2.8 5.2c3.6-.9 6.7.1 9.2 2.8v11.2c-2.5-2.7-5.6-3.7-9.2-2.8V5.2Z"/><path d="M21.2 5.2c-3.6-.9-6.7.1-9.2 2.8v11.2c2.5-2.7 5.6-3.7 9.2-2.8V5.2Z"/><path d="M12 8v11.2"/></svg>
  }
  if (name === 'schedule') {
    return <svg {...common}><rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M7.5 3.5v3"/><path d="M16.5 3.5v3"/><path d="M3.5 9h17"/><path d="m8 14 2.1 2.1 4.4-4.6"/></svg>
  }
  if (name === 'board') {
    return <svg {...common}><path d="M5 4.5h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-8l-4.5 3v-3H5a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2Z"/><path d="M7.5 9h9"/><path d="M7.5 13h6"/></svg>
  }
  if (name === 'todo') {
    return <svg {...common}><path d="M8.5 6.5h11"/><path d="M8.5 12h11"/><path d="M8.5 17.5h11"/><path d="m3.8 6.4 1.2 1.2 2-2.2"/><path d="m3.8 11.9 1.2 1.2 2-2.2"/><path d="m3.8 17.4 1.2 1.2 2-2.2"/></svg>
  }
  if (name === 'timetable') {
    return <svg {...common}><rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M7.5 3.5v3"/><path d="M16.5 3.5v3"/><path d="M3.5 9h17"/><path d="M8 12.5h.01"/><path d="M12 12.5h.01"/><path d="M16 12.5h.01"/><path d="M8 16.5h.01"/><path d="M12 16.5h.01"/></svg>
  }
  if (name === 'meal') {
    return <svg {...common}><path d="M4.5 4.5v6.2a3 3 0 0 0 3 3h.5"/><path d="M7.5 4.5v15"/><path d="M15.5 4.5v6.2"/><path d="M19.5 4.5v6.2"/><path d="M15.5 8.2h4"/><path d="M17.5 10.7v8.8"/></svg>
  }
  if (name === 'academic') {
    return <svg {...common}><rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M7.5 3.5v3"/><path d="M16.5 3.5v3"/><path d="M3.5 9h17"/><path d="M8 13h3"/><path d="M8 16.5h8"/><path d="M15 12.5h1.5v1.5H15z"/></svg>
  }
  if (name === 'search') {
    return <svg {...common}><circle cx="10.7" cy="10.7" r="6.4"/><path d="m15.5 15.5 4.2 4.2"/></svg>
  }
  if (name === 'clock') {
    return <svg {...common}><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v5l3.2 2"/></svg>
  }
  return null
}
