import { Component } from 'react'
import { AlertTriangle } from 'lucide-react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center h-screen w-screen bg-gradient-to-br from-red-50 to-orange-50">
          <div className="text-center max-w-md">
            <div className="flex justify-center mb-4">
              <AlertTriangle size={64} className="text-red-600" />
            </div>
            <h2 className="font-display text-2xl font-bold text-red-800 mb-2">
              Oops! Something went wrong
            </h2>
            <p className="font-body text-gray-700 mb-6">
              {this.state.error?.message || 'An unexpected error occurred'}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="bg-pnb-crimson text-white px-6 py-3 rounded-lg font-display font-semibold
                         hover:bg-red-800 transition-colors"
            >
              Reload Page
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
