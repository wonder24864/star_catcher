"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { trpc } from "@/lib/trpc/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const CONFIG_KEYS = [
  "ai.model",
  "ai.temperature",
  "upload.maxFileSizeMb",
  "homework.defaultMaxHelpLevel",
];

const CONFIG_DEFAULTS: Record<string, string> = {
  "ai.model": "gpt-5.4",
  "ai.temperature": "0.2",
  "upload.maxFileSizeMb": "20",
  "homework.defaultMaxHelpLevel": "3",
};

export default function AdminSettingsPage() {
  const t = useTranslations();
  const [configValues, setConfigValues] = useState<Record<string, string>>({
    ...CONFIG_DEFAULTS,
  });
  const [saved, setSaved] = useState(false);

  const { data: stats, isLoading: statsLoading } = trpc.admin.getStats.useQuery();
  const { data: configData } = trpc.admin.getConfig.useQuery({ keys: CONFIG_KEYS });
  const setConfigMutation = trpc.admin.setConfig.useMutation();

  // Populate form with stored config values
  useEffect(() => {
    if (!configData) return;
    setConfigValues((prev) => {
      const next = { ...prev };
      for (const key of CONFIG_KEYS) {
        if (configData[key] !== undefined) {
          next[key] = String(configData[key]);
        }
      }
      return next;
    });
  }, [configData]);

  async function handleSave() {
    for (const key of CONFIG_KEYS) {
      const raw = configValues[key];
      const numericKeys = [
        "ai.temperature",
        "upload.maxFileSizeMb",
        "homework.defaultMaxHelpLevel",
      ];
      const value = numericKeys.includes(key) ? Number(raw) : raw;
      await setConfigMutation.mutateAsync({ key, value });
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">{t("admin.settings.title")}</h1>

      {/* System stats */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {t("admin.settings.statsTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {statsLoading ? (
            <p className="text-muted-foreground">{t("common.loading")}</p>
          ) : stats ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <StatBox label={t("admin.settings.totalUsers")} value={stats.totalUsers} />
              <StatBox label={t("admin.settings.studentCount")} value={stats.studentCount} />
              <StatBox label={t("admin.settings.parentCount")} value={stats.parentCount} />
              <StatBox label={t("admin.settings.adminCount")} value={stats.adminCount} />
              <StatBox label={t("admin.settings.totalErrors")} value={stats.totalErrors} />
              <StatBox label={t("admin.settings.totalSessions")} value={stats.totalSessions} />
              <StatBox label={t("admin.settings.totalAiCalls")} value={stats.totalAiCalls} />
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Config form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {t("admin.settings.configTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <ConfigField
            label={t("admin.settings.aiModel")}
            value={configValues["ai.model"]}
            onChange={(v) => setConfigValues((p) => ({ ...p, "ai.model": v }))}
          />
          <ConfigField
            label={t("admin.settings.aiTemperature")}
            value={configValues["ai.temperature"]}
            type="number"
            min={0}
            max={1}
            step={0.1}
            onChange={(v) => setConfigValues((p) => ({ ...p, "ai.temperature": v }))}
          />
          <ConfigField
            label={t("admin.settings.maxFileSizeMb")}
            value={configValues["upload.maxFileSizeMb"]}
            type="number"
            min={1}
            max={200}
            onChange={(v) => setConfigValues((p) => ({ ...p, "upload.maxFileSizeMb": v }))}
          />
          <ConfigField
            label={t("admin.settings.defaultMaxHelpLevel")}
            value={configValues["homework.defaultMaxHelpLevel"]}
            type="number"
            min={1}
            max={3}
            onChange={(v) => setConfigValues((p) => ({ ...p, "homework.defaultMaxHelpLevel": v }))}
          />

          <div className="flex items-center gap-3 pt-2">
            <Button
              onClick={handleSave}
              disabled={setConfigMutation.isPending}
            >
              {t("admin.settings.saveConfig")}
            </Button>
            {saved && (
              <span className="text-sm text-green-600">
                {t("admin.settings.saved")}
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-muted/40 p-3 text-center">
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function ConfigField({
  label,
  value,
  onChange,
  type = "text",
  min,
  max,
  step,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium">{label}</label>
      <input
        type={type}
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
      />
    </div>
  );
}
