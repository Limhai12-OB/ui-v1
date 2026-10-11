"use client";

import { useEffect, useState } from "react";
import { Loader2, MessageSquare, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import type { AdvisorConversation } from "@/types";
import { aiService } from "@/lib/api";
import { useAction } from "@/hooks/use-action";
import { formatDateTime } from "@/lib/date";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/forms/field";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

interface Props {
  conversations: AdvisorConversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDeleted: (id: string) => void;
  disabled?: boolean;
}

export function ConversationList({ conversations, activeId, onSelect, onNew, onDeleted, disabled }: Props) {
  const [renaming, setRenaming] = useState<AdvisorConversation | undefined>();
  const [deleting, setDeleting] = useState<AdvisorConversation | undefined>();
  const remove = useAction((id: string) => aiService.deleteConversation(id), { success: "Conversation deleted" });
  const sorted = [...conversations].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 border-b px-3 py-3">
        <h2 className="text-sm font-semibold">Conversations</h2>
        <Button size="sm" variant="outline" onClick={onNew} disabled={disabled}>
          <Plus /> New chat
        </Button>
      </div>
      <nav aria-label="Conversation history" className="min-h-0 flex-1 overflow-y-auto p-2">
        {sorted.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
            <MessageSquare className="size-5 text-muted-foreground" aria-hidden />
            <p className="text-sm font-medium">No conversations yet</p>
            <p className="text-xs text-muted-foreground">Questions you ask are saved here so you can come back to them.</p>
          </div>
        ) : (
          <ul className="space-y-0.5">
            {sorted.map((c) => {
              const active = c.id === activeId;
              return (
                <li key={c.id} className={cn("group flex items-center gap-1 rounded-lg pr-1 transition-colors", active ? "bg-primary-light" : "hover:bg-muted")}>
                  <button
                    type="button"
                    onClick={() => onSelect(c.id)}
                    aria-current={active ? "page" : undefined}
                    className="min-w-0 flex-1 rounded-lg px-2.5 py-2 text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    <span className={cn("block truncate text-sm", active ? "font-medium text-primary" : "text-foreground")}>{c.title}</span>
                    <span className="block text-[11px] text-muted-foreground tabular-nums">
                      {formatDateTime(c.updatedAt)} · {c.messages.filter((m) => m.role === "user").length} question{c.messages.filter((m) => m.role === "user").length === 1 ? "" : "s"}
                    </span>
                  </button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon-xs" aria-label={`Actions for ${c.title}`} className="opacity-70 group-hover:opacity-100 focus-visible:opacity-100">
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => setRenaming(c)}>
                        <Pencil /> Rename
                      </DropdownMenuItem>
                      <DropdownMenuItem variant="destructive" disabled={disabled && active} onSelect={() => setDeleting(c)}>
                        <Trash2 /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </li>
              );
            })}
          </ul>
        )}
      </nav>
      <RenameDialog conversation={renaming} onOpenChange={(o) => !o && setRenaming(undefined)} />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(undefined)}
        title={`Delete “${deleting?.title}”?`}
        description="This removes the conversation and its answers from your history. Your financial records are not affected."
        confirmLabel="Delete conversation"
        destructive
        onConfirm={async () => {
          const id = deleting!.id;
          await remove.run(id);
          onDeleted(id);
        }}
      />
    </div>
  );
}

function RenameDialog({ conversation, onOpenChange }: { conversation?: AdvisorConversation; onOpenChange: (o: boolean) => void }) {
  const [title, setTitle] = useState("");
  useEffect(() => {
    if (conversation) setTitle(conversation.title);
  }, [conversation]);
  const save = useAction((id: string, t: string) => aiService.renameConversation(id, t), { success: "Conversation renamed", onSuccess: () => onOpenChange(false) });
  const trimmed = title.trim();
  return (
    <Dialog open={!!conversation} onOpenChange={(o) => !save.pending && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (conversation && trimmed) save.fire(conversation.id, trimmed);
          }}
        >
          <DialogHeader>
            <DialogTitle>Rename conversation</DialogTitle>
            <DialogDescription>Give this conversation a name you'll recognize later.</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Field label="Title" htmlFor="conv-title" required error={title && !trimmed ? "Enter a title" : undefined} helper={`${title.length}/80`}>
              <Input id="conv-title" autoFocus maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} />
            </Field>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={save.pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={!trimmed || trimmed === conversation?.title || save.pending}>
              {save.pending && <Loader2 className="animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
