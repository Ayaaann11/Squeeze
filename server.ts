import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs";
import AdmZip from "adm-zip";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Endpoint to download the project as a ZIP
  app.get("/api/download-project", (req, res) => {
    try {
      const zip = new AdmZip();
      const projectRoot = process.cwd();
      
      const filesToInclude = [
        "src",
        "public",
        "index.html",
        "package.json",
        "tsconfig.json",
        "vite.config.ts",
        ".env.example",
        "metadata.json"
      ];

      filesToInclude.forEach(file => {
        const fullPath = path.join(projectRoot, file);
        if (fs.existsSync(fullPath)) {
          const stats = fs.statSync(fullPath);
          if (stats.isDirectory()) {
            zip.addLocalFolder(fullPath, file);
          } else {
            zip.addLocalFile(fullPath);
          }
        }
      });

      const zipBuffer = zip.toBuffer();
      
      res.set({
        "Content-Type": "application/zip",
        "Content-Disposition": 'attachment; filename="squeeze-project.zip"',
        "Content-Length": zipBuffer.length
      });

      res.send(zipBuffer);
    } catch (error) {
      console.error("Export failed:", error);
      res.status(500).json({ error: "Failed to generate project archive" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
