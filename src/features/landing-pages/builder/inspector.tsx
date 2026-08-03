"use client";

import * as React from "react";
import { Info, MousePointerSquareDashed } from "lucide-react";

import { ImageDropzone } from "@/components/image-dropzone";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

import { getBlockDef, type FieldDef } from "../block-catalog";
import type { BlockPropValue, LandingBlock } from "../types";
import type { BuilderState } from "./use-builder-state";

const selectClass =
  "border-input bg-card focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px]";
const textareaClass =
  "border-input bg-card focus-visible:border-ring focus-visible:ring-ring/50 min-h-24 w-full rounded-md border px-3 py-2 font-sans text-sm shadow-xs outline-none focus-visible:ring-[3px]";

/**
 * Painel de propriedades do bloco selecionado.
 *
 * Os campos são gerados a partir do catálogo (`block-catalog.ts`) — nenhum
 * bloco tem formulário escrito à mão, então acrescentar um campo novo a um
 * bloco é acrescentar uma linha ao catálogo.
 */
export function BlockInspector({ state }: { state: BuilderState }) {
  const block = state.selectedBlock;

  if (!block) {
    return (
      <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-sm">
        <MousePointerSquareDashed className="size-8" />
        <p className="font-medium">Nenhum bloco selecionado</p>
        <p className="text-xs">
          Clique num bloco da página para editar o conteúdo e a aparência dele.
        </p>
      </div>
    );
  }

  const def = getBlockDef(block.type);
  if (!def) {
    return (
      <div className="p-4">
        <Alert>
          <Info />
          <AlertDescription>
            Este bloco (<code>{block.type}</code>) veio de uma versão antiga e
            já não existe no catálogo. Continua a ser renderizado, mas não pode
            ser editado aqui.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="border-b p-4">
        <p className="flex items-center gap-2 font-semibold">
          <def.icon className="text-primary size-4" /> {def.label}
        </p>
        <p className="text-muted-foreground mt-1 text-xs">{def.description}</p>
      </div>

      {def.notice ? (
        <div className="p-4 pb-0">
          <Alert>
            <Info />
            <AlertDescription>{def.notice}</AlertDescription>
          </Alert>
        </div>
      ) : null}

      <section className="space-y-4 p-4">
        <h3 className="text-muted-foreground text-[11px] font-semibold tracking-wide uppercase">
          Conteúdo
        </h3>
        {def.fields.map((field) => (
          <Field
            key={field.key}
            field={field}
            value={block.props[field.key]}
            onChange={(value) => state.updateBlockProp(block.id, field.key, value)}
          />
        ))}
      </section>

      <StyleSection block={block} state={state} />
    </div>
  );
}

function Field({
  field,
  value,
  onChange,
}: {
  field: FieldDef;
  value: BlockPropValue | undefined;
  onChange: (value: BlockPropValue) => void;
}) {
  const id = `field-${field.key}`;
  const asText = typeof value === "string" ? value : "";

  // Campos de imagem usam o mesmo carregador do resto do painel: arrastar e
  // soltar com upload real, em vez de pedir um endereço colado à mão.
  if (field.type === "image") {
    return (
      <div className="space-y-1.5">
        <ImageDropzone
          id={id}
          label={field.label}
          endpoint="/api/uploads/product-image"
          value={asText}
          onChange={(url) => onChange(url)}
        />
        {field.help ? (
          <p className="text-muted-foreground text-xs">{field.help}</p>
        ) : null}
      </div>
    );
  }

  if (field.type === "boolean") {
    return (
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Label htmlFor={id}>{field.label}</Label>
          {field.help ? (
            <p className="text-muted-foreground mt-0.5 text-xs">{field.help}</p>
          ) : null}
        </div>
        <Switch
          id={id}
          checked={value === true}
          onCheckedChange={(checked) => onChange(checked)}
        />
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{field.label}</Label>

      {field.type === "textarea" || field.type === "lines" ? (
        <textarea
          id={id}
          value={asText}
          placeholder={field.placeholder}
          onChange={(event) => onChange(event.target.value)}
          className={textareaClass}
        />
      ) : field.type === "code" ? (
        <textarea
          id={id}
          value={asText}
          onChange={(event) => onChange(event.target.value)}
          spellCheck={false}
          className={`${textareaClass} min-h-40 font-mono text-xs`}
        />
      ) : field.type === "select" ? (
        <select
          id={id}
          value={asText}
          onChange={(event) => onChange(event.target.value)}
          className={selectClass}
        >
          {field.options?.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : field.type === "number" ? (
        <Input
          id={id}
          type="number"
          min={field.min}
          max={field.max}
          value={typeof value === "number" ? value : ""}
          onChange={(event) =>
            onChange(event.target.value === "" ? 0 : Number(event.target.value))
          }
        />
      ) : field.type === "datetime" ? (
        <Input
          id={id}
          type="datetime-local"
          value={asText}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <Input
          id={id}
          value={asText}
          placeholder={field.placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
      )}

      {field.help ? (
        <p className="text-muted-foreground text-xs">{field.help}</p>
      ) : null}
    </div>
  );
}

function StyleSection({
  block,
  state,
}: {
  block: LandingBlock;
  state: BuilderState;
}) {
  const style = block.style ?? {};

  return (
    <section className="space-y-4 border-t p-4">
      <h3 className="text-muted-foreground text-[11px] font-semibold tracking-wide uppercase">
        Aparência e comportamento
      </h3>

      <div className="grid grid-cols-2 gap-3">
        <ColorField
          label="Fundo"
          value={style.background ?? ""}
          onChange={(value) => state.updateBlockStyle(block.id, { background: value })}
        />
        <ColorField
          label="Texto"
          value={style.textColor ?? ""}
          onChange={(value) => state.updateBlockStyle(block.id, { textColor: value })}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor={`pt-${block.id}`}>Espaço acima (px)</Label>
          <Input
            id={`pt-${block.id}`}
            type="number"
            min={0}
            max={400}
            value={style.paddingTop ?? 32}
            onChange={(event) =>
              state.updateBlockStyle(block.id, {
                paddingTop: Number(event.target.value),
              })
            }
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`pb-${block.id}`}>Espaço abaixo (px)</Label>
          <Input
            id={`pb-${block.id}`}
            type="number"
            min={0}
            max={400}
            value={style.paddingBottom ?? 32}
            onChange={(event) =>
              state.updateBlockStyle(block.id, {
                paddingBottom: Number(event.target.value),
              })
            }
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`align-${block.id}`}>Alinhamento</Label>
        <select
          id={`align-${block.id}`}
          className={selectClass}
          value={style.align ?? "left"}
          onChange={(event) =>
            state.updateBlockStyle(block.id, {
              align: event.target.value as "left" | "center" | "right",
            })
          }
        >
          <option value="left">Esquerda</option>
          <option value="center">Centro</option>
          <option value="right">Direita</option>
        </select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`vis-${block.id}`}>Aparece em</Label>
        <select
          id={`vis-${block.id}`}
          className={selectClass}
          value={style.visibility ?? "all"}
          onChange={(event) =>
            state.updateBlockStyle(block.id, {
              visibility: event.target.value as "all" | "desktop" | "mobile",
            })
          }
        >
          <option value="all">Todos os dispositivos</option>
          <option value="desktop">Só computador</option>
          <option value="mobile">Só telemóvel</option>
        </select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`anim-${block.id}`}>Animação de entrada</Label>
        <select
          id={`anim-${block.id}`}
          className={selectClass}
          value={style.animation ?? "none"}
          onChange={(event) =>
            state.updateBlockStyle(block.id, {
              animation: event.target.value as "none" | "fade" | "rise",
            })
          }
        >
          <option value="none">Nenhuma</option>
          <option value="fade">Suave (opacidade)</option>
          <option value="rise">Subir</option>
        </select>
        <p className="text-muted-foreground text-xs">
          Respeita a preferência do sistema por menos movimento.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`anchor-${block.id}`}>Identificador (âncora)</Label>
        <Input
          id={`anchor-${block.id}`}
          value={block.anchorId ?? ""}
          placeholder="comprar"
          onChange={(event) =>
            state.updateBlockMeta(block.id, {
              anchorId: event.target.value.replace(/[^a-zA-Z0-9-_]/g, ""),
            })
          }
        />
        <p className="text-muted-foreground text-xs">
          Usado em links internos (#identificador) e para identificar cliques
          nas métricas.
        </p>
      </div>
    </section>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const id = `color-${label.replace(/\s/g, "-").toLowerCase()}`;

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-1.5">
        <input
          id={id}
          type="color"
          value={value || "#ffffff"}
          onChange={(event) => onChange(event.target.value)}
          className="size-9 shrink-0 cursor-pointer rounded border"
          aria-label={label}
        />
        <Input
          value={value}
          placeholder="herdar"
          onChange={(event) => onChange(event.target.value)}
          className="font-mono text-xs uppercase"
        />
      </div>
    </div>
  );
}
