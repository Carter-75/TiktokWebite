'use client';

import { Component, ErrorInfo, ReactNode } from 'react';

type Props = {
  children: ReactNode;
};

type State = {
  hasError: boolean;
};

class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[app] Uncaught error', error, info);
  }

  handleReset = () => {
    this.setState({ hasError: false });
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="app-error">
          <h1>We hit a snag</h1>
          <p>Something went sideways while rendering Product Pulse. Reload to continue.</p>
          <button type="button" onClick={this.handleReset}>
            Reload experience
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default AppErrorBoundary;
