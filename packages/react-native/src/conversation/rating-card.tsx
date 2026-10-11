import { useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import type { ContactConversation, Rating, SupportStrings } from "yunidesk";
import { useSupportCore } from "../provider/support-context";
import { RatingFace } from "./rating-face";

type Score = Rating["score"];

const FACES: { score: Score; glyph: string; label: (s: SupportStrings) => string }[] = [
  { score: 1, glyph: "😞", label: (s) => s.rateBad },
  { score: 2, glyph: "😐", label: (s) => s.rateOkay },
  { score: 3, glyph: "😃", label: (s) => s.rateGreat },
];

export interface RatingCardProps {
  conversation: ContactConversation;
}

/** Shown under a resolved conversation: three faces, an optional comment, then a thank-you. */
export function RatingCard({ conversation }: RatingCardProps) {
  const { client, dispatch, theme, strings } = useSupportCore();
  const [score, setScore] = useState<Score | null>(null);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const rated = conversation.rating;

  const submit = async () => {
    if (!score || busy) return;
    setBusy(true);
    setFailed(false);
    try {
      const updated = await client.rate(conversation.id, {
        score,
        ...(comment.trim() ? { comment: comment.trim() } : {}),
      });
      dispatch({ type: "conversation", conversation: updated });
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  const chosen = rated?.score ?? score;
  return (
    <View
      style={{
        marginHorizontal: 16,
        marginVertical: 8,
        padding: 16,
        borderRadius: 20,
        backgroundColor: theme.surface,
        gap: 14,
      }}
    >
      <Text
        style={{ color: theme.text, fontSize: 16, fontWeight: "700", textAlign: "center" }}
        accessibilityRole="header"
      >
        {rated ? strings.rateThanks : strings.rateTitle}
      </Text>
      <View style={{ flexDirection: "row", justifyContent: "center", gap: 12 }} accessibilityRole="radiogroup">
        {FACES.map((face) => (
          <RatingFace
            key={face.score}
            glyph={face.glyph}
            label={face.label(strings)}
            selected={chosen === face.score}
            dimmed={chosen !== null && chosen !== face.score}
            disabled={!!rated || busy}
            theme={theme}
            onPress={() => setScore(face.score)}
          />
        ))}
      </View>
      {!rated && score ? (
        <>
          <TextInput
            value={comment}
            onChangeText={setComment}
            placeholder={strings.rateCommentPlaceholder}
            placeholderTextColor={theme.textMuted}
            accessibilityLabel={strings.rateCommentPlaceholder}
            multiline
            maxLength={1000}
            keyboardAppearance={theme.scheme}
            selectionColor={theme.accent}
            style={{
              minHeight: 44,
              maxHeight: 120,
              borderRadius: 14,
              paddingHorizontal: 12,
              paddingVertical: 10,
              fontSize: 16,
              color: theme.text,
              backgroundColor: theme.background,
            }}
          />
          {failed ? (
            <Text style={{ color: theme.danger, fontSize: 14, textAlign: "center" }}>{strings.loadError}</Text>
          ) : null}
          <Pressable
            onPress={submit}
            disabled={busy}
            accessibilityRole="button"
            style={({ pressed }) => ({
              minHeight: 46,
              borderRadius: 999,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: theme.accent,
              opacity: pressed ? 0.8 : 1,
            })}
          >
            {busy ? (
              <ActivityIndicator color={theme.onAccent} />
            ) : (
              <Text style={{ color: theme.onAccent, fontSize: 16, fontWeight: "700" }}>{strings.rateSubmit}</Text>
            )}
          </Pressable>
        </>
      ) : null}
    </View>
  );
}
