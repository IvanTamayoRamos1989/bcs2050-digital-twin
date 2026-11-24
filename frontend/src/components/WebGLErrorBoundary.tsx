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
        <div className="flex h-full w-full items-center justify-center bg-[#050811] p-8 text-center">
          <div className="glass-panel max-w-md rounded-xl p-6">
            <p className="font-mono-num text-xs uppercase tracking-widest text-amber-400">
              Fallback de Motor Gráfico
            </p>
            <h3 className="mt-2 text-lg font-semibold text-white">
              {this.props.fallbackTitle || "Visor 3D reiniciando"}
            </h3>
            <p className="mt-2 text-xs text-slate-400">{this.state.message}</p>
            <button
              type="button"
              onClick={() => this.setState({ hasError: false, message: "" })}
              className="mt-4 rounded-lg bg-sky-500/20 px-4 py-2 text-xs font-medium text-sky-300 ring-1 ring-sky-400/40 hover:bg-sky-500/30"
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
