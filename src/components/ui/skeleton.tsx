import { cn } from "@/lib/utils";

/**
 * Skeleton loading placeholder with shimmer animation.
 * Uses CSS variable --muted for automatic tier + dark mode adaptation.
 */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        "rounded-md bg-muted",
        "bg-[length:200%_100%] bg-[position:-200%_0]",
        "animate-[shimmer_1.5s_ease-in-out_infinite]",
        "bg-gradient-to-r from-muted via-muted-foreground/5 to-muted",
        className,
      )}
      {...props}
    />
  );
}

export { Skeleton };
