import React from 'react';

// FE-01: stops a single render error from white-screening the whole app.
export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Uncaught UI error:', error, info?.componentStack);
  }

  handleReset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      return (
        <div className="error-boundary" role="alert">
          <div className="error-boundary-box">
            <h1>Something went wrong</h1>
            <p>The app hit an unexpected error. Try to recover, or reload the page.</p>
            <pre className="error-boundary-detail">
              {String(this.state.error?.message || this.state.error)}
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
