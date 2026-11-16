# Frontier One

Frontier One is a NASA Space Apps Challenge 2026 project: a space simulator and junior astronaut mission trainer.

## Deploy to GitHub Pages

The GitHub Actions workflow in `.github/workflows/deploy-pages.yml` builds the Vite app and deploys `dist` to GitHub Pages whenever changes are pushed to `main`. Use the GitHub account `banana283` as the repository owner. The `public/CNAME` file configures the custom domain `frontier1.earth`.

1. Push this project to a GitHub repository on the `main` branch.
2. In the repository, open **Settings → Pages** and set the build and deployment source to **GitHub Actions**.
3. Wait for the **Deploy to GitHub Pages** workflow to complete.
4. In **Settings → Pages → Custom domain**, confirm `frontier1.earth` and enable **Enforce HTTPS** after DNS verification.
5. In Porkbun's DNS management for `frontier1.earth`, add the DNS records GitHub Pages lists for your repository. GitHub currently uses `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, and `185.199.111.153` as apex A records, plus an AAAA set for IPv6; verify the current values in GitHub's custom-domain instructions before adding them. Remove conflicting records for `@` and point `www` to `banana283.github.io` with a CNAME if you want the `www` address too.

DNS changes can take time to propagate. If the domain already has email or other services, preserve their existing DNS records when configuring the site.

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.
