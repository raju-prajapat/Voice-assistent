import { useState, useEffect } from "react";
import { Sidebar } from "@/components/chat/sidebar";
import { ChatArea } from "@/components/chat/chat-area";
import { ChatInput } from "@/components/chat/chat-input";
import { useListOpenaiMessages, useGetOpenaiConversation } from "@workspace/api-client-react";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";

function AnimatedBackground() {
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
      <div className="absolute inset-0 bg-gradient-to-br from-[#0f0c29] via-[#302b63] to-[#24243e]" />
      <div className="blob blob-1" />
      <div className="blob blob-2" />
      <div className="blob blob-3" />
      <div className="blob blob-4" />
      <div className="stars" />
    </div>
  );
}

export default function Home() {
  const [currentConversationId, setCurrentConversationId] = useState<number | null>(null);
  const [streamingMessage, setStreamingMessage] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const { data: messagesData, refetch: refetchMessages, isLoading: isLoadingMessages } = useListOpenaiMessages(currentConversationId || 0, {
    query: { enabled: !!currentConversationId }
  });

  const { data: conversationData } = useGetOpenaiConversation(currentConversationId || 0, {
    query: { enabled: !!currentConversationId }
  });

  const [localMessages, setLocalMessages] = useState<any[]>([]);

  useEffect(() => {
    if (messagesData) {
      setLocalMessages(messagesData);
    }
  }, [messagesData]);

  const handleSendText = async (content: string) => {
    if (!currentConversationId) return;

    const userMsg = { id: `temp-${Date.now()}`, role: "user", content, createdAt: new Date().toISOString(), conversationId: currentConversationId };
    setLocalMessages(prev => [...prev, userMsg]);
    setStreamingMessage("");

    try {
      const response = await fetch(`/api/openai/conversations/${currentConversationId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content })
      });

      if (!response.ok) throw new Error('Network response was not ok');
      if (!response.body) throw new Error('No response body');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let streamedContent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.slice(6).trim();
            if (!dataStr) continue;
            try {
              const data = JSON.parse(dataStr);
              if (data.done) break;
              if (data.content) {
                streamedContent += data.content;
                setStreamingMessage(streamedContent);
              }
            } catch (e) {}
          }
        }
      }

      await refetchMessages();
    } catch (error) {
      console.error("Error streaming text", error);
    } finally {
      setStreamingMessage(null);
    }
  };

  const handleSendImage = async (base64: string, question: string) => {
    if (!currentConversationId) return;

    const userMsg = { id: `temp-${Date.now()}`, role: "user", content: `[Image] ${question}`, createdAt: new Date().toISOString(), conversationId: currentConversationId };
    setLocalMessages(prev => [...prev, userMsg]);
    setStreamingMessage("Analyzing image...");

    try {
      const res = await fetch("/api/openai/analyze-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: base64, question, conversationId: currentConversationId })
      });

      if (!res.ok) throw new Error('Failed to analyze image');
      const data = await res.json();
      await refetchMessages();

      if (!data.saved) {
        setLocalMessages(prev => [...prev, { id: `temp-ast-${Date.now()}`, role: "assistant", content: data.answer, createdAt: new Date().toISOString(), conversationId: currentConversationId }]);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setStreamingMessage(null);
    }
  };

  const handleVoiceTranscript = (text: string) => {
    setStreamingMessage(text);
  };

  const handleVoiceComplete = async (_transcript: string) => {
    setStreamingMessage(null);
    await refetchMessages();
  };

  return (
    <div className="flex h-screen w-full overflow-hidden relative">
      <AnimatedBackground />

      <Sidebar
        currentConversationId={currentConversationId}
        onSelectConversation={setCurrentConversationId}
        isMobileOpen={isSidebarOpen}
        onCloseMobile={() => setIsSidebarOpen(false)}
      />

      <main className="flex-1 flex flex-col h-full relative">
        <header className="h-14 flex items-center justify-between px-4 border-b border-white/10 shrink-0 bg-white/5 backdrop-blur-xl sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="md:hidden text-white/80 hover:text-white hover:bg-white/10" onClick={() => setIsSidebarOpen(true)}>
              <Menu className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <h1 className="font-semibold text-lg truncate text-white">
                {conversationData?.title || "Sakhi AI"}
              </h1>
            </div>
          </div>
          <span className="text-xs text-white/40 hidden sm:block">Hindi • English • Marwadi</span>
        </header>

        <ChatArea
          messages={localMessages}
          streamingMessage={streamingMessage}
          isLoading={isLoadingMessages}
        />

        <div className="shrink-0 bg-gradient-to-t from-black/40 via-black/20 to-transparent pt-4 backdrop-blur-sm">
          <ChatInput
            conversationId={currentConversationId || 0}
            onSendText={handleSendText}
            onSendImage={handleSendImage}
            isSending={streamingMessage !== null}
            onVoiceTranscript={handleVoiceTranscript}
            onVoiceComplete={handleVoiceComplete}
          />
        </div>
      </main>
    </div>
  );
}
