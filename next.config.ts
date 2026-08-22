import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Sem isso, o next/image bloqueia qualquer imagem hospedada fora do
    // próprio domínio — foto de produto, logo do checkout e da loja ficam
    // com o ícone de imagem quebrada mesmo com a URL correta salva no banco.
    remotePatterns: [
      // Supabase Storage: destino do upload de imagens do painel
      // (produtos, logo do checkout, logo da loja).
      { protocol: "https", hostname: "*.supabase.co", pathname: "/storage/v1/object/public/**" },
      // Vercel Blob Storage: imagens de produto cadastradas antes do
      // upload próprio existir.
      { protocol: "https", hostname: "*.public.blob.vercel-storage.com" },
    ],
  },
  // Os sites estáticos de `landing-sites/` não são importados por nenhum
  // módulo — são lidos do disco na hora de publicar. Sem os declarar aqui, o
  // rastreio de ficheiros não os inclui no pacote da função e o botão
  // "Republicar na Vercel" falha em produção com "pasta não encontrada".
  //
  // A pasta vai inteira, e não só `public/`: a página publicada sai do
  // `build.mjs` para `public/lp/`, que não é versionado. Com apenas `public/`
  // no pacote, o envio subia os recursos sem a página e sem o script que a
  // gera, e o build do deploy morria em "Cannot find module build.mjs".
  outputFileTracingIncludes: {
    "/landing-pages": ["./landing-sites/**"],
  },
};

export default nextConfig;
