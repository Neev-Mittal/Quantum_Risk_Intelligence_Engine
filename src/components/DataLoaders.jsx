import { Loader, AlertCircle } from 'lucide-react'

export function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center h-96">
      <div className="text-center">
        <Loader size={48} className="text-pnb-amber mx-auto animate-spin mb-4" />
        <p className="font-display text-pnb-crimson font-semibold">Loading data...</p>
      </div>
    </div>
  )
}

export function ErrorAlert({ error, onRetry }) {
  return (
    <div className="glass-card rounded-xl p-6 border-red-300 bg-red-50">
      <div className="flex items-start gap-4">
        <AlertCircle size={24} className="text-red-600 flex-shrink-0 mt-1" />
        <div className="flex-1">
          <h3 className="font-display text-pnb-crimson font-bold mb-2">Connection Error</h3>
          <p className="font-body text-gray-700 mb-4 text-sm">{error}</p>
          {onRetry && (
            <button
              onClick={onRetry}
              className="bg-pnb-crimson text-white px-4 py-2 rounded-lg font-body text-sm
                         hover:bg-red-800 transition-colors"
            >
              Retry
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export function DataEmpty({ message = "No data available" }) {
  return (
    <div className="flex items-center justify-center h-64">
      <p className="font-body text-gray-500 text-center">{message}</p>
    </div>
  )
}
