# GitHub Pages deployment

Repository: https://github.com/wieslawsoltes/AetherOptics

Site: https://wieslawsoltes.github.io/AetherOptics/

## Publishing source

Select **Settings > Pages > Build and deployment > Source > GitHub Actions** once for this repository. The workflow uses the `github-pages` environment. No personal access token or deployment secret is needed for normal publishing after Pages has been enabled.

A repository with Pages disabled must first be enabled by a repository administrator; the automatic workflow token cannot perform that initial administrative operation.

## Automatic deployment

`.github/workflows/pages.yml` runs on pushes to `main`, pull requests targeting `main`, and manual dispatch. It uses Node.js 22 without installing dependencies, runs the numerical/application tests, builds the self-contained application, checks the emitted JavaScript, and uploads `dist/` as the Pages artifact. Only successful main-branch builds are deployed; pull requests never deploy.

The deploy job has only Pages write and OIDC token permissions. The build job has read-only source access and does not persist checkout credentials. No job writes source code or commits generated files back to `main`.

After deployment, the workflow checks the public URL for a successful response containing the application name. The deployment URL is also recorded in the job summary and GitHub environment.

## Manual deployment or retry

Open **Actions > Test and deploy > Run workflow**, select `main`, and run it. If the configure step reports that no Pages site exists, set the publishing source above before retrying.

The `gh-pages` branch contains the initially tested standalone distribution as an alternative bootstrap snapshot. It is not the ongoing publishing source for this Actions-based workflow; future releases are deployed from the freshly built artifact.

## Local verification

```sh
npm test
npm run build
npm start
```

The application has no absolute `/src` or `/assets` runtime requirements and the standalone build works under the `/AetherOptics/` project-site prefix. WebGPU availability still depends on browser/device support; HTTPS provides the required secure context, and CPU/Canvas fallbacks remain available.
