import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  format,
  pickLocalized,
  type ContactProfile,
  type Locale,
  type SupportStrings,
  type WidgetConfig,
} from "yunidesk";
import { firstName } from "../logic/layout";
import type { ResolvedTheme } from "../theme/theme";
import { IconButton } from "../ui/icon-button";
import { TeamAvatars } from "./team-avatars";
import { withAlpha } from "../theme/colors";

export interface HomeHeaderProps {
  config: WidgetConfig;
  contact: ContactProfile | null;
  theme: ResolvedTheme;
  strings: SupportStrings;
  locale: Locale;
  safeTop: boolean;
  onClose?: () => void;
}

export function HomeHeader({ config, contact, theme, strings, locale, safeTop, onClose }: HomeHeaderProps) {
  const insets = useSafeAreaInsets();
  const name = firstName(contact?.name);
  const greeting =
    pickLocalized(config.greeting, locale) ??
    (name ? format(strings.defaultGreetingNamed, { name }) : strings.defaultGreeting);
  const intro = pickLocalized(config.intro, locale) ?? strings.defaultIntro;
  return (
    <View
      style={{
        backgroundColor: theme.brand,
        paddingTop: (safeTop ? insets.top : 0) + 12,
        paddingHorizontal: 20,
        paddingBottom: 56,
        gap: 20,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 44 }}>
        <Text style={{ color: theme.onBrand, fontSize: 17, fontWeight: "700", flexShrink: 1 }} numberOfLines={1}>
          {config.teamName}
        </Text>
        {onClose ? (
          <IconButton
            icon="close"
            label={strings.close}
            onPress={onClose}
            color={theme.onBrand}
            background={withAlpha(theme.onBrand, 0.16)}
          />
        ) : null}
      </View>
      <TeamAvatars agents={config.agents} theme={theme} />
      <View style={{ gap: 6 }}>
        <Text style={{ color: theme.onBrand, fontSize: 30, fontWeight: "700" }} accessibilityRole="header">
          {greeting}
        </Text>
        <Text style={{ color: withAlpha(theme.onBrand, 0.85), fontSize: 20, fontWeight: "600" }}>{intro}</Text>
      </View>
    </View>
  );
}
