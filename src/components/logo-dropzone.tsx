"use client";

import { ImageDropzone } from "@/components/image-dropzone";

/**
 * Upload de logo (loja, checkout) — atalho sobre `ImageDropzone` já
 * apontado para `/api/uploads/logo`. Existe por compatibilidade com o
 * nome já usado nos formulários; para outros tipos de imagem (foto de
 * produto), use `ImageDropzone` diretamente com o endpoint apropriado.
 */
export function LogoDropzone({
  id,
  label = "Logo",
  value,
  onChange,
}: {
  id: string;
  label?: string;
  value: string;
  onChange: (url: string) => void;
}) {
  return (
    <ImageDropzone
      id={id}
      label={label}
      endpoint="/api/uploads/logo"
      value={value}
      onChange={onChange}
    />
  );
}
