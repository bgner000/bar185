// Sample events content. There is no public events-listing API yet, so this
// is frontend-only placeholder data — swap it out once a real endpoint exists.

function daysFromNow(days, hour) {
  const date = new Date()
  date.setDate(date.getDate() + days)
  date.setHours(hour, 0, 0, 0)
  return date.toISOString()
}

export const upcomingEvents = [
  {
    id: 'live-jazz',
    title: 'Live Jazz Sundays',
    tagline: 'A local trio playing warm sets through the evening.',
    startsAt: daysFromNow(4, 18),
    tag: 'Live Music',
  },
  {
    id: 'trivia-night',
    title: 'Inner West Trivia Night',
    tagline: 'Teams of up to six. Bar tab up for grabs.',
    startsAt: daysFromNow(9, 19),
    tag: 'Trivia',
  },
  {
    id: 'natural-wine-tasting',
    title: 'Natural Wine Tasting',
    tagline: 'A guided tasting through small NSW producers.',
    startsAt: daysFromNow(16, 18),
    tag: 'Tasting',
  },
]
