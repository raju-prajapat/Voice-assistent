import { useState, useRef, useEffect } from "react";
import { Send, Mic, Image as ImageIcon, X, Loader2, StopCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useVoiceRecorder, useVoiceStream } from "@workspace/integrations-openai-ai-react";

interface ChatInputProps {
  conversationId: number;
  onSendText: (content: string) => Promise<void>;
  onSendImage: (base64: string, question: string) => Promise<void>;
  isSending: boolean;
  onVoiceTranscript?: (text: string) => void;
  onVoiceComplete?: (transcript: string) => void;
}

export function ChatInput({ 
  conversationId, 
  onSendText, 
  onSendImage, 
  isSending,
  onVoiceTranscript,
  onVoiceComplete
}: ChatInputProps) {
  const [text, setText] = useState("");
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [inputMode, setInputMode] = useState<"text" | "voice">("text");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { state: recordingState, startRecording, stopRecording } = useVoiceRecorder();
  const { streamVoiceResponse, playbackState } = useVoiceStream({
    workletPath: import.meta.env.BASE_URL + "audio-playback-worklet.js",
    onTranscript: (text, full) => {
      onVoiceTranscript?.(full);
    },
    onComplete: (transcript) => {
      onVoiceComplete?.(transcript);
    }
  });

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + "px";
    }
  }, [text]);

  const handleSubmit = async () => {
    if ((!text.trim() && !imagePreview) || isSending) return;

    if (imagePreview) {
      const b64 = imagePreview.split(",")[1] || imagePreview;
      setImagePreview(null);
      setText("");
      await onSendImage(b64, text || "What's in this image?");
    } else {
      const content = text.trim();
      setText("");
      await onSendText(content);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleImagePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      setImagePreview(event.target?.result as string);
    };
    reader.readAsDataURL(file);
    e.target.value = ''; // reset
  };

  const toggleRecording = async () => {
    if (recordingState === "recording") {
      const audioBlob = await stopRecording();
      await streamVoiceResponse(`/api/openai/conversations/${conversationId}/voice-messages`, audioBlob);
    } else {
      await startRecording();
    }
  };

  return (
    <div className="w-full max-w-3xl mx-auto px-4 pb-6 pt-2">
      <div className="flex gap-2 mb-2 justify-center">
        <Button 
          variant={inputMode === "text" ? "secondary" : "ghost"} 
          size="sm" 
          onClick={() => setInputMode("text")}
          className="rounded-full text-xs h-7"
        >
          Text
        </Button>
        <Button 
          variant={inputMode === "voice" ? "secondary" : "ghost"} 
          size="sm" 
          onClick={() => setInputMode("voice")}
          className="rounded-full text-xs h-7"
        >
          Voice
        </Button>
      </div>

      <div className="relative bg-background border shadow-sm rounded-2xl overflow-hidden focus-within:ring-1 focus-within:ring-ring transition-shadow">
        {imagePreview && (
          <div className="p-3 pb-0">
            <div className="relative inline-block">
              <img src={imagePreview} alt="Upload preview" className="h-24 w-auto rounded-lg object-cover border" />
              <button 
                onClick={() => setImagePreview(null)}
                className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-1 shadow-md hover:bg-destructive/90"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          </div>
        )}

        {inputMode === "text" ? (
          <div className="flex items-end gap-2 p-3">
            <input 
              type="file" 
              accept="image/*" 
              className="hidden" 
              ref={fileInputRef} 
              onChange={handleImagePick}
            />
            <Button 
              type="button" 
              variant="ghost" 
              size="icon" 
              className="shrink-0 text-muted-foreground hover:text-foreground h-9 w-9 rounded-full"
              onClick={() => fileInputRef.current?.click()}
              disabled={isSending}
            >
              <ImageIcon className="h-5 w-5" />
            </Button>
            
            <Textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={imagePreview ? "Ask about this image..." : "Message AI Assistant..."}
              className="min-h-[40px] max-h-[200px] w-full resize-none border-0 focus-visible:ring-0 p-2 py-1.5 shadow-none bg-transparent m-0"
              disabled={isSending}
              rows={1}
            />
            
            <Button 
              type="button" 
              size="icon" 
              className={cn(
                "shrink-0 h-9 w-9 rounded-full transition-all duration-200", 
                text.trim() || imagePreview ? "bg-primary text-primary-foreground hover:bg-primary/90" : "bg-muted text-muted-foreground hover:bg-muted"
              )}
              onClick={handleSubmit}
              disabled={(!text.trim() && !imagePreview) || isSending}
            >
              {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center p-8">
            <Button
              type="button"
              size="icon"
              className={cn(
                "h-20 w-20 rounded-full transition-all duration-300 shadow-lg",
                recordingState === "recording" 
                  ? "bg-destructive hover:bg-destructive/90 animate-pulse scale-110" 
                  : playbackState === "playing"
                    ? "bg-primary/50 hover:bg-primary/60 scale-105"
                    : "bg-primary hover:bg-primary/90 hover:scale-105"
              )}
              onClick={toggleRecording}
            >
              {recordingState === "recording" ? (
                <StopCircle className="h-10 w-10 text-white" />
              ) : playbackState === "playing" ? (
                <Loader2 className="h-8 w-8 text-white animate-spin" />
              ) : (
                <Mic className="h-8 w-8 text-white" />
              )}
            </Button>
            <p className="text-sm font-medium mt-6 text-muted-foreground">
              {recordingState === "recording" 
                ? "Listening..." 
                : playbackState === "playing"
                  ? "Assistant is speaking..."
                  : "Tap to record"}
            </p>
          </div>
        )}
      </div>
      <div className="text-center mt-2">
        <p className="text-xs text-muted-foreground">AI can make mistakes. Consider verifying important information.</p>
      </div>
    </div>
  );
}
