export async function extractTextFromFile(
  fileName: string,
  data: string | Buffer,
  isBase64 = false
): Promise<string> {
  const ext = (fileName.split(".").pop() || "").toLowerCase();
  const buf =
    typeof data === "string"
      ? isBase64
        ? Buffer.from(data, "base64")
        : Buffer.from(data, "utf-8")
      : data;

  if (ext === "pdf") {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: buf });
    try {
      const result = await parser.getText();
      return (result.text || "").trim();
    } finally {
      await parser.destroy();
    }
  }

  if (["jpg", "jpeg", "png", "webp"].includes(ext)) {
    return ""; // no text layer; vision extraction handles these
  }

  return buf.toString("utf-8").trim();
}
