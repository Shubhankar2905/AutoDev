import { inngest } from "./client";
import { gemini, createAgent, createTool, createNetwork } from "@inngest/agent-kit";
import { Sandbox } from "@e2b/code-interpreter";
import { getSandboxURL, lastAssistantTextMessageContent } from "./utils";
import z from "zod";
import { stderr, stdout } from "process";
import { PROMPT } from "@/prompt";
export const helloWorld = inngest.createFunction(
  { id: "hello-world" },
  { event: "test/hello.world" },
  async ({ event, step }) => {
    const sandboxId = await step.run("get-sandbox-id", async () => {
      const sandbox = await Sandbox.create("vibe-nextjs-shubh-2");
      return sandbox.sandboxId;
    });
    const codeagent = createAgent({
      name: "code-agent",
      system:
        PROMPT,
      model: gemini({
        model: "gemini-2.5-flash",
      }),
      tools: [
        createTool({
          name: "terminal",
          description: "Use terminal to run commands",
          parameters: z.object({
            command: z.string(),
          }),
          handler: async ({ command }, { step }) => {
            return await step?.run("terminal", async () => {
              const buffers = { stdout: "", stderr: "" };
              try {
                const sandbox = await getSandboxURL(sandboxId);
                const result = await sandbox.commands.run(command, {
                  onStdout: (data: string) => {
                    buffers.stdout += data;
                  },
                  onStderr: (data: string) => {
                    buffers.stderr += data;
                  },
                });
                return result.stdout;
              } catch (error) {
                console.error(
                  `command failed ${error} \n stdout:${buffers.stdout} \n stderr:${buffers.stderr}`
                );
                return `command failed ${error} \n stdout:${buffers.stdout} \n stderr:${buffers.stderr}`;
              }
            });
          },
        }),
        createTool({
          name:"createOrUpdateFiles",
          description:"Create or update files in the sandbox",
          parameters: z.object({
            files:z.array(
              z.object({
                path:z.string(),
                content:z.string(),
              }),
            )
          }),
          handler: async (
              {files},
              {step,network}
          )=>{
            const newFiles = await step?.run("createOrUpdateFiles",async()=>{
              try {
                const updatedFiles = network.state.data.files || {};
                const sandbox = await getSandboxURL(sandboxId);
                for(const file of files){
                  await sandbox.files.write(file.path,file.content)
                  updatedFiles[file.path]=file.content;
                }

                return updatedFiles;
              } catch (error) {
                console.log("Error in updat or creating files");
                console.error(`${error}`)
                return "Error in updating files" + error;
              }
            });

            if(typeof newFiles === "object"){
              network.state.data.files = newFiles;
            }
          }
        }),
        createTool({
          name:"readFiles",
          description:"Read files from the sandbox",
          parameters:z.object({
            files:z.array(z.string()),
          }),
          handler: async({files},{step})=>{
            return await step?.run("readFiles",async()=>{
              try {
                const sandbox = await getSandboxURL(sandboxId);
                const contents = [];
                for(const file of files){
                  const content = await sandbox.files.read(file);
                  contents.push({path:file,content});
                }
                return JSON.stringify(contents);
              } catch (error) {
                return "Error in readfiles,error"+error;
              }
            })
          }
        })
      ],
      lifecycle:{
        onResponse : async({result,network})=>{
          const lastAssistantMessageText= lastAssistantTextMessageContent(result);
          if(lastAssistantMessageText && network){
            if(lastAssistantMessageText.includes("<task_summary>")){
                network.state.data.summary = lastAssistantMessageText;
            }
          }
          return result;
        }
      },
    });

    const network = createNetwork({
      name:"coding-agent-network",
      agents:[codeagent],
      maxIter:15,
      router:async ({network})=>{
        const summary = network.state.data.summary;

        if(summary)
          return;

        return codeagent;
      }
    })
    const { output } = await codeagent.run(
      `write the following code snippet: ${event.data.value}`
    );

    const result = await network.run(event.data.value);
    const sandboxURL = await step.run("get-sandbox-url", async () => {
      const sandbox = await getSandboxURL(sandboxId);
      const host = sandbox.getHost(3000);
      return `https://${host}`;
    });
    return { 
      url: sandboxURL ,
      title:"Fragment",
      files:result.state.data.files,
      summary:result.state.data.summary
    };
  }
);
