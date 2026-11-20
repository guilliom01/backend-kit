# backend-kit

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run index.ts
```

To type check:

```bash
bun check
```

Run `bun fmt` to format the code.

## Installing a module in your project

Modules are distributed as source code with [jsrepo](https://jsrepo.dev), like shadcn but for backend:
the files are copied into your project and become yours to change.

```bash
bunx jsrepo init github/<owner>/backend-kit
bunx jsrepo add image-upload
```

Set where modules go in your `jsrepo.config.ts`:

```ts
paths: { module: "src/modules" }, // installs into src/modules/image-upload
```

`bunx jsrepo update image-upload` shows a per-file diff against the registry before overwriting.

## Publishing changes to the registry

After changing a module, rebuild `registry.json` and commit it with the change:

```bash
bun run build:registry
```

Only `.ts` files and the `README.md` of each module are published (see `jsrepo.config.ts`).

This project was created using `bun init` in bun v1.4.4. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.
