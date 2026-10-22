import { Fragment } from "@/generated/prisma/client";
import { Button } from "@/components/ui/button";
import {
  ExternalLinkIcon,
  Loader2Icon,
  RefreshCcwIcon,
  RotateCcwIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Hint } from "@/components/hint";
import { useTRPC } from "@/trpc/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

interface Props {
  data: Fragment;
}

export function FragmentWeb({ data }: Props) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState(false);
  const [fragmentKey, setFragmentKey] = useState(0);
  const [previewUrl, setPreviewUrl] = useState(data.sandboxUrl);
  const [previewUnavailable, setPreviewUnavailable] = useState(false);

  const sandboxStatus = useQuery({
    ...trpc.projects.getSandboxStatus.queryOptions({ fragmentId: data.id }),
    refetchInterval: 30_000,
  });
  const restartSandbox = useMutation(
    trpc.projects.restartSandbox.mutationOptions({
      onSuccess: (result) => {
        setPreviewUrl(result.sandboxUrl);
        setPreviewUnavailable(false);
        setFragmentKey((prev) => prev + 1);
        queryClient.invalidateQueries(
          trpc.projects.getSandboxStatus.queryOptions({ fragmentId: data.id }),
        );
        toast.success("Sandbox restarted");
      },
      onError: (error) => {
        toast.error(error.message);
      },
    }),
  );

  useEffect(() => {
    setPreviewUrl(data.sandboxUrl);
    setPreviewUnavailable(false);
  }, [data.id, data.sandboxUrl]);

  const onRefresh = () => {
    setFragmentKey((prev) => prev + 1);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(previewUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col w-full h-full">
      <div className="p-2 border-b bg-sidebar flex items-center gap-x-2">
        <Hint text="Refresh" side="bottom" align="start">
          <Button size="sm" variant="outline" onClick={onRefresh}>
            <RefreshCcwIcon />
          </Button>
        </Hint>
        <Hint text="Click to copy" side="bottom">
          <Button
            size="sm"
            variant="outline"
            onClick={handleCopy}
            disabled={!previewUrl || copied}
            className="flex-1 justify-start text-start font-normal"
          >
            <span className="truncate">{previewUrl}</span>
          </Button>
        </Hint>
        <Hint text="Open in new tab" side="bottom" align="start">
          <Button
            size="sm"
            variant="outline"
            disabled={!previewUrl}
            onClick={() => {
              if (!previewUrl) {
                return;
              }
              window.open(previewUrl, "_blank");
            }}
          >
            <ExternalLinkIcon />
          </Button>
        </Hint>
      </div>
      <div className="relative flex-1 min-h-0">
        <iframe
          key={fragmentKey}
          className="h-full w-full"
          sandbox="allow-forms allow-scripts allow-same-origin"
          loading="lazy"
          src={previewUrl}
          onError={() => setPreviewUnavailable(true)}
        />
        {(previewUnavailable ||
          sandboxStatus.isError ||
          sandboxStatus.data?.available === false) && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/95 p-6">
            <div className="flex max-w-sm flex-col items-center gap-3 text-center">
              <p className="font-medium">Sandbox expired or unavailable</p>
              <p className="text-sm text-muted-foreground">
                Restart the sandbox to restore your project files and preview.
              </p>
              <Button
                onClick={() => restartSandbox.mutate({ fragmentId: data.id })}
                disabled={restartSandbox.isPending}
              >
                {restartSandbox.isPending ? (
                  <Loader2Icon className="animate-spin" />
                ) : (
                  <RotateCcwIcon />
                )}
                {restartSandbox.isPending ? "Restarting..." : "Restart Sandbox"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
