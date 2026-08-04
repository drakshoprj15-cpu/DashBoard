"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Menu, Search } from "lucide-react";

import { findActiveSubItem, isHrefActive, navigation } from "@/lib/navigation";
import type { SessionUser } from "@/lib/auth/session";
import { logoutAction } from "@/features/auth/actions";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Sidebar } from "@/components/layout/sidebar";
import { ThemeToggle } from "@/components/layout/theme-toggle";

interface HeaderProps {
  user: SessionUser;
  demoMode: boolean;
  /** Notificações por ler, para o contador do sino */
  unreadCount: number;
}

function usePageTitle(): string {
  const pathname = usePathname();
  for (const item of navigation) {
    if (item.items) {
      const sub = findActiveSubItem(item.items, pathname);
      if (sub) return `${item.title} · ${sub.title}`;
    }
    if (item.href && isHrefActive(pathname, item.href)) {
      return item.title;
    }
  }
  return "Painel";
}

export function Header({ user, demoMode, unreadCount }: HeaderProps) {
  const title = usePageTitle();
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  const initials = user.name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <header className="bg-background/80 sticky top-0 z-40 flex h-16 shrink-0 items-center gap-3 border-b px-4 backdrop-blur-sm md:px-6">
      {/* Drawer mobile */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-label="Abrir menu"
          >
            <Menu className="size-5" />
          </Button>
        </SheetTrigger>
        <SheetContent
          side="left"
          className="w-64 border-0 p-0 sm:max-w-64"
          showClose={false}
        >
          <SheetTitle className="sr-only">Menu de navegação</SheetTitle>
          <Sidebar
            user={user}
            demoMode={demoMode}
            initialCollapsed={false}
            inDrawer
            onNavigate={() => setDrawerOpen(false)}
          />
        </SheetContent>
      </Sheet>

      <h1 className="truncate text-base font-semibold md:text-lg">{title}</h1>

      <div className="ml-auto flex items-center gap-1.5 md:gap-2">
        {/* Busca */}
        <div className="relative hidden lg:block">
          <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input
            placeholder="Buscar pedidos, produtos, clientes…"
            className="bg-card w-72 pl-8"
            aria-label="Busca global"
          />
        </div>

        {/* Notificações */}
        <Button
          variant="ghost"
          size="icon"
          aria-label={
            unreadCount > 0
              ? `Notificações (${unreadCount} por ler)`
              : "Notificações"
          }
          className="relative"
          asChild
        >
          <Link href="/notificacoes">
            <Bell className="size-4.5" />
            {unreadCount > 0 && (
              <span className="bg-primary text-primary-foreground absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full text-[10px] font-bold">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </Link>
        </Button>

        <ThemeToggle />

        {/* Menu do usuário */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Menu do usuário"
              className="focus-visible:ring-ring ml-1 rounded-full outline-none focus-visible:ring-2"
            >
              <Avatar>
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <p className="truncate">{user.name}</p>
              <p className="text-muted-foreground truncate text-xs font-normal">
                {user.email}
              </p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/configuracoes">Configurações</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/loja" target="_blank">
                Ver loja
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onClick={() => logoutAction()}
            >
              Terminar sessão
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
