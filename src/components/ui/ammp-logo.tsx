import { cn } from "@/lib/utils";

interface AmmpLogoProps {
  size?: "sm" | "default" | "lg";
  showText?: boolean;
  className?: string;
}

const sizeMap = {
  sm: "h-2 w-2",
  default: "h-2.5 w-2.5",
  lg: "h-3 w-3",
};

const textSizeMap = {
  sm: "text-lg",
  default: "text-xl",
  lg: "text-2xl",
};

export function AmmpLogo({ size = "default", showText = true, className }: AmmpLogoProps) {
  const dotSize = sizeMap[size];
  const textSize = textSizeMap[size];

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="flex items-center gap-0.5">
        <span className={cn("rounded-full bg-[#E6195E]", dotSize)} />
        <span className={cn("rounded-full bg-[#E83E5A]", dotSize)} />
        <span className={cn("rounded-full bg-[#EA6356]", dotSize)} />
        <span className={cn("rounded-full bg-[#EC8852]", dotSize)} />
      </div>
      {showText && (
        <span className={cn("font-semibold text-foreground", textSize)}>
          AMMP
        </span>
      )}
    </div>
  );
}

export default AmmpLogo;
