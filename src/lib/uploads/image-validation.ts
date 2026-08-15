import "server-only";

const IMAGE_SIGNATURES = {
  "image/png": {
    extension: "png",
    matches: (bytes: Uint8Array) =>
      bytes.length >= 8 &&
      [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every(
        (byte, index) => bytes[index] === byte,
      ),
  },
  "image/jpeg": {
    extension: "jpg",
    matches: (bytes: Uint8Array) =>
      bytes.length >= 3 &&
      bytes[0] === 0xff &&
      bytes[1] === 0xd8 &&
      bytes[2] === 0xff,
  },
  "image/webp": {
    extension: "webp",
    matches: (bytes: Uint8Array) =>
      bytes.length >= 12 &&
      new TextDecoder("ascii").decode(bytes.slice(0, 4)) === "RIFF" &&
      new TextDecoder("ascii").decode(bytes.slice(8, 12)) === "WEBP",
  },
} as const;

export const SAFE_IMAGE_MIME_TYPES = Object.keys(IMAGE_SIGNATURES);

export type ValidatedImage =
  | {
      ok: true;
      bytes: Uint8Array;
      contentType: keyof typeof IMAGE_SIGNATURES;
      extension: string;
    }
  | { ok: false; error: string };

/** SVG fica desativado: sem sanitizador dedicado, XML ativo não é upload seguro. */
export async function validateRasterImage(
  file: File,
  maxSizeBytes: number,
): Promise<ValidatedImage> {
  if (file.size <= 0 || file.size > maxSizeBytes) {
    return {
      ok: false,
      error: `Imagem inválida ou maior que ${Math.floor(maxSizeBytes / 1024 / 1024)} MB.`,
    };
  }

  const claimedType = file.type as keyof typeof IMAGE_SIGNATURES;
  const signature = IMAGE_SIGNATURES[claimedType];
  if (!signature) {
    return { ok: false, error: "Formato inválido. Use PNG, JPEG ou WebP." };
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!signature.matches(bytes)) {
    return {
      ok: false,
      error: "O conteúdo do arquivo não corresponde ao formato informado.",
    };
  }

  return {
    ok: true,
    bytes,
    contentType: claimedType,
    extension: signature.extension,
  };
}
