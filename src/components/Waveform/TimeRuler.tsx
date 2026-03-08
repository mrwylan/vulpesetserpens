import './TimeRuler.css'

interface TimeRulerProps {
  duration: number
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  const ms = Math.floor((secs % 1) * 100)
  const wholeSecs = Math.floor(secs)
  return `${mins}:${String(wholeSecs).padStart(2, '0')}.${String(ms).padStart(2, '0')}`
}

export function TimeRuler({ duration }: TimeRulerProps) {
  // Compute a reasonable tick interval
  const rawInterval = duration / 6
  const intervals = [0.5, 1, 2, 5, 10, 20, 30, 60, 120]
  const tickInterval = intervals.find(i => i >= rawInterval) ?? intervals[intervals.length - 1]!

  // Generate tick marks
  const ticks: number[] = []
  for (let t = 0; t <= duration; t += tickInterval) {
    ticks.push(parseFloat(t.toFixed(6)))
    if (ticks.length > 20) break  // safety limit
  }

  return (
    <div className="TimeRuler" aria-hidden="true">
      <div className="TimeRuler__inner">
        {ticks.map((t) => (
          <span
            key={t}
            className="TimeRuler__tick"
            style={{ left: `${(t / duration) * 100}%` }}
          >
            {formatTime(t)}
          </span>
        ))}
      </div>
    </div>
  )
}
