"use server";

import { retryExtraction } from "@/lib/retry";
import { currentUser } from "@/lib/session";
import { redirect } from "next/navigation";

export async function retryRecord(id: string) {
  const user = await currentUser();
  if (!user) redirect("/login");
  return retryExtraction(id, user);
}
