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
import { SearchResult } from "@/app/components/SearchResult";
import { SearchIcon } from "lucide-react";

export default function Search({}) {
  const [search, setSearch] = useState("");
  const [lexical, setLexical] = useState([]);
  const [semantic, setSemantic] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  async function handleSearch(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    try {
      const response = await fetch("/api/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: search }),
      });
      const data = await response.json();
      setLexical(data.lexical ?? []);
      setSemantic(data.semantic ?? []);
      setHasSearched(true);
    } finally {
      setLoading(false);
    }
  }
  return (
    <div className="mx-auto container flex flex-col min-h-screen">
      <form onSubmit={handleSearch}>
        <Field className="max-w-screen mt-16 p-4 rounded-xl">
          <div className="text-center text-4xl font-bold">Bodega Search</div>
          <FieldDescription className="text-center">
            Need to find a specific skit or phrase from a specific episode? Or a
            character or hot take? Search here across the whole bodega universe.
          </FieldDescription>
          <FieldLabel htmlFor="inline-start-input"></FieldLabel>
          <InputGroup className="border border-slate-400">
            <InputGroupAddon align="inline-start">
              <SearchIcon className="text-muted-foreground" />
            </InputGroupAddon>
            <InputGroupInput
              id="inline-start-input"
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <InputGroupAddon align="inline-end" className="pr-1">
              <InputGroupButton type="submit" variant="default" size="sm">
                Search
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
        </Field>
      </form>
      <div className="flex flex-col gap-4 mt-4 h-full">
        {loading && (
          <div className="p-4 text-center text-slate-500">Searching...</div>
        )}
        {!loading && hasSearched && (
          <>
            <SearchResult title="Lexical" result={lexical} />
            <SearchResult title="Semantic" result={semantic} />
          </>
        )}
        {!loading && hasSearched && lexical.length === 0 && semantic.length === 0 ? (
          <div className="p-4 flex flex-col items-center justify-center h-full">
            <SearchIcon />
            <div className="text-base text-slate-400">No results found.</div>
            <div className="text-sm text-slate-600">
              Sorry your search yielded no results.
            </div>
            <div className="text-sm text-slate-600">
              {" "}
              Please try again or contact support if you think this is an
              error{" "}
            </div>
          </div>
        ) : (
          <></>
        )}
      </div>
    </div>
  );
}
