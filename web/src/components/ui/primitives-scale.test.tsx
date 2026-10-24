import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyTitle,
} from "@/components/ui/empty"
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table"

// Body text di primitive mengikuti `design_scale.body_text: text-sm`
// (AGENTS.md). Token kompak mira `text-xs/relaxed` (12px) membuat isi kartu,
// dialog, tab, dan empty state lebih kecil dari label/form — lihat
// VISUAL_REVIEW.md §3.
afterEach(cleanup)

const MIRA_BODY = "text-xs/relaxed"

describe("primitive body text scale", () => {
  it("Card body, title, and description use the standard scale", () => {
    render(
      <Card data-testid="card">
        <CardHeader>
          <CardTitle>Judul</CardTitle>
          <CardDescription>Deskripsi</CardDescription>
        </CardHeader>
        <CardContent>Isi</CardContent>
      </Card>
    )
    const card = screen.getByTestId("card")
    expect(card).toHaveClass("text-sm")
    expect(card.className).not.toContain(MIRA_BODY)
    expect(screen.getByText("Judul")).toHaveClass("text-base", "font-semibold")
    expect(screen.getByText("Deskripsi")).toHaveClass("text-sm")
  })

  it("Dialog content, title, and description use the standard scale", () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Judul dialog</DialogTitle>
          <DialogDescription>Deskripsi dialog</DialogDescription>
        </DialogContent>
      </Dialog>
    )
    const dialog = screen.getByRole("dialog")
    expect(dialog).toHaveClass("text-sm", "sm:max-w-lg")
    expect(dialog.className).not.toContain(MIRA_BODY)
    expect(screen.getByText("Judul dialog")).toHaveClass(
      "text-base",
      "font-semibold"
    )
    expect(screen.getByText("Deskripsi dialog")).toHaveClass("text-sm")
    expect(screen.getByText("Tutup")).toHaveClass("sr-only")
  })

  it("Table body uses text-sm", () => {
    render(
      <Table>
        <TableBody>
          <TableRow>
            <TableCell>Sel</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    )
    expect(screen.getByRole("table")).toHaveClass("text-sm")
  })

  it("Empty title and description use the standard scale", () => {
    render(
      <Empty>
        <EmptyTitle>Kosong</EmptyTitle>
        <EmptyDescription>Belum ada data.</EmptyDescription>
        <EmptyContent>Aksi</EmptyContent>
      </Empty>
    )
    expect(screen.getByText("Kosong")).toHaveClass("text-base")
    expect(screen.getByText("Belum ada data.")).toHaveClass("text-sm")
    expect(screen.getByText("Aksi")).toHaveClass("text-sm")
  })
})
