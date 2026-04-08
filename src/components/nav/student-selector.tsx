"use client";

import { useTranslations } from "next-intl";
import { trpc } from "@/lib/trpc/client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useStudentStore } from "@/lib/stores/student-store";

export function StudentSelector() {
  const t = useTranslations();
  const { selectedStudentId, setSelectedStudentId } = useStudentStore();
  const { data: students } = trpc.family.students.useQuery();

  if (!students || students.length === 0) {
    return (
      <p className="px-3 text-xs text-muted-foreground">
        {t("family.switchStudent")}
      </p>
    );
  }

  // Auto-select first student if none selected
  const currentId = selectedStudentId || students[0].id;

  return (
    <Select
      value={currentId}
      onValueChange={setSelectedStudentId}
    >
      <SelectTrigger className="w-full text-sm">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {students.map((s) => (
          <SelectItem key={s.id} value={s.id}>
            {s.nickname} ({s.grade ? t(`grades.${s.grade}`) : ""})
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
