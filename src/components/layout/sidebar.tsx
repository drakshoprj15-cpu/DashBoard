"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, ChevronsLeft, LifeBuoy, LogOut, Zap } from "lucide-react";

import { cn } from "@/lib/utils";
import { brand } from "@/lib/brand";
import {
  findActiveSubItem,
  isHrefActive,
  navigation,
  SIDEBAR_COOKIE,
  type NavItem,
} from "@/lib/navigation";
import { logoutAction } from "@/features/auth/actions";
import type { SessionUser } from "@/lib/auth/session";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface SidebarProps {
  user: SessionUser;
  demoMode: boolean;
  initialCollapsed: boolean;
  /** Fecha o drawer no mobile após navegar */
  onNavigate?: () => void;
  /** Quando renderizada dentro do drawer mobile, não permite recolher */
  inDrawer?: boolean;
}

function isItemActive(item: NavItem, pathname: string): boolean {
  if (item.href) {
    return item.href === "/dashboard" || item.href === "/loja"
      ? pathname === item.href
      : isHrefActive(pathname, item.href);
  }
  return findActiveSubItem(item.items ?? [], pathname) !== undefined;
}

export function Sidebar({
  user,
  demoMode,
  initialCollapsed,
  onNavigate,
  inDrawer = false,
}: SidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = React.useState(
    inDrawer ? false : initialCollapsed,
  );
  const [openMenus, setOpenMenus] = React.useState<string[]>(() =>
    navigation
      .filter((item) => item.items && isItemActive(item, pathname))
      .map((item) => item.title),
  );

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    document.cookie = `${SIDEBAR_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
  }

  function toggleMenu(title: string) {
    setOpenMenus((prev) =>
      prev.includes(title) ? prev.filter((t) => t !== title) : [...prev, title],
    );
  }

  const initials = user.name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <aside
      data-collapsed={collapsed}
      className={cn(
        "bg-sidebar text-sidebar-foreground flex h-full flex-col transition-[width] duration-200",
        collapsed ? "w-[68px]" : "w-64",
      )}
    >
      {/* Marca + botão de recolher */}
      <div
        className={cn(
          "flex h-16 shrink-0 items-center gap-2 px-4",
          collapsed && "justify-center px-2",
        )}
      >
        <Link
          href="/dashboard"
          className="flex items-center gap-2"
          onClick={onNavigate}
        >
          <div className="bg-sidebar-primary text-sidebar-primary-foreground flex size-8 shrink-0 items-center justify-center rounded-lg">
            <Zap className="size-4.5" />
          </div>
          {!collapsed && (
            <span className="text-base font-bold tracking-tight text-white">
              {brand.name}
            </span>
          )}
        </Link>
        {!collapsed && !inDrawer && (
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label="Recolher menu"
            className="text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-accent-foreground ml-auto flex size-7 items-center justify-center rounded-md transition-colors"
          >
            <ChevronsLeft className="size-4" />
          </button>
        )}
      </div>

      {collapsed && !inDrawer && (
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label="Expandir menu"
          className="text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-accent-foreground mx-auto mb-1 flex size-7 items-center justify-center rounded-md transition-colors"
        >
          <ChevronsLeft className="size-4 rotate-180" />
        </button>
      )}

      {/* Navegação */}
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-2">
        {navigation.map((item) => {
          const active = isItemActive(item, pathname);
          const Icon = item.icon;

          if (item.items && !collapsed) {
            const open = openMenus.includes(item.title);
            return (
              <div key={item.title}>
                <button
                  type="button"
                  onClick={() => toggleMenu(item.title)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    active
                      ? "text-sidebar-accent-foreground"
                      : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  )}
                >
                  <Icon className="size-4.5 shrink-0" />
                  <span className="flex-1 text-left">{item.title}</span>
                  <ChevronDown
                    className={cn(
                      "size-4 transition-transform",
                      open && "rotate-180",
                    )}
                  />
                </button>
                {open && (
                  <div className="border-sidebar-border mt-0.5 ml-[1.35rem] space-y-0.5 border-l pl-3">
                    {item.items.map((sub) => {
                      const subActive =
                        findActiveSubItem(item.items ?? [], pathname)?.href ===
                        sub.href;
                      return (
                        <Link
                          key={sub.href}
                          href={sub.href}
                          onClick={onNavigate}
                          className={cn(
                            "block rounded-md px-3 py-1.5 text-sm transition-colors",
                            subActive
                              ? "bg-sidebar-primary/15 text-sidebar-primary font-medium"
                              : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                          )}
                        >
                          {sub.title}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          }

          // Item simples (ou grupo recolhido — vai para o primeiro subitem)
          const href = item.href ?? item.items?.[0]?.href ?? "#";
          const link = (
            <Link
              key={item.title}
              href={href}
              onClick={onNavigate}
              target={item.href === "/loja" ? "_blank" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                collapsed && "justify-center px-2",
                active
                  ? "bg-sidebar-primary/15 text-sidebar-primary"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              )}
            >
              <Icon className="size-4.5 shrink-0" />
              {!collapsed && <span>{item.title}</span>}
            </Link>
          );

          if (collapsed) {
            return (
              <Tooltip key={item.title}>
                <TooltipTrigger asChild>{link}</TooltipTrigger>
                <TooltipContent side="right">{item.title}</TooltipContent>
              </Tooltip>
            );
          }
          return link;
        })}
      </nav>

      {/* Rodapé: plano, workspace, usuário, suporte, status */}
      <div className="border-sidebar-border shrink-0 border-t p-3">
        {!collapsed ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-white">
                  Workspace Principal
                </p>
                <Badge
                  variant="outline"
                  className="border-sidebar-border text-sidebar-muted mt-0.5 text-[10px]"
                >
                  {demoMode ? "Plano Demo" : "Plano Free"}
                </Badge>
              </div>
              <a
                href={`mailto:${brand.supportEmail}`}
                aria-label="Suporte"
                className="text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-accent-foreground flex size-8 shrink-0 items-center justify-center rounded-md transition-colors"
              >
                <LifeBuoy className="size-4" />
              </a>
            </div>
            <Separator className="bg-sidebar-border" />
            <div className="flex items-center gap-2.5">
              <Avatar>
                <AvatarFallback className="bg-sidebar-primary/20 text-sidebar-primary">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-white">
                  {user.name}
                </p>
                <p className="text-sidebar-muted truncate text-xs">
                  {user.email}
                </p>
              </div>
              <form action={logoutAction}>
                <button
                  type="submit"
                  aria-label="Terminar sessão"
                  className="text-sidebar-muted hover:bg-sidebar-accent hover:text-destructive flex size-8 items-center justify-center rounded-md transition-colors"
                >
                  <LogOut className="size-4" />
                </button>
              </form>
            </div>
            <div className="flex items-center gap-1.5">
              <span
                className={cn(
                  "size-1.5 rounded-full",
                  demoMode ? "bg-warning" : "bg-success",
                )}
              />
              <span className="text-sidebar-muted text-[11px]">
                {demoMode
                  ? "Modo demonstração — banco desconectado"
                  : "Todos os sistemas operacionais"}
              </span>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Avatar>
                  <AvatarFallback className="bg-sidebar-primary/20 text-sidebar-primary">
                    {initials}
                  </AvatarFallback>
                </Avatar>
              </TooltipTrigger>
              <TooltipContent side="right">
                {user.name} — {user.email}
              </TooltipContent>
            </Tooltip>
            <form action={logoutAction}>
              <button
                type="submit"
                aria-label="Terminar sessão"
                className="text-sidebar-muted hover:bg-sidebar-accent hover:text-destructive flex size-8 items-center justify-center rounded-md transition-colors"
              >
                <LogOut className="size-4" />
              </button>
            </form>
          </div>
        )}
      </div>
    </aside>
  );
}
