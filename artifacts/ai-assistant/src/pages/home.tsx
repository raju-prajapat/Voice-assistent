import { useState, useEffect } from "react";
import { Sidebar } from "@/components/chat/sidebar";
import { ChatArea } from "@/components/chat/chat-area";
import { ChatInput } from "@/components/chat/chat-input";
import { useListOpenaiMessages, useGetOpenaiConversation } from "@workspace/api-client-react";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";

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

  // Local optimistic state for messages while waiting for API
  const [localMessages, setLocalMessages] = useState<any[]>([]);

  useEffect(() => {
    if (messagesData) {
      setLocalMessages(messagesData);
    }
  }, [messagesData]);

  const handleSendText = async (content: string) => {
    if (!currentConversationId) return;

    // Optimistic user message
    const tempUserId = `temp-${Date.now()}`;
    const userMsg = { id: tempUserId, role: "user", content, createdAt: new Date().toISOString(), conversationId: currentConversationId };
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
              if (data.done) {
                break;
              }
              if (data.content) {
                streamedContent += data.content;
                setStreamingMessage(streamedContent);
              }
            } catch (e) {
              console.error("Error parsing SSE JSON", e);
            }
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

    // Optimistic user message
    const tempUserId = `temp-${Date.now()}`;
    const userMsg = { id: tempUserId, role: "user", content: `[Attached Image] ${question}`, createdAt: new Date().toISOString(), conversationId: currentConversationId };
    setLocalMessages(prev => [...prev, userMsg]);
    setStreamingMessage("");

    try {
      const res = await fetch("/api/openai/analyze-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: base64, question, conversationId: currentConversationId })
      });
      
      if (!res.ok) throw new Error('Failed to analyze image');
      const data = await res.json();
      
      // The backend probably doesn't save to the DB in this simplified analyze-image endpoint,
      // but in a real app it should. We'll just refresh.
      await refetchMessages();
      
      // If it doesn't save automatically, we'd add it optimistically or ensure the backend does
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

  const handleVoiceComplete = async (transcript: string) => {
    setStreamingMessage(null);
    await refetchMessages();
  };

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden">
      <Sidebar 
        currentConversationId={currentConversationId} 
        onSelectConversation={setCurrentConversationId} 
        isMobileOpen={isSidebarOpen}
        onCloseMobile={() => setIsSidebarOpen(false)}
      />

      <main className="flex-1 flex flex-col h-full relative">
        <header className="h-14 flex items-center justify-between px-4 border-b shrink-0 bg-background/80 backdrop-blur-md sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setIsSidebarOpen(true)}>
              <Menu className="h-5 w-5" />
            </Button>
            <h1 className="font-semibold text-lg truncate">
              {conversationData?.title || "New Chat"}
            </h1>
          </div>
        </header>

        <ChatArea 
          messages={localMessages} 
          streamingMessage={streamingMessage} 
          isLoading={isLoadingMessages} 
        />

        <div className="shrink-0 bg-gradient-to-t from-background via-background to-transparent pt-4">
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
