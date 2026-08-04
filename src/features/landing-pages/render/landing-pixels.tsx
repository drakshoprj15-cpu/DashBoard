import Script from "next/script";

import { ConsentGate } from "@/features/consent/consent-gate";

import type { LandingCustomCode, LandingTracking } from "../types";

/**
 * Pixels configurados **nesta** landing page, além dos pixels globais do
 * workspace (esses continuam vindo de `PixelScripts`).
 *
 * O Meta Pixel NÃO é renderizado aqui — é responsabilidade única de
 * `PixelScripts` (com `landingPageId`), que já resolve a regra de fallback
 * específico-vs-global. Renderizar aqui também disparava os dois ao mesmo
 * tempo em páginas com pixel próprio.
 *
 * Todos ficam atrás do `ConsentGate`: nada dispara antes de o visitante
 * aceitar cookies. `Purchase` nunca é disparado aqui — só o servidor.
 */
export function LandingPixels({
  tracking,
  pageId,
}: {
  tracking: LandingTracking;
  pageId: string;
}) {
  const hasAny =
    tracking.tiktokPixelId || tracking.ga4MeasurementId || tracking.gtmContainerId;

  if (!hasAny) return null;

  return (
    <ConsentGate>
      {tracking.gtmContainerId ? (
        <Script id={`lp-gtm-${pageId}`} strategy="afterInteractive">
          {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${tracking.gtmContainerId}');`}
        </Script>
      ) : null}

      {tracking.ga4MeasurementId ? (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${tracking.ga4MeasurementId}`}
            strategy="afterInteractive"
          />
          <Script id={`lp-ga4-${pageId}`} strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}
gtag('js',new Date());gtag('config','${tracking.ga4MeasurementId}');`}
          </Script>
        </>
      ) : null}

      {tracking.tiktokPixelId ? (
        <Script id={`lp-tiktok-${pageId}`} strategy="afterInteractive">
          {`!function(w,d,t){w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];
ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie"];
ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};
for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);
ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e};
ttq.load=function(e,n){var r="https://analytics.tiktok.com/i18n/pixel/events.js";
ttq._i=ttq._i||{};ttq._i[e]=[];ttq._i[e]._u=r;ttq._t=ttq._t||{};ttq._t[e]=+new Date;
ttq._o=ttq._o||{};ttq._o[e]=n||{};var o=d.createElement("script");o.type="text/javascript";
o.async=!0;o.src=r+"?sdkid="+e+"&lib="+t;var a=d.getElementsByTagName("script")[0];
a.parentNode.insertBefore(o,a)};
ttq.load('${tracking.tiktokPixelId}');ttq.page();
}(window,document,'ttq');`}
        </Script>
      ) : null}
    </ConsentGate>
  );
}

/**
 * Código personalizado da página. Executa **somente aqui**, na página
 * pública — o painel nunca avalia nada disto.
 */
export function LandingCustomCodeTop({
  code,
  pageId,
}: {
  code: LandingCustomCode;
  pageId: string;
}) {
  return (
    <>
      {code.headCode ? (
        <div
          data-lp-code="head"
          style={{ display: "contents" }}
          dangerouslySetInnerHTML={{ __html: code.headCode }}
        />
      ) : null}
      {code.bodyStartCode ? (
        <div
          data-lp-code="body-start"
          style={{ display: "contents" }}
          dangerouslySetInnerHTML={{ __html: code.bodyStartCode }}
        />
      ) : null}
      {code.javascript ? (
        <Script id={`lp-custom-js-${pageId}`} strategy="afterInteractive">
          {code.javascript}
        </Script>
      ) : null}
    </>
  );
}

export function LandingCustomCodeBottom({ code }: { code: LandingCustomCode }) {
  if (!code.bodyEndCode) return null;
  return (
    <div
      data-lp-code="body-end"
      style={{ display: "contents" }}
      dangerouslySetInnerHTML={{ __html: code.bodyEndCode }}
    />
  );
}
