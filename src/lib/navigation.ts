import {
  LayoutDashboard,
  Eye,
  Wallet,
  Megaphone,
  Package,
  CreditCard,
  ShoppingBag,
  ShoppingCart,
  Users,
  Mail,
  PenTool,
  Radar,
  Bell,
  Rocket,
  Blocks,
  Webhook,
  ScrollText,
  Settings,
  Store,
  type LucideIcon,
} from "lucide-react";

export interface NavSubItem {
  title: string;
  href: string;
}

export interface NavItem {
  title: string;
  href?: string;
  icon: LucideIcon;
  /** Fase em que o módulo será implementado (para empty states) */
  phase?: number;
  items?: NavSubItem[];
}

/**
 * Estrutura do menu lateral — espelha exatamente o briefing.
 */
export const navigation: NavItem[] = [
  { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { title: "Live View", href: "/live-view", icon: Eye, phase: 5 },
  {
    title: "Financeiro",
    icon: Wallet,
    phase: 6,
    items: [
      { title: "Visão Geral", href: "/financeiro" },
      { title: "Entradas/Saídas", href: "/financeiro/entradas-saidas" },
      { title: "Processador", href: "/financeiro/processador" },
      { title: "Repasses", href: "/financeiro/repasses" },
      { title: "Link de pagamento", href: "/financeiro/links-de-pagamento" },
    ],
  },
  { title: "Campanhas", href: "/campanhas", icon: Megaphone, phase: 5 },
  {
    title: "Catálogo",
    icon: Package,
    phase: 2,
    items: [
      { title: "Produtos", href: "/catalogo/produtos" },
      { title: "Categorias", href: "/catalogo/categorias" },
      { title: "Estoque", href: "/catalogo/estoque" },
      { title: "Cupons", href: "/catalogo/cupons" },
      { title: "Provas sociais", href: "/provas-sociais" },
    ],
  },
  { title: "Checkouts", href: "/checkouts", icon: CreditCard, phase: 3 },
  { title: "Pedidos", href: "/pedidos", icon: ShoppingBag, phase: 4 },
  { title: "Carrinhos", href: "/carrinhos", icon: ShoppingCart, phase: 9 },
  { title: "Clientes", href: "/clientes", icon: Users, phase: 9 },
  { title: "Emails", href: "/emails", icon: Mail, phase: 9 },
  {
    title: "Editor",
    icon: PenTool,
    phase: 8,
    items: [
      { title: "Editor da loja", href: "/editor/loja" },
      { title: "Editor de landing page", href: "/editor/landing-page" },
      { title: "Editor de checkout", href: "/editor/checkout" },
      { title: "Fretes", href: "/editor/fretes" },
    ],
  },
  { title: "Pixel", href: "/pixel", icon: Radar, phase: 7 },
  {
    title: "Notificações",
    icon: Bell,
    phase: 9,
    items: [
      { title: "Todas", href: "/notificacoes" },
      { title: "Pushcut", href: "/notificacoes#pushcut" },
    ],
  },
  {
    title: "Landing pages",
    icon: Rocket,
    phase: 8,
    items: [
      { title: "Páginas", href: "/landing-pages" },
      { title: "Domínios", href: "/landing-pages/dominios" },
    ],
  },
  { title: "Integrações", href: "/integracoes", icon: Blocks, phase: 7 },
  { title: "Webhooks", href: "/webhooks", icon: Webhook, phase: 4 },
  { title: "Logs", href: "/logs", icon: ScrollText, phase: 7 },
  { title: "Configurações", href: "/configuracoes", icon: Settings, phase: 1 },
  { title: "Ver loja", href: "/loja", icon: Store, phase: 2 },
];

/** O caminho atual está dentro desta rota? */
export function isHrefActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href + "/");
}

/**
 * Sub-item ativo de um grupo: entre os que casam, o de href mais específico.
 *
 * Sem isso, `/landing-pages/dominios` também marcaria `/landing-pages` como
 * ativo — um é prefixo do outro.
 */
export function findActiveSubItem(
  items: NavSubItem[],
  pathname: string,
): NavSubItem | undefined {
  return items
    .filter((sub) => isHrefActive(pathname, sub.href))
    .sort((a, b) => b.href.length - a.href.length)[0];
}

/** Nome do cookie que persiste o estado recolhido da sidebar */
export const SIDEBAR_COOKIE = "infinity:sidebar-collapsed";
