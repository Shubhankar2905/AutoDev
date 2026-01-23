'use client';
import { Button } from "@/components/ui/button"
import { useTRPC } from "@/trpc/client";
import { useMutation } from "@tanstack/react-query";


const page = () => {
  //fetching data from client component
  const trpc = useTRPC();
  const invoke = useMutation(trpc.invoke.mutationOptions({}));
  return (
    <div className="p-4 max-w-7xl mx-auto">
      <Button onClick={() => invoke.mutate({ text: "Shub" })}>
        Test
      </Button>
    </div>
  )
}

export default page