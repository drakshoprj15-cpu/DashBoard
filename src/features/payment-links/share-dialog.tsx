"use client";

import * as React from "react";
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  MessageCircle,
  QrCode,
  Share2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Partilha de um link criado: endereço, QR Code e envio por WhatsApp.
 *
 * O QR é gerado no navegador, sob demanda — nada é enviado a um serviço de
 * terceiros para desenhar o código, e a biblioteca só entra no bundle quando
 * o diálogo abre.
 */

export interface ShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  url: string;
  title?: string;
  /** Diálogo aberto logo após criar o link */
  justCreated?: boolean;
}

export function ShareDialog({
  open,
  onOpenChange,
  url,
  title,
  justCreated = false,
}: ShareDialogProps) {
  // O QR guarda de que URL foi gerado. Assim o skeleton aparece enquanto o
  // código do endereço atual não estiver pronto, sem precisar limpar o
  // estado dentro do efeito (o que dispararia um render em cascata).
  const [qr, setQr] = React.useState<{ url: string; data: string } | null>(
    null,
  );
  const [copied, setCopied] = React.useState(false);
  const qrDataUrl = qr?.url === url ? qr.data : null;

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;

    void (async () => {
      try {
        const { toDataURL } = await import("qrcode");
        const data = await toDataURL(url, {
          width: 480,
          margin: 1,
          errorCorrectionLevel: "M",
          color: { dark: "#111114", light: "#FFFFFF" },
        });
        if (!cancelled) setQr({ url, data });
      } catch (error) {
        console.error("[payment-links] falha ao gerar QR Code:", error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, url]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Link copiado");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Não foi possível copiar o link");
    }
  }

  async function share() {
    if (!navigator.share) {
      await copy();
      return;
    }
    try {
      await navigator.share({ title: title ?? "Link de pagamento", url });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      toast.error("Não foi possível partilhar o link");
    }
  }

  const whatsappHref = `https://wa.me/?text=${encodeURIComponent(
    `Olá! Segue o seu link de pagamento: ${url}`,
  )}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {justCreated ? "Link criado com sucesso" : "Partilhar link"}
          </DialogTitle>
          <DialogDescription>
            {title
              ? `Envie este endereço ao cliente para receber o pagamento de ${title}.`
              : "Envie este endereço ao cliente para receber o pagamento."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Input
              readOnly
              value={url}
              aria-label="Endereço do link de pagamento"
              onFocus={(e) => e.currentTarget.select()}
              className="font-mono text-xs"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={copy}
              aria-label="Copiar link"
            >
              {copied ? (
                <Check className="size-4 text-emerald-500" />
              ) : (
                <Copy className="size-4" />
              )}
            </Button>
          </div>

          <div className="bg-muted/40 flex flex-col items-center gap-2 rounded-lg border p-4">
            {qrDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={qrDataUrl}
                alt={`QR Code do link de pagamento ${url}`}
                className="size-40 rounded-md bg-white p-1.5"
              />
            ) : (
              <Skeleton className="size-40 rounded-md" />
            )}
            <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
              <QrCode className="size-3" aria-hidden="true" />
              Aponte a câmara para abrir a página de pagamento
            </p>
            {qrDataUrl ? (
              <Button type="button" variant="ghost" size="sm" asChild>
                <a
                  href={qrDataUrl}
                  download={`qr-${title?.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "pagamento"}.png`}
                >
                  <Download className="size-3.5" aria-hidden="true" />
                  Baixar QR
                </a>
              </Button>
            ) : null}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            type="button"
            variant="outline"
            asChild
            className="w-full sm:w-auto"
          >
            <a href={whatsappHref} target="_blank" rel="noopener noreferrer">
              <MessageCircle className="size-4" />
              WhatsApp
            </a>
          </Button>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => void share()}
            >
              <Share2 className="size-4" />
              Compartilhar
            </Button>
            <Button type="button" variant="outline" asChild>
              <a href={url} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="size-4" />
                Abrir
              </a>
            </Button>
            <Button type="button" onClick={() => onOpenChange(false)}>
              Fechar
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
