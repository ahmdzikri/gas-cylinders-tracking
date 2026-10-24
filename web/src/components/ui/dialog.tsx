"use client"

import { Dialog as DialogPrimitive } from "radix-ui"
import { Children, isValidElement } from "react"
import type * as React from "react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { XIcon } from "lucide-react"

function Dialog({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogPortal({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 isolate z-50 bg-black/80 duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        className
      )}
      {...props}
    />
  )
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean
}) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          "fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-2rem)] w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 overflow-hidden rounded-xl bg-popover p-4 text-sm text-popover-foreground ring-1 ring-foreground/10 duration-100 outline-none sm:max-w-lg data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          className
        )}
        {...props}
      >
        {partitionDialogChildren(children)}
        {showCloseButton && (
          <DialogPrimitive.Close data-slot="dialog-close" asChild>
            <Button
              variant="ghost"
              className="absolute top-2 right-2"
              size="icon-sm"
            >
              <XIcon />
              <span className="sr-only">Tutup</span>
            </Button>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  )
}

function isPinnedSlot(node: React.ReactNode): boolean {
  return (
    isValidElement(node) &&
    (node.type === DialogHeader || node.type === DialogFooter)
  )
}

/**
 * Splits dialog children into pinned slots (header/footer) and the scrollable
 * middle, preserving DOM order.
 *
 * `DialogContent` is a flex column capped at the viewport height. Header and
 * footer children are rendered as direct (non-growing, `shrink-0`) siblings, so
 * they stay pinned. Every contiguous run of other children becomes a single
 * `DialogBody` (`flex-1 min-h-0 overflow-y-auto`): that region grows, shrinks,
 * and scrolls while the header/footer stay put. This is fully automatic and
 * needs zero per-dialog changes.
 */
function partitionDialogChildren(children: React.ReactNode): React.ReactNode {
  const nodes = Children.toArray(children)
  const out: React.ReactNode[] = []
  let run: React.ReactNode[] = []
  let runKey = 0

  const flush = () => {
    if (run.length === 0) {
      return
    }
    out.push(
      <DialogBody key={`dialog-body-${String(runKey++)}`}>{run}</DialogBody>
    )
    run = []
  }

  for (const node of nodes) {
    if (isPinnedSlot(node)) {
      flush()
      out.push(node)
    } else {
      run.push(node)
    }
  }
  flush()

  return out
}

/**
 * Scrollable middle region of a dialog, produced by `partitionDialogChildren`.
 * `flex-1 min-h-0` lets it shrink below its content height so `overflow-y-auto`
 * actually engages inside the capped flex column.
 */
function DialogBody({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-body"
      className={cn(
        "flex min-h-0 flex-1 flex-col gap-4 overflow-x-hidden overflow-y-auto",
        className
      )}
      {...props}
    />
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn(
        "sticky top-0 z-10 flex shrink-0 flex-col gap-1 bg-popover",
        className
      )}
      {...props}
    />
  )
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "sticky bottom-0 z-10 flex shrink-0 flex-col-reverse gap-2 bg-popover sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close asChild>
          <Button variant="outline">Tutup</Button>
        </DialogPrimitive.Close>
      )}
    </div>
  )
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("font-heading text-base font-semibold", className)}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        "text-sm text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
        className
      )}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
}
