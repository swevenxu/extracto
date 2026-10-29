import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const DIR = join(process.cwd(), "data", "files");

export function documentPath(id: string) {
  return join(DIR, id);
}

export async function saveDocument(id: string, bytes: Buffer) {
  await mkdir(DIR, { recursive: true });
  await writeFile(documentPath(id), bytes);
}

export async function readDocument(id: string): Promise<Buffer | null> {
  try {
    return await readFile(documentPath(id));
  } catch {
    return null;
  }
}

export async function deleteDocument(id: string) {
  try {
    const { rm } = await import("node:fs/promises");
    await rm(documentPath(id), { force: true });
  } catch {
    /* already gone */
  }
}
