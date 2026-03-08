import './AnalysisProgress.css'

interface AnalysisProgressProps {
  message: string
}

export function AnalysisProgress({ message }: AnalysisProgressProps) {
  return (
    <div className="AnalysisProgress">
      <hr className="AnalysisProgress__divider" aria-hidden="true" />
      <p className="AnalysisProgress__message">
        <span className="AnalysisProgress__spinner" aria-hidden="true" />
        {message}
      </p>
    </div>
  )
}
