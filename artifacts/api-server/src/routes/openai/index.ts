import { Router } from "express";
import { db } from "@workspace/db";
import { conversations, messages, type InsertMessage } from "@workspace/db";
import { openai } from "@workspace/integrations-openai-ai-server";
import { voiceChatStream, ensureCompatibleFormat } from "@workspace/integrations-openai-ai-server/audio";
import { generateImageBuffer } from "@workspace/integrations-openai-ai-server/image";
import {
  CreateOpenaiConversationBody,
  SendOpenaiMessageBody,
  SendOpenaiVoiceMessageBody,
  GenerateOpenaiImageBody,
  AnalyzeOpenaiImageBody,
  GetOpenaiConversationParams,
  DeleteOpenaiConversationParams,
  SendOpenaiMessageParams,
  SendOpenaiVoiceMessageParams,
  ListOpenaiMessagesParams,
} from "@workspace/api-zod";
import { eq, desc } from "drizzle-orm";

const router = Router();

router.get("/conversations", async (req, res) => {
  const rows = await db.select().from(conversations).orderBy(desc(conversations.createdAt));
  res.json(rows);
});

router.post("/conversations", async (req, res) => {
  const parsed = CreateOpenaiConversationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }
  const [created] = await db.insert(conversations).values({ title: parsed.data.title }).returning();
  res.status(201).json(created);
});

router.get("/conversations/:id", async (req, res) => {
  const params = GetOpenaiConversationParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const conv = await db.query.conversations.findFirst({
    where: eq(conversations.id, params.data.id),
  });
  if (!conv) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const msgs = await db.select().from(messages).where(eq(messages.conversationId, conv.id)).orderBy(messages.createdAt);
  res.json({ ...conv, messages: msgs });
});

router.delete("/conversations/:id", async (req, res) => {
  const params = DeleteOpenaiConversationParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  await db.delete(messages).where(eq(messages.conversationId, params.data.id));
  const deleted = await db.delete(conversations).where(eq(conversations.id, params.data.id)).returning();
  if (deleted.length === 0) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.status(204).end();
});

router.get("/conversations/:id/messages", async (req, res) => {
  const params = ListOpenaiMessagesParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const msgs = await db.select().from(messages).where(eq(messages.conversationId, params.data.id)).orderBy(messages.createdAt);
  res.json(msgs);
});

router.post("/conversations/:id/messages", async (req, res) => {
  const params = SendOpenaiMessageParams.safeParse({ id: Number(req.params.id) });
  const body = SendOpenaiMessageBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }

  const conv = await db.query.conversations.findFirst({
    where: eq(conversations.id, params.data.id),
  });
  if (!conv) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  const history = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, params.data.id))
    .orderBy(messages.createdAt);

  await db.insert(messages).values({
    conversationId: params.data.id,
    role: "user",
    content: body.data.content,
  } as InsertMessage);

  const chatMessages = [
    {
      role: "system" as const,
      content:
        "You are a helpful, friendly personal AI assistant. You can help with study questions, general knowledge, homework, coding, science, math, history, and friendly conversation. Be warm, engaging, and thorough in your answers. When answering study-related questions, provide clear explanations with examples. Speak in a friendly, conversational tone.",
    },
    ...history.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    { role: "user" as const, content: body.data.content },
  ];

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  let fullResponse = "";

  const stream = await openai.chat.completions.create({
    model: "gpt-5.2",
    max_completion_tokens: 8192,
    messages: chatMessages,
    stream: true,
  });

  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content;
    if (content) {
      fullResponse += content;
      res.write(`data: ${JSON.stringify({ content })}\n\n`);
    }
  }

  await db.insert(messages).values({
    conversationId: params.data.id,
    role: "assistant",
    content: fullResponse,
  } as InsertMessage);

  res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
  res.end();
});

router.post("/conversations/:id/voice-messages", async (req, res) => {
  const params = SendOpenaiVoiceMessageParams.safeParse({ id: Number(req.params.id) });
  const body = SendOpenaiVoiceMessageBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }

  const conv = await db.query.conversations.findFirst({
    where: eq(conversations.id, params.data.id),
  });
  if (!conv) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  const audioBuffer = Buffer.from(body.data.audio, "base64");
  const { buffer, format } = await ensureCompatibleFormat(audioBuffer);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const stream = await voiceChatStream(buffer, "alloy", format);

  let assistantTranscript = "";
  let userTranscript = "";

  for await (const event of stream) {
    if (event.type === "transcript") {
      assistantTranscript += event.data;
    }
    if (event.type === "user_transcript") {
      userTranscript += event.data;
    }
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  }

  await db.insert(messages).values([
    {
      conversationId: params.data.id,
      role: "user",
      content: userTranscript || "[Voice message]",
    } as InsertMessage,
    {
      conversationId: params.data.id,
      role: "assistant",
      content: assistantTranscript || "[Voice response]",
    } as InsertMessage,
  ]);

  res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
  res.end();
});

router.post("/generate-image", async (req, res) => {
  const parsed = GenerateOpenaiImageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }
  const buffer = await generateImageBuffer(parsed.data.prompt, (parsed.data.size as "1024x1024" | "512x512" | "256x256") ?? "1024x1024");
  res.json({ b64_json: buffer.toString("base64") });
});

router.post("/analyze-image", async (req, res) => {
  const parsed = AnalyzeOpenaiImageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const { imageBase64, question, conversationId } = parsed.data;

  const response = await openai.chat.completions.create({
    model: "gpt-5.2",
    max_completion_tokens: 8192,
    messages: [
      {
        role: "system",
        content:
          "You are a helpful AI assistant that analyzes images. Provide detailed, accurate, and educational answers about images. If the image contains text, equations, diagrams, or study materials, explain them thoroughly.",
      },
      {
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: { url: `data:image/jpeg;base64,${imageBase64}` },
          },
          {
            type: "text",
            text: question,
          },
        ],
      },
    ],
  });

  const answer = response.choices[0]?.message?.content ?? "I could not analyze this image.";

  if (conversationId) {
    await db.insert(messages).values([
      {
        conversationId,
        role: "user",
        content: `[Image uploaded] ${question}`,
      } as InsertMessage,
      {
        conversationId,
        role: "assistant",
        content: answer,
      } as InsertMessage,
    ]);
  }

  res.json({ answer });
});

export default router;
