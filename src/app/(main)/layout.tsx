import { Sidebar } from "@/components/Sidebar";
import { currentUser } from "@/lib/session";
import { redirect } from "next/navigation";

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!(await currentUser())) redirect("/login");
  return (
    <div className="min-h-screen">
      <Sidebar />
      <main id="main-content">{children}</main>
    </div>
  );
}
