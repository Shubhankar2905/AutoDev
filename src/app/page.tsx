import { caller, getQueryClient, trpc } from "@/trpc/server"
import { HydrationBoundary } from "@tanstack/react-query";
import { Client } from "./client";
import { Suspense } from "react";



const page = async () => {
  //fetching data from client component
  const queryclient = getQueryClient();
  void queryclient.prefetchQuery(trpc.hello.queryOptions({ text: "Shubhankar" }))
  return (
    <HydrationBoundary>
      <Suspense fallback={<p>loading...</p>}>
        <Client />
      </Suspense>
    </HydrationBoundary>
  )
}

export default page