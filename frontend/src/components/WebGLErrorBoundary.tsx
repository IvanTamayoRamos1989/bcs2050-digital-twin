import React from "react";

interface Props {
  children: React.ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  message: string;
}

export class WebGLErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message || "Error WebGL" };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-full w-full items-center justify-center bg-[var(--hig-bg)] p-8 text-center">
          <div className="hig-glass-sidebar max-w-md rounded-[24px] p-6">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--hig-amber)]">
              Fallback de Motor Gráfico
            </p>
            <h3 className="mt-2 text-lg font-semibold text-[var(--hig-ink)]">
              {this.props.fallbackTitle || "Visor 3D reiniciando"}
            </h3>
            <p className="mt-2 text-xs text-[var(--hig-ink-2)]">{this.state.message}</p>
            <button
              type="button"
              onClick={() => this.setState({ hasError: false, message: "" })}
              className="hig-lift mt-4 rounded-full bg-[var(--hig-accent)] hover:bg-[var(--hig-accent-hover)] px-5 py-2 text-xs font-semibold text-white transition-colors cursor-pointer"
            >
              Reintentar Visor 3D
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
