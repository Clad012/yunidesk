import { Text, View } from "react-native";
import { isAwayNow, replyStatusLabel, type ContactConversation } from "yunidesk";
import { conversationTitle } from "../logic/conversation-labels";
import { useMessengerState, useSupportCore } from "../provider/support-context";
import { TeamAvatars } from "../home/team-avatars";
import { AssistantAvatar } from "../ui/assistant-avatar";
import { Avatar } from "../ui/avatar";
import { ScreenHeader } from "../ui/screen-header";

export interface ConversationHeaderProps {
  conversation: ContactConversation | null;
  onBack?: () => void;
  onClose?: () => void;
  safeTop: boolean;
}

/** The teammate who answered (or the team), with online state or the usual reply time. */
export function ConversationHeader({ conversation, onBack, onClose, safeTop }: ConversationHeaderProps) {
  const { config, theme, strings, locale, connection } = useSupportCore();
  const { teamOnline: online } = useMessengerState();
  const teamOnline = online && !isAwayNow(config?.availability);
  const agent = conversation?.participants[0] ?? null;
  const title = conversation ? conversationTitle(conversation, config, strings) : (config?.teamName ?? strings.team);
  const subtitle =
    connection === "reconnecting"
      ? strings.connectionLost
      : teamOnline
        ? strings.online
        : config
          ? replyStatusLabel(strings, config, Date.now(), locale)
          : null;
  return (
    <ScreenHeader theme={theme} strings={strings} onBack={onBack} onClose={onClose} safeTop={safeTop}>
      <View
        style={{ flexDirection: "row", alignItems: "center", gap: 10, flexShrink: 1 }}
        accessible
        accessibilityRole="header"
        accessibilityLabel={[title, subtitle].filter(Boolean).join(", ")}
      >
        {agent?.isBot ? (
          <AssistantAvatar badge={strings.aiBadge} size={36} theme={theme} />
        ) : agent ? (
          <Avatar agent={agent} size={36} theme={theme} />
        ) : config && config.agents.length > 0 ? (
          <TeamAvatars agents={config.agents} theme={theme} size={28} ringColor={theme.background} />
        ) : null}
        <View style={{ flexShrink: 1 }}>
          <Text style={{ color: theme.text, fontSize: 16, fontWeight: "700" }} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
              {teamOnline && connection !== "reconnecting" ? (
                <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: theme.online }} />
              ) : null}
              <Text style={{ color: theme.textMuted, fontSize: 12, flexShrink: 1 }} numberOfLines={1}>
                {subtitle}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    </ScreenHeader>
  );
}
