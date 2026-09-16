import { inngest } from "@/inngest/client";
import {prisma} from "@/lib/prisma";
import { baseProcedure, createTRPCRouter } from "@/trpc/init";
import { z } from "zod";
import {generateSlug} from "random-word-slugs"
import { TRPCError } from "@trpc/server";
import { INVALID_PROMPT_MESSAGE, validatePrompt } from "@/lib/prompt-validator";

export const projectsRouter = createTRPCRouter({
    getOne: baseProcedure
    .input(
      z.object({
      id:z.string().min(1,{message:"Id is required"})
    }))
    .query(async({input})=>{
      const existingproject = await prisma.project.findUnique({
        where:{
          id:input.id
        }

      })

      if(!existingproject)
          throw new TRPCError({code:"NOT_FOUND",message:"Project Not found"});
      return existingproject
    }),
  getMany: baseProcedure
    .query(async()=>{
      const projects = await prisma.project.findMany({
        orderBy:{
          updatedAt:"desc",
        },

      })
      return projects
    }),
  create: baseProcedure
    .input(
      z.object({
        value: z.string().min(1, { message: "Prompt is required" }).max(10000, { message: "Prompt is too long" }),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const validation = await validatePrompt(input.value);
      if (!validation.valid) {
        throw new TRPCError({ code: "BAD_REQUEST", message: INVALID_PROMPT_MESSAGE });
      }

      const createdProject = await prisma.project.create({
        data: {
          name: generateSlug(2,{format:"kebab"}),
          userId: ctx.userId,
          messages: {create:{
              content: input.value,
              role: "USER",
              type: "RESULT",
          }
          }
        },
      });

      await inngest.send({
        name: "code-agent/run",
        data: {
          value: input.value,
          projectId:createdProject.id,
        },
      });
      return createdProject
    }),
});


