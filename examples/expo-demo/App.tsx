import { useCallback, useState } from "react";
import { Platform, Pressable, StyleSheet, Switch, Text, View, useColorScheme } from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { SupportProvider, useSupport } from "yunidesk-react-native";
import { DEMO_USER, signDemoUserToken } from "./src/dev-identity";
import { asyncStorage } from "./src/storage";

// The local support worker (`pnpm dev` at the repo root). The Android emulator reaches the
// host machine at 10.0.2.2.
const BASE_URL = Platform.OS === "android" ? "http://10.0.2.2:8787" : "http://localhost:8787";

type Locale = "en" | "fr";

export function App() {
  const [identified, setIdentified] = useState(false);
  const [locale, setLocale] = useState<Locale>("en");
  // Stable so the SDK does not see a new user on every render.
  const getUserToken = useCallback(() => signDemoUserToken(), []);

  return (
    <SafeAreaProvider>
      <SupportProvider
        baseUrl={BASE_URL}
        getUserToken={identified ? getUserToken : null}
        userId={identified ? DEMO_USER.userId : null}
        locale={locale}
        storage={asyncStorage}
      >
        <DemoScreen identified={identified} onIdentified={setIdentified} locale={locale} onLocale={setLocale} />
      </SupportProvider>
    </SafeAreaProvider>
  );
}

interface DemoScreenProps {
  identified: boolean;
  onIdentified: (value: boolean) => void;
  locale: Locale;
  onLocale: (value: Locale) => void;
}

function DemoScreen({ identified, onIdentified, locale, onLocale }: DemoScreenProps) {
  const { unreadCount, ready, connection, contact, open } = useSupport();
  const dark = useColorScheme() === "dark";
  const colors = dark ? DARK : LIGHT;
  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]}>
      <StatusBar style="auto" />
      <Text style={[styles.title, { color: colors.text }]}>Yunidesk</Text>
      <Text style={[styles.muted, { color: colors.muted }]}>
        {ready ? `Connected as ${contact?.name ?? "a visitor"}` : "Not started yet"} · socket {connection}
      </Text>

      <Pressable
        onPress={() => open("home")}
        accessibilityRole="button"
        style={({ pressed }) => [styles.primary, { opacity: pressed ? 0.8 : 1 }]}
      >
        <Text style={styles.primaryText}>Open messenger</Text>
        {unreadCount > 0 ? (
          <View style={styles.badge} accessibilityLabel={`${unreadCount} unread`}>
            <Text style={styles.badgeText}>{unreadCount}</Text>
          </View>
        ) : null}
      </Pressable>
      <Pressable
        onPress={() => open("new")}
        accessibilityRole="button"
        style={[styles.secondary, { backgroundColor: colors.block }]}
      >
        <Text style={[styles.secondaryText, { color: colors.text }]}>Start a conversation</Text>
      </Pressable>

      <View style={[styles.row, { backgroundColor: colors.block }]}>
        <Text style={[styles.rowText, { color: colors.text }]}>
          {identified ? `Signed in as ${DEMO_USER.name} (${DEMO_USER.userId})` : "Anonymous visitor"}
        </Text>
        <Switch value={identified} onValueChange={onIdentified} />
      </View>
      <View style={[styles.row, { backgroundColor: colors.block }]}>
        <Text style={[styles.rowText, { color: colors.text }]}>Français</Text>
        <Switch value={locale === "fr"} onValueChange={(fr) => onLocale(fr ? "fr" : "en")} />
      </View>
      <Text style={[styles.muted, { color: colors.muted }]}>
        Unread replies stay live app-wide for signed-in users. Visitors connect when the messenger first opens.
      </Text>
    </SafeAreaView>
  );
}

const LIGHT = { background: "#FFFFFF", block: "#F3F4F6", text: "#111827", muted: "#6B7280" };
const DARK = { background: "#0B0B0F", block: "#1C1C22", text: "#F4F4F5", muted: "#A1A1AA" };

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: 20, paddingTop: 24, gap: 12 },
  title: { fontSize: 28, fontWeight: "700" },
  muted: { fontSize: 14 },
  primary: {
    marginTop: 12,
    minHeight: 54,
    borderRadius: 16,
    backgroundColor: "#4F46E5",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  primaryText: { color: "#FFFFFF", fontSize: 17, fontWeight: "700" },
  badge: {
    minWidth: 24,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
  },
  badgeText: { color: "#4F46E5", fontSize: 13, fontWeight: "800" },
  secondary: { minHeight: 50, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  secondaryText: { fontSize: 16, fontWeight: "600" },
  row: { minHeight: 56, borderRadius: 16, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 12 },
  rowText: { flex: 1, fontSize: 16 },
});
