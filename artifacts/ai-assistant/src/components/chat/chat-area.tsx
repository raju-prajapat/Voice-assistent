import { useEffect, useRef } from "react";
import { MessageBubble } from "./message-bubble";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bot } from "lucide-react";

interface Message {
  id: number | string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

interface ChatAreaProps {
  messages: Message[];
  streamingMessage: string | null;
  isLoading: boolean;
}

export function ChatArea({ messages, streamingMessage, isLoading }: ChatAreaProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamingMessage]);

  if (!messages || messages.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center animate-in fade-in duration-500">
        <div className="h-16 w-16 bg-primary/10 text-primary rounded-full flex items-center justify-center mb-6 shadow-sm">
          <Bot className="h-8 w-8" />
        </div>
        <h2 className="text-2xl font-bold text-foreground mb-2">How can I help you today?</h2>
        <p className="text-muted-foreground max-w-md">
          I'm your personal AI companion. We can chat via text, voice, or you can share images with me for analysis.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto" ref={scrollRef}>
      <div className="flex flex-col pb-6 max-w-3xl mx-auto w-full">
        {messages.map((msg, i) => (
          <MessageBubble
            key={msg.id}
            role={msg.role}
            content={msg.content}
            createdAt={msg.createdAt}
          />
        ))}
        {streamingMessage !== null && (
          <MessageBubble
            role="assistant"
            content={streamingMessage}
            createdAt={new Date().toISOString()}
            isStreaming={true}
          />
        )}
        {isLoading && streamingMessage === null && (
          <MessageBubble
            role="assistant"
            content=""
            createdAt={new Date().toISOString()}
            isStreaming={true}
          />
        )}
      </div>
    </div>
  );
}
