/* eslint-disable react-hooks/rules-of-hooks */
'use client';
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input";
import { useTRPC } from "@/trpc/client";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";


const page = () => {
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const [value, setValue] = useState("");
  //fetching data from client component
  const trpc = useTRPC();
  const invoke = useMutation(trpc.invoke.mutationOptions({}));
  return (
    <div className="p-4 max-w-7xl mx-auto">
      <Input value={value} onChange={(e) => setValue(e.target.value)} />
      <Button onClick={() => invoke.mutate({ value: value })}>
        Test Background job
      </Button>
    </div>
  )
}

export default page