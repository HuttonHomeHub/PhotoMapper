import { Component, type ErrorInfo, type ReactNode } from 'react';

interface State {
  error: unknown;
}

// FE-01: stops a single render error from white-screening the whole app.
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: unknown): State {
    return { error };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error('Uncaught UI error:', error, info?.componentStack);
  }

  handleReset = () => this.setState({ error: null });

  override render() {
    const { error } = this.state;
    if (error) {
      return (
        <div className="error-boundary" role="alert">
          <div className="error-boundary-box">
            <h1>Something went wrong</h1>
            <p>The app hit an unexpected error. Try to recover, or reload the page.</p>
            <pre className="error-boundary-detail">
              {error instanceof Error ? error.message : String(error)}
            </pre>
            <div className="error-boundary-actions">
              <button className="error-boundary-btn" onClick={this.handleReset}>
                Try again
              </button>
              <button
                className="error-boundary-btn error-boundary-btn--primary"
                onClick={() => window.location.reload()}
              >
                Reload
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
