import { defineConfig } from "jsrepo";
import { repository } from "jsrepo/outputs";
import pkg from "./package.json";

export default defineConfig({
  registry: {
    name: "backend-kit",
    outputs: [repository()],
    items: [
      {
        name: "image-upload",
        type: "module",
        // Automatic resolution treats Bun's built-in "bun" import as an npm package.
        dependencyResolution: "manual",
        dependencies: [{ ecosystem: "js", name: "effect", version: pkg.dependencies.effect }],
        files: [
          {
            path: "image-upload",
            // Allowlist so untracked files (.DS_Store, test photos) never ship.
            files: [{ path: "**/*.ts" }, { path: "README.md" }]
          }
        ]
      }
    ]
  }
});
