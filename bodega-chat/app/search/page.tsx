"use client";
import { useState } from "react";

import {
  Field,
  FieldDescription,
  FieldLabel,
  FieldLegend,
} from "@/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupButton,
} from "@/components/ui/input-group";
import { Button } from "@/components/ui/button";
import { SearchIcon } from "lucide-react";

export default function Search({}) {
  const [search, useSearch] = useState();

  return (
    <div className="mx-auto container flex flex-col items-center justify-center p-2">
      <Field className="max-w-screen mt-16 p-4 bg-slate-200 rounded-xl">
        <FieldLegend>Bodega Search</FieldLegend>
        <FieldDescription>
          Need to find a specific skit or phrase from a specific episode? Or a
          character or hot take? Search here across the whole bodega universe.
        </FieldDescription>
        <FieldLabel htmlFor="inline-start-input"></FieldLabel>
        <InputGroup className="border border-slate-400">
          <InputGroupAddon align="inline-start">
            <SearchIcon className="text-muted-foreground" />
          </InputGroupAddon>
          <InputGroupInput id="inline-start-input" placeholder="Search..." />
          <InputGroupAddon align="inline-end" className="pr-1">
            <InputGroupButton variant="default" size="sm">
              Search
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </Field>
    </div>
  );
}
