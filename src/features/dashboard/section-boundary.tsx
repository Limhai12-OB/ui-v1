"use client";

import { Component, type ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/shared/states";

/** Keeps one failing dashboard section from taking down the whole page. */
export class SectionBoundary extends Component<{ name: string; children: ReactNode }, { error: boolean }> {
  state = { error: false };

  static getDerivedStateFromError() {
    return { error: true };
  }

  render() {
    if (this.state.error)
      return (
        <Card className="py-0">
          <ErrorState title={`${this.props.name} couldn't be displayed`} description="Something went wrong while calculating this section. Other sections are unaffected." onRetry={() => this.setState({ error: false })} />
        </Card>
      );
    return this.props.children;
  }
}
