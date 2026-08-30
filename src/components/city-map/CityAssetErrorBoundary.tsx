"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

interface CityAssetErrorBoundaryProps {
  children: ReactNode;
  onError: (error: Error) => void;
  resetKey: number;
}

interface CityAssetErrorBoundaryState {
  hasError: boolean;
}

export class CityAssetErrorBoundary extends Component<CityAssetErrorBoundaryProps, CityAssetErrorBoundaryState> {
  state: CityAssetErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): CityAssetErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("City asset loading failed", error, info);
    this.props.onError(error);
  }

  componentDidUpdate(previousProps: CityAssetErrorBoundaryProps) {
    if (previousProps.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false });
    }
  }

  render() {
    return this.state.hasError ? null : this.props.children;
  }
}
