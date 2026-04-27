import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const linkVariants = cva(
  "rounded-md text-center px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
  {
    variants: {
      variant: {
        default:
          "bg-cyan-500 hover:bg-pink-500  focus-visible:outline-fuchsia-600 text-white",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface LinkProps
  extends React.LinkHTMLAttributes<HTMLAnchorElement>,
    VariantProps<typeof linkVariants> {
  asChild?: boolean;
  download: boolean
}

const Link = React.forwardRef<HTMLAnchorElement, LinkProps>(
  ({ href, download, className, variant, size, asChild = false, ...props }, ref) => {
    return (
      <a
        download
        href={href}
        className={cn(linkVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Link.displayName = "link";

export { Link, linkVariants };
