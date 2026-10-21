# create-microservices

Interactive project scaffolder for local-first microservice stacks. It uses [TDK CLI Core](https://github.com/flisk-sh/flisk) to generate the project configuration and service files.

This is a project creator, not a replacement for the TDK runtime. It creates a project and the selected service skeletons; it does not start Docker containers automatically.

## Requirements

- Node.js 22.12 or newer
- Docker Engine 25+ with Compose 2.20.2+
- Tilt
- Bun 1.2+

TDK checks machine readiness while initializing a project. See the [TDK CLI Core setup guide](https://github.com/flisk-sh/flisk#requirements-and-support) for platform details.

## Create a project

```bash
npm init @tdk-landscape/microservices storefront
```

The interactive prompts ask how many services to create and their names and types (`backend`, `frontend`, `worker`, or `mcp`). Then start the generated stack:

```bash
cd storefront
tdk up main
```

Install TDK CLI Core globally to use `tdk` in the new project:

```bash
npm install --global @tdk-landscape/tdk-cli-core@1.3.186
```

## Non-interactive usage

Create the default API and web services:

```bash
npm init @tdk-landscape/microservices storefront -- --yes
```

Choose services explicitly:

```bash
npm init @tdk-landscape/microservices storefront -- \
  --stack commerce \
  --service catalog:backend \
  --service storefront:frontend \
  --service email-worker:worker
```

The target directory must be empty or new. Existing files are never overwritten.

## Publish and install

This project publishes the same versioned package to npm and GitHub Packages when a matching GitHub Release is published. The npm package is `@tdk-landscape/create-microservices`; the executable is `create-microservices`.

Install directly with npm:

```bash
npm install --global @tdk-landscape/create-microservices
create-microservices storefront
```

Install from GitHub Packages by mapping the organization scope in `~/.npmrc` and authenticating with a GitHub personal access token (classic) that has `read:packages` access:

```ini
@tdk-landscape:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=YOUR_GITHUB_TOKEN
```

Then run:

```bash
npm install --global @tdk-landscape/create-microservices
create-microservices storefront
```

## Maintainer release

The release workflow requires a GitHub Release tag that matches `package.json` (for example, `v0.1.0` for version `0.1.0`). It builds no generated bundle; it validates the CLI package archive and publishes that same archive to both registries. Configure an organization or repository Actions secret named `NPM_TOKEN` with publish access, and permit the release workflow's `packages: write` token permission.

If npm publication succeeds but GitHub Packages fails, use the retained workflow artifact to publish the same package version to GitHub Packages. If the registry already contains that version and rejects a retry, increment the package version and publish a new release.
