import { inngest } from "./client";
import { gemini, openai,createAgent, createTool, createNetwork, type Tool, Message, createState } from "@inngest/agent-kit";
import { getSandboxURL, lastAssistantTextMessageContent, parseAgentResponse } from "./utils";
import z from "zod";
import { FRAGMENT_TITLE_PROMPT, PROMPT,RESPONSE_PROMPT } from "@/prompt";
import { prisma } from "@/lib/prisma";
import { INVALID_PROMPT_MESSAGE, validatePrompt } from "@/lib/prompt-validator";
import { createAndRestoreSandbox } from "@/modules/projects/server/sandbox";

interface AgentState {
  summary:string;
  files:{[path:string]:string};

}

// const deepseekModel = openai({

//   model: "deepseek/deepseek-chat",
//   apiKey: process.env.OPENROUTER_API_KEY,
//   baseUrl: "https://openrouter.ai/api/v1",

// });

const deepseekModel = openai({

  model: "deepseek/deepseek-v4-flash",
  apiKey: process.env.OPENROUTER_API_KEY,
  baseUrl: "https://openrouter.ai/api/v1",
})

const openaiModel = openai({

  model: "openai/gpt-6-luna",
  apiKey: process.env.OPENROUTER_API_KEY,
  baseUrl: "https://openrouter.ai/api/v1",
})
// const deepseekModel = openai({

//   model: "openai/gpt-oss-120b",
//   apiKey: process.env.OPENROUTER_API_KEY,
//   baseUrl: "https://openrouter.ai/api/v1",

// });




export const codeAgentFunction = inngest.createFunction(
  {
    id: "code-agent",
    triggers: [
      {
        event: "code-agent/run",
      },
    ],
  },
  async ({ event, step }) => {
    const validation = await step.run("validate-prompt", async () => {
      return validatePrompt(event.data.value);
    });

    if (!validation.valid) {
      return { valid: false, error: INVALID_PROMPT_MESSAGE };
    }

    const sandboxId = await step.run("get-sandbox-id", async () => {
      const sandbox = await createAndRestoreSandbox({});
      return sandbox.sandboxId;
    });

    const previousMessages = await step.run("get-previous-messages", async () => {
      const formattedmessages:Message[]=[];
      const messages = await prisma.message.findMany({
        where:{
          projectId:event.data.projectId,
        },
        orderBy:{
          createdAt:"desc",
        }
      });

      for(const message of messages){
        formattedmessages.push({
          type:"text",
          role: message.role === "ASSISTANT" ? "assistant" : "user",
          content: message.content,
        })
      }
      return formattedmessages;
    });

    const state = createState<AgentState>({
      summary:"",
      files:{},
    },
    {
    messages:previousMessages,
    }
);

    const codeagent = createAgent<AgentState>({
      name: "code-agent",
      system:
        PROMPT,
      model: openaiModel,
      // model: gemini({
      //   model: "gemini-2.5-flash", 
      //   apiKey: process.env.GEMINI_API_KEY
        
      // }),
      tools: [
        createTool({
          name: "terminal",
          description: "Use terminal to run commands",
          parameters: z.object({
            command: z.string(),
          }),
          handler: async ({ command }, { step }) => {
            if (
              /\b(curl|wget|invoke-webrequest|invoke-restmethod|lynx|w3m)\b/i.test(
                command
              )
            ) {
              return "Web search and external content fetching are not allowed. Use known Unsplash image URLs directly in the generated website.";
            }

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
              {step,network}:Tool.Options<AgentState>
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

    const network = createNetwork<AgentState>({
      name:"coding-agent-network",
      agents:[codeagent],
      maxIter:15,
      defaultState: state,
      router:async ({network})=>{
        const summary = network.state.data.summary;

        if(summary)
          return;

        return codeagent;
      }
    })
    // const { output } = await codeagent.run(
    //   `write the following code snippet: ${event.data.value}`
    // );

    const result = await network.run(event.data.value,{state});

    const fragmentTitleGenerator = createAgent({
      name:"fragment-title-generator",
      system:FRAGMENT_TITLE_PROMPT,
      model: deepseekModel
      //  model:gemini({
      //   model: "gemini-2.5-flash", 
      //   apiKey: process.env.GEMINI_API_KEY
      // }),
    })
    const ResponseGenerator = createAgent({
      name:"response-generator",
      system:RESPONSE_PROMPT,
      model:deepseekModel
      // model:gemini({
      //   model: "gemini-2.5-flash", 
      //   apiKey: process.env.GEMINI_API_KEY
      // }),

    })

    const {output:fragmentTitleOutput} = await fragmentTitleGenerator.run(result.state.data.summary );
    const {output:responseMessageOutput} = await ResponseGenerator.run(result.state.data.summary );




    const isError = !result.state.data.summary || Object.keys(result.state.data.files || {}).length === 0; 

    const sandboxURL = await step.run("get-sandbox-url", async () => {
      const sandbox = await getSandboxURL(sandboxId);
      const host = sandbox.getHost(3000);
      return `https://${host}`;
    });
    
    await step.run("save-result",async ()=>{

      if(isError)
        return await prisma.message.create({
          data:{
            projectId:event.data.projectId,
            content:"Something went wrong. Please try again ",
            role:"ASSISTANT",
            type:"ERROR",
          }
      })
      return await prisma.message.create({
        data:{
          projectId:event.data.projectId,
          content:parseAgentResponse(responseMessageOutput),
          role:"ASSISTANT",
          type:"RESULT",
          fragment:{
            create:{
              sandboxUrl:sandboxURL,
              sandboxId,
              sandboxStatus:"READY",
              sandboxError:null,
              title:parseAgentResponse(fragmentTitleOutput),
              files:result.state.data.files,
            }
          }
        }
      })
    })

    return { 
      url: sandboxURL ,
      title:"Fragment",
      files:result.state.data.files,
      summary:result.state.data.summary
    };
  }
);
