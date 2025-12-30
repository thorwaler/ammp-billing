import { cn } from "@/lib/utils";
interface AmmpLogoProps {
  size?: "sm" | "default" | "lg";
  showText?: boolean;
  className?: string;
}
const sizeMap = {
  sm: "h-2 w-2",
  default: "h-2.5 w-2.5",
  lg: "h-3 w-3"
};
const textSizeMap = {
  sm: "text-lg",
  default: "text-xl",
  lg: "text-2xl"
};
export function AmmpLogo({
  size = "default",
  showText = true,
  className
}: AmmpLogoProps) {
  const dotSize = sizeMap[size];
  const textSize = textSizeMap[size];
  return <div className={cn("flex items-center gap-2", className)}>
      
      {showText}
    </div>;
}
export default AmmpLogo;