"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { trpc } from "@/lib/trpc/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Role = "STUDENT" | "PARENT" | "ADMIN";

export default function AdminUsersPage() {
  const t = useTranslations();
  const [search, setSearch] = useState("");
  const [role, setRole] = useState<Role | "ALL">("ALL");
  const [page, setPage] = useState(1);

  const { data, isLoading, refetch } = trpc.admin.listUsers.useQuery({
    search: search || undefined,
    role: role === "ALL" ? undefined : role,
    page,
    pageSize: 20,
  });

  const toggleMutation = trpc.admin.toggleUser.useMutation({
    onSuccess: () => refetch(),
  });

  const totalPages = data ? Math.ceil(data.total / 20) : 1;

  return (
    <div className="max-w-4xl space-y-5">
      <h1 className="text-2xl font-bold">{t("admin.users.title")}</h1>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          placeholder={t("admin.users.searchPlaceholder")}
          className="rounded-md border px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring w-56"
        />
        <Select
          value={role}
          onValueChange={(v) => { setRole(v as Role | "ALL"); setPage(1); }}
        >
          <SelectTrigger className="w-36 text-sm">
            <SelectValue placeholder={t("admin.users.filterRole")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{t("admin.users.allRoles")}</SelectItem>
            <SelectItem value="STUDENT">{t("admin.users.roles.STUDENT")}</SelectItem>
            <SelectItem value="PARENT">{t("admin.users.roles.PARENT")}</SelectItem>
            <SelectItem value="ADMIN">{t("admin.users.roles.ADMIN")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Total count */}
      {data && (
        <p className="text-sm text-muted-foreground">
          {t("admin.users.total", { count: data.total })}
        </p>
      )}

      {/* User list */}
      {isLoading ? (
        <p className="text-muted-foreground">{t("common.loading")}</p>
      ) : !data?.users.length ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-muted-foreground">{t("common.noData")}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {data.users.map((user) => (
            <Card key={user.id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/admin/users/${user.id}`}
                        className="font-medium hover:underline"
                      >
                        {user.nickname}
                      </Link>
                      <span className="text-sm text-muted-foreground">
                        @{user.username}
                      </span>
                      <Badge variant="secondary" className="text-xs">
                        {t(`admin.users.roles.${user.role}`)}
                      </Badge>
                      {!user.isActive && (
                        <Badge variant="destructive" className="text-xs">
                          {t("admin.users.disabled")}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {t("admin.users.createdAt")}:{" "}
                      {new Date(user.createdAt).toLocaleDateString("zh-CN")}
                    </p>
                  </div>

                  <div className="flex shrink-0 gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={toggleMutation.isPending}
                      onClick={() => {
                        const msg = user.isActive
                          ? t("admin.users.confirmDisable", { name: user.nickname })
                          : t("admin.users.confirmEnable", { name: user.nickname });
                        if (confirm(msg)) {
                          toggleMutation.mutate({
                            userId: user.id,
                            isActive: !user.isActive,
                          });
                        }
                      }}
                    >
                      {user.isActive ? t("admin.users.disable") : t("admin.users.enable")}
                    </Button>
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/admin/users/${user.id}`}>
                        {t("admin.users.detail")}
                      </Link>
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
          >
            {t("common.back")}
          </Button>
          <span className="text-sm text-muted-foreground">
            {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            {t("common.next")}
          </Button>
        </div>
      )}
    </div>
  );
}
