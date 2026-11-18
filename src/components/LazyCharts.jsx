// The charts (and the Recharts library they need) load separately, after the
// rest of the app, so the first screen appears sooner. A skeleton shows until
// they arrive.
import { lazy, Suspense } from 'react'
import { SkeletonChart } from './chrome'

const LazyReadingChart = lazy(() => import('./charts').then(m => ({ default: m.ReadingChart })))
const LazyCorrelationChart = lazy(() => import('./charts').then(m => ({ default: m.CorrelationChart })))

export function ReadingChart(props) {
  return (
    <Suspense fallback={<SkeletonChart />}>
      <LazyReadingChart {...props} />
    </Suspense>
  )
}

export function CorrelationChart(props) {
  return (
    <Suspense fallback={<SkeletonChart />}>
      <LazyCorrelationChart {...props} />
    </Suspense>
  )
}
