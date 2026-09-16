import { ProjectView } from "@/modules/projects/ui/views/project-view";
import { getQueryClient, trpc } from "@/trpc/server";
import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { Suspense } from "react";

interface Props {
  params: Promise<{
    projectId: string;
  }>;
}

const page = async ({ params }: Props) => {
  const { projectId } = await params;

  const queryClient = getQueryClient(); // cached data is stored here

  void queryClient.prefetchQuery(
    //fetches data before the component renders and store in queryClient for hydration
    trpc.messages.getMany.queryOptions({
      projectId: projectId,
    }),
  );

  void queryClient.prefetchQuery(
    trpc.projects.getOne.queryOptions({
      id: projectId,
    }),
  );

  return (
    //dehydrate() means taking the data stored in the server-side React Query cache and
    //converting it into a transferable state that can be sent to the client.
    <HydrationBoundary state={dehydrate(queryClient)}>
      <Suspense fallback={<p>Loading....</p>}>
        <ProjectView projectId={projectId} />
      </Suspense>
    </HydrationBoundary>
  );
};

export default page;

//getqueryclient prefetch query dehydrate hydrationboundary suspense
