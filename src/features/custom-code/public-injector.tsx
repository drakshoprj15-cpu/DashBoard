import Script from "next/script";

import { getActiveCustomCodeForPublic } from "@/features/custom-code/queries";
import { ConsentGate } from "@/features/consent/consent-gate";

/**
 * Código personalizado + Meta Pixel do produto, injetado o mais cedo
 * possível na página pública — antes do conteúdo visível.
 *
 * Fora do root layout, o App Router não deixa uma página injetar conteúdo
 * bruto dentro do `<head>` real (só `app/layout.tsx` controla o `<head>`, e
 * ele é compartilhado por todo o app — painel incluído). `next/script` com
 * `afterInteractive` funciona a partir de qualquer ponto da árvore, o mesmo
 * padrão já usado em `PixelScripts` para os pixels do workspace, então o
 * Meta Pixel e o JS personalizado funcionam normalmente mesmo não estando
 * fisicamente no `<head>`. HTML solto (ex.: uma meta tag colada pelo
 * lojista) é aplicado da mesma forma — funciona para scripts e elementos
 * visíveis, mas uma `<meta>` colada aqui não tem o mesmo efeito que teria
 * dentro do `<head>` real.
 */
export async function ProductCustomCodeTop({ productId }: { productId: string }) {
  const code = await getActiveCustomCodeForPublic(productId);
  if (!code) return null;

  return (
    <>
      {code.customCss && (
        <style dangerouslySetInnerHTML={{ __html: code.customCss }} />
      )}

      {code.customHeadCode && (
        <div
          data-custom-code="head"
          style={{ display: "contents" }}
          dangerouslySetInnerHTML={{ __html: code.customHeadCode }}
        />
      )}

      {code.customBodyStartCode && (
        <div
          data-custom-code="body-start"
          style={{ display: "contents" }}
          dangerouslySetInnerHTML={{ __html: code.customBodyStartCode }}
        />
      )}

      {code.metaPixelEnabled && code.metaPixelId && (
        <ConsentGate>
          <Script id={`product-meta-pixel-${productId}`} strategy="afterInteractive">
            {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
document,'script','https://connect.facebook.net/en_US/fbevents.js');
fbq('init','${code.metaPixelId}');
fbq('track','PageView');`}
          </Script>
          <noscript>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              height="1"
              width="1"
              alt=""
              style={{ display: "none" }}
              src={`https://www.facebook.com/tr?id=${code.metaPixelId}&ev=PageView&noscript=1`}
            />
          </noscript>
        </ConsentGate>
      )}

      {code.customJavaScript && (
        <Script id={`product-custom-js-${productId}`} strategy="afterInteractive">
          {code.customJavaScript}
        </Script>
      )}
    </>
  );
}

/** Código personalizado do fim do `<body>` — renderizado após todo o conteúdo. */
export async function ProductCustomCodeBottom({
  productId,
}: {
  productId: string;
}) {
  const code = await getActiveCustomCodeForPublic(productId);
  if (!code || !code.customBodyEndCode) return null;

  return (
    <div
      data-custom-code="body-end"
      style={{ display: "contents" }}
      dangerouslySetInnerHTML={{ __html: code.customBodyEndCode }}
    />
  );
}
