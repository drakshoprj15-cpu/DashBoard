"use client";

import * as React from "react";
import { GripVertical, Palette, Plus, Trash2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ImageDropzone } from "@/components/image-dropzone";

import type { OptionRow } from "./types";

export interface DraftValue {
  key: string;
  id?: string;
  value: string;
  label: string;
  hexColor: string;
  thumbnailUrl: string;
}

export interface DraftOption {
  key: string;
  id?: string;
  name: string;
  values: DraftValue[];
}

/**
 * Sugestões de cor usadas no botão "Cores comuns".
 *
 * São só um atalho de digitação: entram no editor como valores normais,
 * editáveis e removíveis. Nenhuma cor fica fixa em código — o produto que
 * for cadastrado amanhã pode ter outras.
 */
const COLOR_SUGGESTIONS: { value: string; hexColor: string }[] = [
  { value: "Preto", hexColor: "#111111" },
  { value: "Azul", hexColor: "#1D4ED8" },
  { value: "Bege", hexColor: "#D8C3A5" },
  { value: "Branco", hexColor: "#FFFFFF" },
  { value: "Rosa", hexColor: "#EC4899" },
];

function newKey(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function emptyValue(partial?: Partial<DraftValue>): DraftValue {
  return {
    key: newKey(),
    value: "",
    label: "",
    hexColor: "",
    thumbnailUrl: "",
    ...partial,
  };
}

export function emptyOption(name = ""): DraftOption {
  return { key: newKey(), name, values: [emptyValue()] };
}

/** Converte o que veio do banco no rascunho editável do formulário. */
export function toDraftOptions(options: OptionRow[]): DraftOption[] {
  return options.map((option) => ({
    key: newKey(),
    id: option.id,
    name: option.name,
    values: option.values.map((value) => ({
      key: newKey(),
      id: value.id,
      value: value.value,
      label: value.label ?? "",
      hexColor: value.hexColor ?? "",
      thumbnailUrl: value.thumbnailUrl ?? "",
    })),
  }));
}

export function OptionsEditor({
  options,
  onChange,
  disabled,
}: {
  options: DraftOption[];
  onChange: (options: DraftOption[]) => void;
  disabled?: boolean;
}) {
  function updateOption(key: string, patch: Partial<DraftOption>) {
    onChange(
      options.map((option) =>
        option.key === key ? { ...option, ...patch } : option,
      ),
    );
  }

  function updateValue(
    optionKey: string,
    valueKey: string,
    patch: Partial<DraftValue>,
  ) {
    onChange(
      options.map((option) =>
        option.key === optionKey
          ? {
              ...option,
              values: option.values.map((value) =>
                value.key === valueKey ? { ...value, ...patch } : value,
              ),
            }
          : option,
      ),
    );
  }

  function addSuggestedColors(optionKey: string) {
    const option = options.find((item) => item.key === optionKey);
    if (!option) return;

    const existing = new Set(
      option.values.map((value) => value.value.toLocaleLowerCase("pt-BR")),
    );
    const additions = COLOR_SUGGESTIONS.filter(
      (suggestion) =>
        !existing.has(suggestion.value.toLocaleLowerCase("pt-BR")),
    ).map((suggestion) => emptyValue(suggestion));

    // Linha vazia recém-criada dá lugar às sugestões, em vez de sobrar.
    const kept = option.values.filter((value) => value.value.trim() !== "");
    updateOption(optionKey, { values: [...kept, ...additions] });
  }

  return (
    <div className="space-y-4">
      {options.map((option, optionIndex) => (
        <div key={option.key} className="rounded-xl border p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-48 flex-1 space-y-1.5">
              <Label htmlFor={`option-name-${option.key}`}>
                Atributo {optionIndex + 1}
              </Label>
              <Input
                id={`option-name-${option.key}`}
                value={option.name}
                disabled={disabled}
                placeholder="Cor, Tamanho, Modelo, Voltagem…"
                onChange={(event) =>
                  updateOption(option.key, { name: event.target.value })
                }
              />
            </div>

            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={disabled}
              onClick={() => addSuggestedColors(option.key)}
            >
              <Palette /> Cores comuns
            </Button>

            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={disabled}
              aria-label={`Remover atributo ${option.name || optionIndex + 1}`}
              onClick={() =>
                onChange(options.filter((item) => item.key !== option.key))
              }
            >
              <Trash2 />
            </Button>
          </div>

          <div className="mt-4 space-y-3">
            {option.values.map((value, valueIndex) => (
              <div
                key={value.key}
                className="bg-muted/30 grid gap-3 rounded-lg border p-3 sm:grid-cols-[1fr_1fr_auto_auto]"
              >
                <div className="space-y-1.5">
                  <Label htmlFor={`value-${value.key}`} className="text-xs">
                    Valor {valueIndex + 1}
                  </Label>
                  <Input
                    id={`value-${value.key}`}
                    value={value.value}
                    disabled={disabled}
                    placeholder="Preto"
                    onChange={(event) =>
                      updateValue(option.key, value.key, {
                        value: event.target.value,
                      })
                    }
                  />
                </div>

                <div className="space-y-1.5">
                  <Label
                    htmlFor={`value-label-${value.key}`}
                    className="text-xs"
                  >
                    Nome público{" "}
                    <span className="text-muted-foreground font-normal">
                      (opcional)
                    </span>
                  </Label>
                  <Input
                    id={`value-label-${value.key}`}
                    value={value.label}
                    disabled={disabled}
                    placeholder="Preto fosco"
                    onChange={(event) =>
                      updateValue(option.key, value.key, {
                        label: event.target.value,
                      })
                    }
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor={`value-hex-${value.key}`} className="text-xs">
                    Cor
                  </Label>
                  <div className="flex items-center gap-1.5">
                    <input
                      id={`value-hex-${value.key}`}
                      type="color"
                      value={value.hexColor || "#000000"}
                      disabled={disabled}
                      aria-label={`Amostra de cor de ${value.value || "valor"}`}
                      onChange={(event) =>
                        updateValue(option.key, value.key, {
                          hexColor: event.target.value.toUpperCase(),
                        })
                      }
                      className="size-9 shrink-0 cursor-pointer rounded border"
                    />
                    <Input
                      value={value.hexColor}
                      disabled={disabled}
                      placeholder="#111111"
                      onChange={(event) =>
                        updateValue(option.key, value.key, {
                          hexColor: event.target.value,
                        })
                      }
                      className="w-28 font-mono text-xs uppercase"
                    />
                  </div>
                </div>

                <div className="flex items-end">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={disabled || option.values.length === 1}
                    aria-label={`Remover valor ${value.value || valueIndex + 1}`}
                    onClick={() =>
                      updateOption(option.key, {
                        values: option.values.filter(
                          (item) => item.key !== value.key,
                        ),
                      })
                    }
                  >
                    <Trash2 />
                  </Button>
                </div>

                <div className="sm:col-span-4">
                  <ImageDropzone
                    id={`value-thumb-${value.key}`}
                    label="Miniatura da opção"
                    endpoint="/api/uploads/product-image"
                    hint="Foto real desta opção — nunca um filtro sobre a foto padrão"
                    value={value.thumbnailUrl}
                    onChange={(url) =>
                      updateValue(option.key, value.key, { thumbnailUrl: url })
                    }
                  />
                </div>
              </div>
            ))}

            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={disabled}
              onClick={() =>
                updateOption(option.key, {
                  values: [...option.values, emptyValue()],
                })
              }
            >
              <Plus /> Adicionar valor
            </Button>
          </div>
        </div>
      ))}

      <Button
        type="button"
        variant="outline"
        disabled={disabled || options.length >= 3}
        onClick={() => onChange([...options, emptyOption()])}
        className={cn(options.length >= 3 && "opacity-60")}
      >
        <GripVertical /> Adicionar atributo
      </Button>
      {options.length >= 3 ? (
        <p className="text-muted-foreground text-xs">
          Máximo de 3 atributos por produto — acima disso a matriz de
          combinações fica impossível de gerir.
        </p>
      ) : null}
    </div>
  );
}
