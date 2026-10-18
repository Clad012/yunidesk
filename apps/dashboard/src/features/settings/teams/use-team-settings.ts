import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { AssignmentSettings } from "yunidesk";
import { copy } from "@/lib/copy";
import { errorMessage } from "@/lib/api";
import { endpoints, queryKeys, type AssignmentInput } from "@/lib/endpoints";

const onError = (error: Error) => toast.error(errorMessage(error, copy.common.somethingWrong));

export function useAssignment() {
  return useQuery({ queryKey: queryKeys.assignment, queryFn: endpoints.assignment });
}

/** Create, rename and delete teams; add and remove members. Conversations refetch so their team follows. */
export function useTeamMutations() {
  const qc = useQueryClient();
  const refresh = (withConversations: boolean) => {
    void qc.invalidateQueries({ queryKey: queryKeys.teams });
    if (withConversations) {
      void qc.invalidateQueries({ queryKey: queryKeys.assignment });
      void qc.invalidateQueries({ queryKey: queryKeys.conversationLists });
      void qc.invalidateQueries({ queryKey: ["conversation"] });
    }
  };
  const create = useMutation({
    mutationFn: (name: string) => endpoints.createTeam(name),
    onSuccess: () => (toast.success(copy.teams.created), refresh(false)),
  });
  const rename = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => endpoints.renameTeam(id, name),
    onSuccess: () => (toast.success(copy.teams.renamed), refresh(true)),
  });
  const remove = useMutation({
    mutationFn: endpoints.deleteTeam,
    onSuccess: () => (toast.success(copy.teams.deleted), refresh(true)),
    onError,
  });
  const addMember = useMutation({
    mutationFn: ({ teamId, agentId }: { teamId: string; agentId: string }) => endpoints.addTeamMember(teamId, agentId),
    onSuccess: () => refresh(false),
    onError,
  });
  const removeMember = useMutation({
    mutationFn: ({ teamId, agentId }: { teamId: string; agentId: string }) => endpoints.removeTeamMember(teamId, agentId),
    onSuccess: () => refresh(false),
    onError,
  });
  return { create, rename, remove, addMember, removeMember };
}

/** Saves rules and fallback together (the server replaces the whole ordered list). */
export function useSaveAssignment(successMessage: string = copy.assignment.saved) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AssignmentInput) => endpoints.saveAssignment(input),
    onSuccess: (result: AssignmentSettings) => {
      qc.setQueryData(queryKeys.assignment, result);
      toast.success(successMessage);
    },
    onError,
  });
}

export function toInput(settings: AssignmentSettings): AssignmentInput {
  return { rules: settings.rules, fallback: settings.fallback };
}
