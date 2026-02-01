/* eslint-disable react-hooks/rules-of-hooks */
'use client';
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input";
import { useTRPC } from "@/trpc/client";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";


const page = () => {
  const router = useRouter();
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const [value, setValue] = useState("");
  //fetching data from client component
  const trpc = useTRPC();

  const createProjects = useMutation(trpc.projects.create.mutationOptions({
    onError: (error) => {
      toast.error(error.message)
    },
    onSuccess: (data) => {
      router.push(`/projects/${data.id}`);
    }
  }));
  return (
    <div className="h-screen w-scren flex items-center justify-center ">
      <div className="max-w-7xl mx-auto flex items-center flex-col gap-y-4 justify-center">

        <Input value={value} onChange={(e) => setValue(e.target.value)} />
        <Button onClick={() => createProjects.mutate({ value: value })}>
          Submit
        </Button>
      </div>

    </div>
  )
}

export default page