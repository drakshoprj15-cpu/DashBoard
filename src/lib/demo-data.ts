/**
 * DADOS DE DEMONSTRAÇÃO — usados exclusivamente quando o banco não está
 * conectado (modo demo). Nunca são misturados com dados reais: quando o
 * Supabase estiver configurado, as páginas passam a consultar o banco
 * (Fase 5) e este módulo deixa de ser usado.
 */

export interface DemoKpi {
  label: string;
  value: string;
  change: number;
  tone?: "success" | "warning" | "destructive" | "info";
}

export const demoKpis: DemoKpi[] = [
  { label: "Receita aprovada", value: "R$ 24.830,50", change: 12.4, tone: "success" },
  { label: "Receita pendente", value: "R$ 3.215,00", change: -4.1, tone: "warning" },
  { label: "Total de pedidos", value: "412", change: 8.2 },
  { label: "Ticket médio", value: "R$ 87,90", change: 2.7 },
  { label: "Taxa de conversão", value: "3,4%", change: 0.6, tone: "info" },
  { label: "Carrinhos abandonados", value: "89", change: -11.3, tone: "destructive" },
];

export const demoRevenueByDay = [
  { day: "22/07", aprovada: 2840, pendente: 420 },
  { day: "23/07", aprovada: 3120, pendente: 310 },
  { day: "24/07", aprovada: 2650, pendente: 540 },
  { day: "25/07", aprovada: 4210, pendente: 380 },
  { day: "26/07", aprovada: 3890, pendente: 620 },
  { day: "27/07", aprovada: 4560, pendente: 450 },
  { day: "28/07", aprovada: 3560, pendente: 495 },
];

export const demoTopProducts = [
  { position: 1, name: "Curso Tráfego Pago Pro", sold: 142, revenue: "R$ 9.940,00", conversion: "4,8%" },
  { position: 2, name: "Mentoria Individual", sold: 38, revenue: "R$ 7.600,00", conversion: "2,1%" },
  { position: 3, name: "E-book Escala Criativa", sold: 210, revenue: "R$ 4.190,00", conversion: "6,3%" },
  { position: 4, name: "Template Pack Anúncios", sold: 96, revenue: "R$ 2.870,00", conversion: "3,9%" },
];

export const demoRecentOrders = [
  { ref: "#IN-1042", customer: "Mariana S.", product: "Curso Tráfego Pago Pro", total: "R$ 297,00", status: "Pago", gateway: "Stripe", date: "28/07 14:32" },
  { ref: "#IN-1041", customer: "João P.", product: "E-book Escala Criativa", total: "R$ 19,90", status: "Pago", gateway: "Mercado Pago", date: "28/07 14:10" },
  { ref: "#IN-1040", customer: "Carla M.", product: "Mentoria Individual", total: "R$ 497,00", status: "Pendente", gateway: "Pagar.me", date: "28/07 13:55" },
  { ref: "#IN-1039", customer: "Rafael T.", product: "Template Pack Anúncios", total: "R$ 47,00", status: "Recusado", gateway: "Stripe", date: "28/07 13:21" },
  { ref: "#IN-1038", customer: "Beatriz L.", product: "Curso Tráfego Pago Pro", total: "R$ 297,00", status: "Pago", gateway: "Stripe", date: "28/07 12:47" },
];
