import OpenAI from "openai";
import { Message } from "@inngest/agent-kit";

const client = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

export function groq(model = "llama-3.3-70b-versatile") {
  return {
    async invoke(messages: Message[]) {

      const formattedMessages = messages.map((m) => {
        const role = m.role === "tool_result" ? "tool" : m.role;
        const content = "content" in m ? (typeof m.content === "string" ? m.content : JSON.stringify(m.content)) : "";
        return {
          role,
          content,
          ...("toolCallId" in m ? { tool_call_id: (m as any).toolCallId } : {}),
        };
      }) as any[];

      const response = await client.chat.completions.create({
        model,
        messages: formattedMessages,
      });

      return {
        type: "text",
        role: "ASSISTANT",
        content: response.choices[0].message.content ?? "",
      };
    },
  };
}