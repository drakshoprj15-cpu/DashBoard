import { describe, expect, it } from "vitest";

import {
  analyzeCodeRisks,
  guardScript,
  isValidLandingSlug,
  sanitizeCss,
  sanitizeHtml,
  slugifyLanding,
} from "@/features/landing-pages/sanitize";

describe("sanitizeHtml", () => {
  it("remove scripts com o respetivo conteúdo", () => {
    const result = sanitizeHtml('<p>Olá</p><script>alert("x")</script>');
    expect(result).toBe("<p>Olá</p>");
    expect(result).not.toContain("alert");
  });

  it("remove scripts aninhados que tentam sobreviver a uma única passagem", () => {
    const result = sanitizeHtml("<scr<script>ipt>alert(1)</script>");
    expect(result.toLowerCase()).not.toContain("<script");
    expect(result).not.toContain("alert(1)");
  });

  it("remove iframes, formulários e style", () => {
    const result = sanitizeHtml(
      '<iframe src="https://mau.example"></iframe><form action="/roubo"></form><style>body{}</style>',
    );
    expect(result).toBe("");
  });

  it("remove atributos de evento", () => {
    const result = sanitizeHtml('<div onclick="roubar()">texto</div>');
    expect(result).toBe("<div>texto</div>");
  });

  it("bloqueia javascript: em href", () => {
    const result = sanitizeHtml('<a href="javascript:alert(1)">clique</a>');
    expect(result).toBe("<a>clique</a>");
  });

  it("bloqueia javascript: escrito com espaços e entidades de escape", () => {
    const result = sanitizeHtml('<a href="java script:alert(1)">clique</a>');
    expect(result).not.toContain("href");
  });

  it("mantém data:image mas rejeita outros data:", () => {
    expect(sanitizeHtml('<img src="data:image/png;base64,AAA" alt="a">')).toContain(
      "data:image/png",
    );
    expect(
      sanitizeHtml('<img src="data:text/html;base64,AAA" alt="a">'),
    ).not.toContain("data:text/html");
  });

  it("preserva marcação permitida e atributos seguros", () => {
    const result = sanitizeHtml(
      '<p class="lead"><strong>Oferta</strong> <a href="https://loja.pt" title="loja">aqui</a></p>',
    );
    expect(result).toContain("<strong>Oferta</strong>");
    expect(result).toContain('href="https://loja.pt"');
    expect(result).toContain('class="lead"');
  });

  it("acrescenta rel seguro a links que abrem noutro separador", () => {
    const result = sanitizeHtml('<a href="https://x.pt" target="_blank">ir</a>');
    expect(result).toContain('rel="noopener noreferrer"');
  });

  it("limpa declarações perigosas do atributo style", () => {
    const result = sanitizeHtml(
      '<div style="color:red;background:url(javascript:alert(1))">a</div>',
    );
    expect(result).toContain("color:red");
    expect(result).not.toContain("url(");
  });

  it("devolve vazio para entrada vazia", () => {
    expect(sanitizeHtml("")).toBe("");
  });
});

describe("sanitizeCss", () => {
  it("remove @import e expressões antigas", () => {
    const result = sanitizeCss(
      '@import url("https://mau.example/x.css"); a{color:red} b{width:expression(alert(1))}',
    );
    expect(result).not.toContain("@import");
    expect(result).not.toContain("expression(");
    expect(result).toContain("color:red");
  });

  it("impede fechar a tag style", () => {
    expect(sanitizeCss("a{} </style><script>x</script>")).not.toContain("</style>");
  });
});

describe("guardScript", () => {
  it("impede o script de fechar a própria tag", () => {
    expect(guardScript('var a = "</script>";')).not.toContain("</script>");
  });
});

describe("slugifyLanding", () => {
  it("normaliza acentos, espaços e maiúsculas", () => {
    expect(slugifyLanding("LP Verão — TikTok")).toBe("lp-verao-tiktok");
  });

  it("descarta caracteres de caminho", () => {
    expect(slugifyLanding("../../etc/passwd")).toBe("etc-passwd");
  });

  it("limita o comprimento", () => {
    expect(slugifyLanding("a".repeat(200)).length).toBeLessThanOrEqual(60);
  });
});

describe("isValidLandingSlug", () => {
  it("aceita slugs bem formados", () => {
    expect(isValidLandingSlug("lp-verao-2026")).toBe(true);
  });

  it("recusa slugs reservados pelo sistema", () => {
    expect(isValidLandingSlug("api")).toBe(false);
    expect(isValidLandingSlug("checkout")).toBe(false);
    expect(isValidLandingSlug("lp")).toBe(false);
  });

  it("recusa formatos inválidos", () => {
    expect(isValidLandingSlug("ab")).toBe(false);
    expect(isValidLandingSlug("LP-Verao")).toBe(false);
    expect(isValidLandingSlug("lp--verao")).toBe(false);
    expect(isValidLandingSlug("-lp")).toBe(false);
    expect(isValidLandingSlug("lp/verao")).toBe(false);
  });
});

describe("analyzeCodeRisks", () => {
  it("avisa sobre document.write e eval", () => {
    const risks = analyzeCodeRisks({ javascript: "document.write('x'); eval('y')" });
    expect(risks.filter((risk) => risk.level === "warning").length).toBe(2);
  });

  it("não inventa avisos para código simples", () => {
    expect(analyzeCodeRisks({ javascript: "console.log(1)" })).toHaveLength(0);
  });
});
