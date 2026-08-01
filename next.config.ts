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
};

export default nextConfig;
