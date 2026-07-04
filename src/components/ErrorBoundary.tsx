import React, { Component } from 'react';

interface EBState { error: Error | null }

// mode='app' (default) is the full-screen root boundary. mode='section' renders a
// contained error box so a render error in one view leaves the sidebar nav usable.
export class ErrorBoundary extends Component<{ children: React.ReactNode; mode?: 'app' | 'section' }, EBState> {
  state: EBState = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, errorInfo.componentStack);
  }
  render() {
    if (this.state.error) {
      const contained = this.props.mode === 'section';
      return (
        <div style={{ padding: '2em', color: '#e4e4e7', background: '#0a0a0f', minHeight: contained ? 'auto' : '100vh', fontFamily: 'sans-serif', textAlign: 'center' }}>
          <h2 style={{ color: '#ef4444' }}>Something went wrong</h2>
          <pre style={{ background: '#1a1a25', padding: '1em', borderRadius: 8, overflow: 'auto', fontSize: '0.85rem', color: '#a1a1aa', textAlign: 'left' }}>
            {this.state.error.message}
          </pre>
          <button onClick={() => this.setState({ error: null })} style={{ marginTop: '1em', padding: '0.5em 1.5em', background: '#06b6d4', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>
            Try Again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
