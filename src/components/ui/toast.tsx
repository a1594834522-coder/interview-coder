import * as React from "react"
import * as ToastPrimitive from "@radix-ui/react-toast"
import { cn } from "../../lib/utils"
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react"

const ToastProvider = ToastPrimitive.Provider

export type ToastMessage = {
  title: string
  description: string
  variant: ToastVariant
}

const ToastViewport = React.forwardRef<
  React.ElementRef<typeof ToastPrimitive.Viewport>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitive.Viewport>
>(({ className, ...props }, ref) => (
  <ToastPrimitive.Viewport
    ref={ref}
    className={cn(
      "fixed top-0 right-0 z-[100] flex max-h-screen w-full flex-col-reverse gap-1 p-2 sm:top-0 sm:right-0 sm:flex-col md:max-w-[320px]",
      className
    )}
    data-interactive-region
    {...props}
  />
))
ToastViewport.displayName = ToastPrimitive.Viewport.displayName

type ToastVariant = "neutral" | "success" | "error"

interface ToastProps
  extends React.ComponentPropsWithoutRef<typeof ToastPrimitive.Root> {
  variant?: ToastVariant
  swipeDirection?: "right" | "left" | "up" | "down"
}

const toastVariants: Record<
  ToastVariant,
  { icon: React.ReactNode; bgColor: string }
> = {
  neutral: {
    icon: <Info className="h-3 w-3 text-amber-700" />,
    bgColor: "bg-amber-100"
  },
  success: {
    icon: <CheckCircle2 className="h-3 w-3 text-emerald-700" />,
    bgColor: "bg-emerald-100"
  },
  error: {
    icon: <AlertCircle className="h-3 w-3 text-red-700" />,
    bgColor: "bg-red-100"
  }
}

const Toast = React.forwardRef<
  React.ElementRef<typeof ToastPrimitive.Root>,
  ToastProps
>(({ className, variant = "neutral", ...props }, ref) => (
  <ToastPrimitive.Root
    ref={ref}
    duration={4000}
    className={cn(
      "group pointer-events-auto relative flex w-full items-center space-x-2 overflow-hidden rounded-md p-2",
      toastVariants[variant].bgColor,
      className
    )}
    data-interactive-region
    {...props}
  >
    {toastVariants[variant].icon}
    <div className="flex-1">{props.children}</div>
    <ToastPrimitive.Close className="absolute right-1 top-1 rounded-md p-0.5 text-zinc-500 opacity-0 transition-opacity hover:text-zinc-700 group-hover:opacity-100">
      <X className="h-2 w-2" />
    </ToastPrimitive.Close>
  </ToastPrimitive.Root>
))
Toast.displayName = ToastPrimitive.Root.displayName

const ToastAction = React.forwardRef<
  React.ElementRef<typeof ToastPrimitive.Action>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitive.Action>
>(({ className, ...props }, ref) => (
  <ToastPrimitive.Action
    ref={ref}
    className={cn(
      "text-[0.65rem] font-medium text-zinc-600 hover:text-zinc-900",
      className
    )}
    {...props}
  />
))
ToastAction.displayName = ToastPrimitive.Action.displayName

const ToastTitle = React.forwardRef<
  React.ElementRef<typeof ToastPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitive.Title>
>(({ className, ...props }, ref) => (
  <ToastPrimitive.Title
    ref={ref}
    className={cn("text-[0.7rem] font-medium text-zinc-900", className)}
    {...props}
  />
))
ToastTitle.displayName = ToastPrimitive.Title.displayName

const ToastDescription = React.forwardRef<
  React.ElementRef<typeof ToastPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitive.Description>
>(({ className, ...props }, ref) => (
  <ToastPrimitive.Description
    ref={ref}
    className={cn("text-[0.65rem] text-zinc-600", className)}
    {...props}
  />
))
ToastDescription.displayName = ToastPrimitive.Description.displayName

export type { ToastProps, ToastVariant }
export {
  ToastProvider,
  ToastViewport,
  Toast,
  ToastAction,
  ToastTitle,
  ToastDescription
}
