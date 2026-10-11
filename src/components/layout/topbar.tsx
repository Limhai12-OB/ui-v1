"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bell, Building2, Check, Languages, Lock, LogOut, Menu, Moon, Search, Settings, UserCircle, FlaskConical, Sun } from "lucide-react";
import { formatDistanceToNowStrict, parseISO } from "date-fns";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAppStore } from "@/store/app-store";
import { useUIStore } from "@/store/ui-store";
import { useSessionStore } from "@/store/session-store";
import { useScope } from "@/hooks/use-scope";
import { useT } from "@/hooks/use-t";
import { LANGUAGES } from "@/lib/i18n";
import { isMock } from "@/lib/api/config";
import { SidebarNav } from "./sidebar";
import { Breadcrumbs } from "./breadcrumbs";
import { GlobalSearch } from "./global-search";
import { Logo } from "./logo";
import { cn } from "@/lib/utils";

function BranchSelector() {
  const { isOwner, branches, branchId, branch, user } = useScope();
  const setBranch = useUIStore((s) => s.setBranch);
  const t = useT();
  if (!isOwner) {
    const assigned = branches.find((b) => b.id === user.branchId);
    return (
      <div className="hidden h-9 items-center gap-2 rounded-lg border bg-muted/50 px-3 text-sm md:flex" title={t("header.assignedBranch")}>
        <Lock className="size-3.5 text-muted-foreground" aria-hidden />
        <span className="sr-only">{t("header.assignedBranch")}:</span>
        <span className="max-w-40 truncate font-medium">{assigned?.name}</span>
      </div>
    );
  }
  return (
    <Select value={branchId} onValueChange={(v) => setBranch(v)}>
      <SelectTrigger className="hidden w-48 md:flex" aria-label={t("header.branch")}>
        <Building2 className="text-muted-foreground" aria-hidden />
        <SelectValue>{branch?.name ?? t("header.allBranches")}</SelectValue>
      </SelectTrigger>
      <SelectContent align="end">
        <SelectItem value="all">{t("header.allBranches")}</SelectItem>
        <SelectGroup>
          <SelectLabel>{t("header.branch")}</SelectLabel>
          {branches.map((b) => (
            <SelectItem key={b.id} value={b.id}>
              {b.name}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

function CurrencyToggle() {
  const value = useUIStore((s) => s.displayCurrency);
  const set = useUIStore((s) => s.setDisplayCurrency);
  const t = useT();
  return (
    <ToggleGroup type="single" value={value} onValueChange={(v) => v && set(v as "USD" | "KHR")} variant="outline" size="sm" aria-label={t("header.currency")} className="hidden sm:flex">
      <ToggleGroupItem value="USD" aria-label="Display in US dollars" className="px-2.5 text-xs font-medium data-[state=on]:bg-primary-light data-[state=on]:text-primary">
        USD
      </ToggleGroupItem>
      <ToggleGroupItem value="KHR" aria-label="Display in Khmer riel" className="px-2.5 text-xs font-medium data-[state=on]:bg-primary-light data-[state=on]:text-primary">
        KHR
      </ToggleGroupItem>
    </ToggleGroup>
  );
}

function LanguageMenu() {
  const lang = useUIStore((s) => s.language);
  const set = useUIStore((s) => s.setLanguage);
  const t = useT();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t("header.language")}>
          <Languages />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuLabel>{t("header.language")}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={lang} onValueChange={(v) => set(v as "en" | "km")}>
          {LANGUAGES.map((l) => (
            <DropdownMenuRadioItem key={l.value} value={l.value} lang={l.value}>
              {l.native}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function NotificationBell() {
  const { inScope } = useScope();
  const all = useAppStore((s) => s.notifications);
  const markRead = useAppStore((s) => s.markNotificationRead);
  const markAll = useAppStore((s) => s.markAllNotificationsRead);
  const router = useRouter();
  const t = useT();
  const [open, setOpen] = useState(false);
  const visible = all.filter((n) => !n.branchId || inScope(n.branchId));
  const unread = visible.filter((n) => !n.read).length;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={`${t("header.notifications")}${unread ? `, ${unread} unread` : ""}`}>
          <Bell />
          {unread > 0 && (
            <span className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-white tabular-nums" aria-hidden>
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(92vw,380px)] p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <p className="text-sm font-semibold">{t("header.notifications")}</p>
          <Button variant="ghost" size="xs" onClick={() => markAll()} disabled={!unread}>
            <Check /> {t("header.markAllRead")}
          </Button>
        </div>
        <ScrollArea className="max-h-96">
          {visible.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">You&apos;re all caught up.</p>
          ) : (
            <ul>
              {visible.slice(0, 6).map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => {
                      markRead(n.id);
                      setOpen(false);
                      if (n.href) router.push(n.href);
                    }}
                    className="flex w-full gap-3 border-b px-4 py-3 text-left last:border-b-0 hover:bg-muted/60 focus-visible:bg-muted focus-visible:outline-none"
                  >
                    <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.read ? "bg-transparent" : "bg-primary")} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className={cn("block truncate text-sm", !n.read && "font-medium")}>{n.title}</span>
                      <span className="line-clamp-2 text-xs text-muted-foreground">{n.body}</span>
                      <span className="mt-1 block text-[11px] text-muted-foreground">{formatDistanceToNowStrict(parseISO(n.createdAt), { addSuffix: true })}</span>
                    </span>
                    {!n.read && <span className="sr-only">Unread</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
        <div className="border-t p-2">
          <Button variant="ghost" size="sm" className="w-full" asChild>
            <Link href="/notifications" onClick={() => setOpen(false)}>
              {t("header.viewAll")}
            </Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function UserMenu() {
  const { user } = useScope();
  const router = useRouter();
  const signOut = useSessionStore((s) => s.signOut);
  const switchRole = useSessionStore((s) => s.switchRole);
  const theme = useUIStore((s) => s.theme);
  const setTheme = useUIStore((s) => s.setTheme);
  const branches = useAppStore((s) => s.branches);
  const t = useT();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="flex items-center gap-2 rounded-lg p-1 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none" aria-label="Account menu">
          <span className="flex size-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">{user.avatarInitials}</span>
          <span className="hidden text-left leading-tight xl:block">
            <span className="block text-sm font-medium">{user.name}</span>
            <span className="block text-[11px] text-muted-foreground">{user.role === "owner" ? t("header.owner") : t("header.manager")}</span>
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="font-normal">
          <p className="text-sm font-medium">{user.name}</p>
          <p className="truncate text-xs text-muted-foreground">{user.email}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/profile">
            <UserCircle /> {t("nav.profile")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/settings">
            <Settings /> {t("nav.settings")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setTheme(theme === "dark" ? "light" : "dark")}>
          {theme === "dark" ? <Sun /> : <Moon />} {theme === "dark" ? "Light mode" : t("header.darkMode")}
        </DropdownMenuItem>
        {isMock && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
              <FlaskConical className="size-3" aria-hidden /> {t("header.demoRole")}
            </DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={user.role}
              onValueChange={(v) => {
                switchRole(v as "owner" | "manager");
                router.push("/dashboard");
              }}
            >
              <DropdownMenuRadioItem value="owner">{t("header.owner")} · Sophea</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="manager">
                {t("header.manager")} · Dara ({branches.find((b) => b.id === "br_tk")?.name})
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onSelect={() => {
            signOut();
            router.push("/sign-in");
          }}
        >
          <LogOut /> {t("header.signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function Topbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const pathname = usePathname();
  const t = useT();
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-card/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-card/80 sm:px-4 lg:px-6">
      <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open navigation">
        <Menu />
      </Button>
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-72 gap-0 p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <div className="flex h-14 items-center border-b px-4">
            <Logo />
          </div>
          <ScrollArea className="min-h-0 flex-1">
            <SidebarNav onNavigate={() => setMobileOpen(false)} />
          </ScrollArea>
        </SheetContent>
      </Sheet>

      <div className="min-w-0 flex-1">
        <Breadcrumbs pathname={pathname} />
      </div>

      <Button variant="outline" className="hidden w-56 justify-start text-muted-foreground md:flex xl:w-72" onClick={() => setSearchOpen(true)}>
        <Search /> <span className="truncate">{t("header.search")}</span>
        <kbd className="ml-auto rounded border bg-muted px-1.5 font-mono text-[10px]">⌘K</kbd>
      </Button>
      <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setSearchOpen(true)} aria-label="Search">
        <Search />
      </Button>
      <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />
      <BranchSelector />
      <CurrencyToggle />
      <LanguageMenu />
      <NotificationBell />
      <UserMenu />
    </header>
  );
}
