import { getSupabaseAdmin } from "./supabase";

const bucket = () => process.env.SUPABASE_STORAGE_BUCKET || "documents";

export function documentPath(id: string) {
  return id;
}

export async function saveDocument(id: string, bytes: Buffer) {
  const { error } = await getSupabaseAdmin().storage.from(bucket()).upload(id, bytes, {
    upsert: true,
    contentType: "application/octet-stream",
  });
  if (error) throw new Error(`Could not save document: ${error.message}`);
}

export async function readDocument(id: string): Promise<Buffer | null> {
  const { data, error } = await getSupabaseAdmin().storage.from(bucket()).download(id);
  if (error) {
    if (/not found/i.test(error.message)) return null;
    throw new Error(`Could not read document: ${error.message}`);
  }
  return Buffer.from(await data.arrayBuffer());
}

export async function deleteDocument(id: string) {
  const { error } = await getSupabaseAdmin().storage.from(bucket()).remove([id]);
  if (error) throw new Error(`Could not delete document: ${error.message}`);
}
