import { useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import { format } from "yunidesk";
import { isValidEmail } from "../logic/email";
import { useSupportCore } from "../provider/support-context";

/** Asks an anonymous visitor for an email so the team's reply can reach them after they leave. */
export function EmailPromptCard() {
  const { client, contact, theme, strings } = useSupportCore();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (contact?.email) {
    return (
      <View
        style={{
          marginHorizontal: 16,
          marginVertical: 8,
          padding: 14,
          borderRadius: 18,
          backgroundColor: theme.surface,
        }}
      >
        <Text style={{ color: theme.textMuted, fontSize: 14, textAlign: "center" }}>
          {format(strings.emailSaved, { email: contact.email })}
        </Text>
      </View>
    );
  }

  const save = async () => {
    const value = email.trim();
    if (!isValidEmail(value)) {
      setError(strings.emailInvalid);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await client.updateContact({ email: value });
    } catch {
      setError(strings.loadError);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View
      style={{
        marginHorizontal: 16,
        marginVertical: 8,
        padding: 16,
        borderRadius: 20,
        backgroundColor: theme.surface,
        gap: 10,
      }}
    >
      <View style={{ gap: 2 }}>
        <Text style={{ color: theme.text, fontSize: 16, fontWeight: "700" }} accessibilityRole="header">
          {strings.emailPromptTitle}
        </Text>
        <Text style={{ color: theme.textMuted, fontSize: 14 }}>{strings.emailPromptBody}</Text>
      </View>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <TextInput
          value={email}
          onChangeText={(value) => {
            setEmail(value);
            if (error) setError(null);
          }}
          onSubmitEditing={save}
          placeholder={strings.emailPlaceholder}
          placeholderTextColor={theme.textMuted}
          accessibilityLabel={strings.emailPromptTitle}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType="emailAddress"
          returnKeyType="done"
          keyboardAppearance={theme.scheme}
          selectionColor={theme.brand}
          style={{
            flex: 1,
            minHeight: 44,
            borderRadius: 14,
            paddingHorizontal: 12,
            fontSize: 16,
            color: theme.text,
            backgroundColor: theme.background,
          }}
        />
        <Pressable
          onPress={save}
          disabled={busy}
          accessibilityRole="button"
          style={({ pressed }) => ({
            minWidth: 72,
            minHeight: 44,
            paddingHorizontal: 14,
            borderRadius: 14,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: theme.brand,
            opacity: pressed ? 0.8 : 1,
          })}
        >
          {busy ? (
            <ActivityIndicator color={theme.onBrand} />
          ) : (
            <Text style={{ color: theme.onBrand, fontSize: 15, fontWeight: "700" }}>{strings.emailSave}</Text>
          )}
        </Pressable>
      </View>
      {error ? (
        <Text style={{ color: theme.danger, fontSize: 13 }} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
    </View>
  );
}
