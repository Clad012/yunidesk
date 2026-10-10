import { Component, type ReactNode } from "react";
import { View } from "react-native";
import type { SupportStrings } from "yunidesk";
import type { ResolvedTheme } from "../theme/theme";
import { LoadState } from "./load-state";

interface Props {
  theme: ResolvedTheme;
  strings: SupportStrings;
  children: ReactNode;
}

/** A bug inside the messenger shows an error with retry instead of taking the host app down. */
export class MessengerErrorBoundary extends Component<Props, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override componentDidCatch(error: unknown): void {
    console.warn("[yunidesk] messenger crashed", error);
  }

  override render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <View style={{ flex: 1, backgroundColor: this.props.theme.background }}>
        <LoadState failed theme={this.props.theme} strings={this.props.strings} onRetry={() => this.setState({ failed: false })} />
      </View>
    );
  }
}
