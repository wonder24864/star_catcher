import { auth } from "@/lib/domain/auth";
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { StudentHome } from "@/components/dashboard/student-home";

export default async function HomePage() {
  const session = await auth();
  const locale = await getLocale();
  const role = session?.user?.role;

  if (role === "ADMIN") {
    redirect(`/${locale}/admin`);
  }

  if (role === "PARENT") {
    redirect(`/${locale}/parent/overview`);
  }

  // STUDENT — StudentHome reads session (nickname/grade/family) via hooks.
  return <StudentHome />;
}
