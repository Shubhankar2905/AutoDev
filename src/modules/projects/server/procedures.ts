import { inngest } from "@/inngest/client";
import {prisma} from "@/lib/prisma";
import { baseProcedure, createTRPCRouter } from "@/trpc/init";
import { z } from "zod";
import {generateSlug} from "random-word-slugs"
import { TRPCError } from "@trpc/server";
import { INVALID_PROMPT_MESSAGE, validatePrompt } from "@/lib/prompt-validator";
import { checkSandboxAvailability, createAndRestoreSandbox } from "./sandbox";

export const projectsRouter = createTRPCRouter({
    getOne: baseProcedure
    .input(
      z.object({
      id:z.string().min(1,{message:"Id is required"})
    }))
    .query(async({input, ctx})=>{
      const existingproject = await prisma.project.findUnique({
        where:{
          id:input.id,
          userId: ctx.userId,
        }

      })

      if(!existingproject)
          throw new TRPCError({code:"NOT_FOUND",message:"Project Not found"});
      return existingproject
    }),
  getSandboxStatus: baseProcedure
    .input(z.object({ fragmentId: z.string().min(1) }))
    .query(async ({ input, ctx }) => {
      const fragment = await prisma.fragment.findFirst({
        where: {
          id: input.fragmentId,
          message: { project: { userId: ctx.userId } },
        },
        select: {
          id: true,
          sandboxId: true,
          sandboxUrl: true,
          sandboxStatus: true,
          sandboxError: true,
        },
      });

      if (!fragment) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Fragment not found" });
      }

      const available =
        fragment.sandboxStatus === "READY" &&
        (await checkSandboxAvailability(fragment.sandboxId, fragment.sandboxUrl));

      return {
        ...fragment,
        available,
        sandboxStatus: available ? fragment.sandboxStatus : "FAILED",
      };
    }),
  restartSandbox: baseProcedure
    .input(z.object({ fragmentId: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      const fragment = await prisma.fragment.findFirst({
        where: {
          id: input.fragmentId,
          message: { project: { userId: ctx.userId } },
        },
        select: {
          id: true,
          files: true,
          sandboxStatus: true,
        },
      });

      if (!fragment) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Fragment not found" });
      }

      const claimed = await prisma.fragment.updateMany({
        where: {
          id: fragment.id,
          sandboxStatus: { not: "RESTARTING" },
        },
        data: {
          sandboxStatus: "RESTARTING",
          sandboxError: null,
        },
      });

      if (claimed.count !== 1) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "A sandbox restart is already in progress",
        });
      }

      try {
        const restored = await createAndRestoreSandbox(fragment.files);
        const updated = await prisma.fragment.update({
          where: { id: fragment.id },
          data: {
            sandboxId: restored.sandboxId,
            sandboxUrl: restored.previewUrl,
            sandboxStatus: "READY",
            sandboxError: null,
          },
          select: { sandboxUrl: true, sandboxStatus: true },
        });
        return updated;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unable to restart sandbox";
        await prisma.fragment.update({
          where: { id: fragment.id },
          data: { sandboxStatus: "FAILED", sandboxError: message },
        });
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Unable to restart sandbox. Please try again.",
          cause: error,
        });
      }
    }),
  getMany: baseProcedure
    .query(async({ctx})=>{
      const projects = await prisma.project.findMany({
        where: { userId: ctx.userId },
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
