import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Separator } from "@/components/ui/separator"
import { IconCirclePlus } from "@tabler/icons-react"
import type { ReactNode } from "react"

export interface FacetedFilterOption {
  label: string
  value: string
  icon?: ReactNode
}

interface DataTableFacetedFilterProps {
  title: string
  options: FacetedFilterOption[]
  selectedValues: string[]
  onSelectedValuesChange: (values: string[]) => void
}

export function DataTableFacetedFilter({
  title,
  options,
  selectedValues,
  onSelectedValuesChange,
}: DataTableFacetedFilterProps) {
  const selected = new Set(selectedValues)

  const toggle = (value: string) => {
    const next = selected.has(value)
      ? new Set([...selected].filter((item) => item !== value))
      : new Set([...selected, value])
    const ordered = options
      .map((option) => option.value)
      .filter((optionValue) => next.has(optionValue))
    const extras = [...next].filter(
      (item) => !options.some((option) => option.value === item)
    )
    onSelectedValuesChange([...ordered, ...extras])
  }

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 border-dashed border-primary">
          <IconCirclePlus aria-hidden="true" className="size-4" />
          {title}
          {selectedValues.length > 0 ? (
            <>
              <Separator orientation="vertical" className="mx-2 h-4" />
              <Badge
                variant="secondary"
                className="rounded-sm font-normal"
              >
                {selectedValues.length} selected
              </Badge>
            </>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>{title}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {options.map((option) => (
          <DropdownMenuCheckboxItem
            key={option.value}
            checked={selected.has(option.value)}
            onCheckedChange={() => toggle(option.value)}
            onSelect={(event) => event.preventDefault()}
          >
            {option.icon}
            {option.label}
          </DropdownMenuCheckboxItem>
        ))}
        {selectedValues.length > 0 ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="justify-center"
              onSelect={() => onSelectedValuesChange([])}
            >
              Hapus filter
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
