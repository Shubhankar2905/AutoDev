import { inngest } from "@/inngest/client";
import {prisma} from "@/lib/prisma";
import { baseProcedure, createTRPCRouter } from "@/trpc/init";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { INVALID_PROMPT_MESSAGE, validatePrompt } from "@/lib/prompt-validator";

export const messagesRouter = createTRPCRouter({

  getMany: baseProcedure
      .input(
      z.object({
        projectId: z.string().min(1, { message: "Project ID is required" }),
      })
    )
    .query(async({input})=>{
      const messages = await prisma.message.findMany({
        where:{
            projectId : input.projectId
        },
        orderBy:{
          updatedAt:"asc",
        },
        include:{
          fragment:true
        }
      })
      return messages
    }),
  create: baseProcedure
    .input(
      z.object({
        value: z.string().min(1, { message: "Message is required" }).max(10000, { message: "Message is too long" }),
        projectId: z.string().min(1, { message: "Project ID is required" }),
      })
    )
    .mutation(async ({ input }) => {
      const validation = await validatePrompt(input.value);
      if (!validation.valid) {
        throw new TRPCError({ code: "BAD_REQUEST", message: INVALID_PROMPT_MESSAGE });
      }

      const createdmessage = await prisma.message.create({
        data: {
          projectId: input.projectId,
          content: input.value,
          role: "USER",
          type: "RESULT",
        },
      });

      await inngest.send({
        name: "code-agent/run",
        data: {
          value: input.value,
          projectId: input.projectId,
        },
      });
      return createdmessage;
    }),
});


