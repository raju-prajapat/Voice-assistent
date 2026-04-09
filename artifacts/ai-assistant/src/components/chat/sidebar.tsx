import { useState, useEffect, useRef, useCallback } from "react";
import { Plus, Trash2, MessageSquare, Menu, Settings } from "lucide-react";
import { useListOpenaiConversations, useCreateOpenaiConversation, useDeleteOpenaiConversation } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface SidebarProps {
  currentConversationId: number | null;
  onSelectConversation: (id: number) => void;
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export function Sidebar({ currentConversationId, onSelectConversation, isMobileOpen, onCloseMobile }: SidebarProps) {
  const { data: conversations, isLoading } = useListOpenaiConversations();
  const createConversation = useCreateOpenaiConversation();
  const deleteConversation = useDeleteOpenaiConversation();
  const queryClient = useQueryClient();

  const handleCreate = () => {
    createConversation.mutate(
      { data: { title: "New Chat" } },
      {
        onSuccess: (data) => {
          queryClient.invalidateQueries({ queryKey: ["/api/openai/conversations"] });
          onSelectConversation(data.id);
          if (onCloseMobile) onCloseMobile();
        },
      }
    );
  };

  const handleDelete = (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    deleteConversation.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["/api/openai/conversations"] });
          if (currentConversationId === id) {
            onSelectConversation(0); // Will auto-select the next one in the parent component
          }
        },
      }
    );
  };

  // Auto-create on load if none exist
  useEffect(() => {
    if (conversations && conversations.length === 0 && !isLoading && !createConversation.isPending) {
      handleCreate();
    } else if (conversations && conversations.length > 0 && currentConversationId === null) {
      onSelectConversation(conversations[0].id);
    }
  }, [conversations, isLoading, currentConversationId]);

  const sidebarContent = (
    <div className="flex h-full flex-col bg-sidebar border-r border-sidebar-border w-64 md:w-72">
      <div className="p-4 pt-6">
        <Button onClick={handleCreate} className="w-full justify-start gap-2 h-12 text-sm font-medium rounded-xl transition-all active:scale-[0.98]" variant="default">
          <Plus className="h-4 w-4" />
          Start New Chat
        </Button>
      </div>

      <div className="flex-1 overflow-hidden px-3">
        <ScrollArea className="h-full">
          <div className="space-y-1 pb-4">
            {conversations?.map((conv) => (
              <div
                key={conv.id}
                onClick={() => {
                  onSelectConversation(conv.id);
                  if (onCloseMobile) onCloseMobile();
                }}
                className={cn(
                  "group flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors text-sm",
                  currentConversationId === conv.id
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                    : "text-sidebar-foreground hover:bg-sidebar-accent/50"
                )}
              >
                <div className="flex items-center gap-3 overflow-hidden">
                  <MessageSquare className="h-4 w-4 shrink-0 opacity-70" />
                  <span className="truncate">{conv.title}</span>
                </div>
                <button
                  onClick={(e) => handleDelete(e, conv.id)}
                  className="opacity-0 group-hover:opacity-100 hover:text-destructive transition-opacity shrink-0 p-1 rounded-md"
                  disabled={deleteConversation.isPending}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>
      <div className="p-4 border-t border-sidebar-border">
         <div className="flex items-center gap-3 p-2 rounded-lg text-sm text-sidebar-foreground">
            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
               <Settings className="h-4 w-4 text-primary" />
            </div>
            <span className="font-medium">Settings</span>
         </div>
      </div>
    </div>
  );

  if (isMobileOpen !== undefined) {
    return (
      <>
        {isMobileOpen && (
          <div className="fixed inset-0 bg-black/20 z-40 md:hidden" onClick={onCloseMobile} />
        )}
        <div
          className={cn(
            "fixed inset-y-0 left-0 z-50 transform transition-transform duration-300 ease-in-out md:hidden",
            isMobileOpen ? "translate-x-0" : "-translate-x-full"
          )}
        >
          {sidebarContent}
        </div>
        <div className="hidden md:block h-full">{sidebarContent}</div>
      </>
    );
  }

  return sidebarContent;
}
