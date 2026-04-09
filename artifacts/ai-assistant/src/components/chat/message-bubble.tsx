import { useState, useEffect, useRef } from "react";
import { format } from "date-fns";
import { Bot, User } from "lucide-react";
import { cn } from "@/lib/utils";

interface MessageBubbleProps {
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  isStreaming?: boolean;
}

export function MessageBubble({ role, content, createdAt, isStreaming }: MessageBubbleProps) {
  const isUser = role === "user";

  return (
    <div
      className={cn(
        "flex w-full gap-4 py-4 px-4 sm:px-6 md:px-8 group transition-colors animate-in fade-in slide-in-from-bottom-2 duration-300",
        isUser ? "bg-transparent" : "bg-sidebar/50"
      )}
    >
      <div
        className={cn(
          "flex h-8 w-8 shrink-0 select-none items-center justify-center rounded-lg border shadow-sm",
          isUser
            ? "bg-primary text-primary-foreground border-primary"
            : "bg-background text-foreground border-border"
        )}
      >
        {isUser ? <User className="h-5 w-5" /> : <Bot className="h-5 w-5 text-primary" />}
      </div>

      <div className="flex-1 space-y-2 overflow-hidden px-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">
            {isUser ? "You" : "AI Assistant"}
          </span>
          <span className="text-xs text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
            {format(new Date(createdAt), "h:mm a")}
          </span>
        </div>
        
        <div className="prose prose-sm md:prose-base dark:prose-invert max-w-none prose-p:leading-relaxed prose-pre:bg-sidebar-accent prose-pre:text-sidebar-accent-foreground break-words">
          {content ? (
            // A simple renderer for now - we would normally use react-markdown
            content.split("\n").map((line, i) => (
              <p key={i} className="min-h-[1.5rem]">{line}</p>
            ))
          ) : (
            isStreaming && (
              <span className="flex items-center gap-1 h-6">
                <span className="h-2 w-2 rounded-full bg-primary/40 animate-pulse" />
                <span className="h-2 w-2 rounded-full bg-primary/40 animate-pulse delay-75" />
                <span className="h-2 w-2 rounded-full bg-primary/40 animate-pulse delay-150" />
              </span>
            )
          )}
        </div>
      </div>
    </div>
  );
}
