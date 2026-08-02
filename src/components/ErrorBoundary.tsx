import { Component, type ErrorInfo, type ReactNode } from 'react';
import { REPO_URL } from '@/config';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * The last line of defence.
 *
 * A calculator does arithmetic during render, and arithmetic on adversarial
 * input can throw. Without a boundary React unmounts the whole tree and the
 * visitor gets a white page with no explanation and no way back — which is
 * exactly what a deliberately extreme URL used to produce here.
 *
 * The engine no longer throws on large numbers, but the boundary stays: the
 * cost of being wrong about "nothing else can throw" is the entire page.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('TokenTally crashed while rendering', error, info.componentStack);
  }

  private readonly reset = () => {
    // The scenario lives in the query string, so clearing it is a real fix
    // rather than a reload-and-hope.
    window.location.href = window.location.pathname;
  };

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <main className="state-message" role="alert">
        <h1>Something in that scenario broke the calculator</h1>
        <p>
          This is a bug, not something you did wrong. The numbers in the address bar are the most likely
          culprit — starting from a clean scenario should get you working again.
        </p>
        <p className="mono state-message__detail">{error.message}</p>
        <p>
          <button type="button" className="button button--primary" onClick={this.reset}>
            Start a fresh scenario
          </button>
        </p>
        <p>
          If it keeps happening, <a href={`${REPO_URL}/issues/new`}>open an issue</a> and paste the URL you
          used — that is enough to reproduce it.
        </p>
      </main>
    );
  }
}
