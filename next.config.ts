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
  outputFileTracingIncludes: {
    "/landing-pages": ["./landing-sites/**/public/**"],
  },
};

export default nextConfig;
