import { useCallback, useState } from "react";
import { useSupportCore } from "../provider/support-context";

export interface HandoffState {
  pending: boolean;
  failed: boolean;
  handoff: () => void;
}

/** "Talk to a human": stops the AI assistant; the updated conversation (aiActive false) goes into the store. */
export function useHandoff(conversationId: string): HandoffState {
  const { client, dispatch } = useSupportCore();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  const handoff = useCallback(() => {
    if (pending) return;
    setPending(true);
    setFailed(false);
    client
      .handoff(conversationId)
      .then((conversation) => dispatch({ type: "conversation", conversation }))
      .catch(() => setFailed(true))
      .finally(() => setPending(false));
  }, [client, conversationId, dispatch, pending]);

  return { pending, failed, handoff };
}
