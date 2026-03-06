'use client'

import React from 'react'

interface ErrorBoundaryProps {
  fallbackTitle?: string
  children: React.ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  message: string
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
    message: '',
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error?.message || 'Unknown error',
    }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <p className="font-medium">{this.props.fallbackTitle || 'Something failed to render'}</p>
          <p className="mt-1 break-all">{this.state.message}</p>
        </div>
      )
    }

    return this.props.children
  }
}
