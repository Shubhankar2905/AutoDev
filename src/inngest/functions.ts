import { inngest } from "./client";
import { gemini, createAgent } from "@inngest/agent-kit";
import {Sandbox} from "@e2b/code-interpreter";
import { getSandboxURL } from "./utils";
export const helloWorld = inngest.createFunction(
  { id: "hello-world" },
  { event: "test/hello.world" },
  async ({ event,step }) => {
    const sandboxId = await step.run("get-sandbox-id",async()=>{
      const sandbox = await Sandbox.create("vibe-nextjs-shubh-2");;
      return sandbox.sandboxId;
    })
    const summarizer = createAgent({
      name: "code-agent",
      system: "You are an expert Next.js developer. You write readable,maintainable code,you write simple next.js and react code .",
      model: gemini({
        model: "gemini-2.5-flash",
      }),
    });

    const { output } = await summarizer.run(
      `Summarize the following text: ${event.data.value}`
    );
    const sandboxURL = await step.run("get-sandbox-url",async ()=>{
      const sandbox = await getSandboxURL(sandboxId);
      const host = sandbox.getHost(3000);
      return `https://${host}`;
    })
    return { output,sandboxURL };
  }
);
