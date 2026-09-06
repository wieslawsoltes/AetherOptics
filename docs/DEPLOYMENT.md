# GitHub Pages deployment

Repository: https://github.com/wieslawsoltes/AetherOptics

Site: https://wieslawsoltes.github.io/AetherOptics/

## Publishing source

GitHub Pages is enabled with **Deploy from a branch > gh-pages > / (root)**. Keep that setting: the main-branch workflow publishes only generated application files to `gh-pages`, and GitHub's managed Pages workflow deploys that branch through the `github-pages` environment. No personal access token or additional deployment secret is required.

## Automatic deployment

`.github/workflows/pages.yml` runs on pushes to `main`, pull requests targeting `main`, and manual dispatch. The read-only build job uses Node.js 22 without installing dependencies, runs the numerical/application tests, builds the standalone application, checks emitted JavaScript, and uploads the tested `dist/` artifact.

Only successful main-branch builds reach the publisher. It downloads that exact artifact, updates the generated `gh-pages` branch with a non-force push, and explicitly requests a Pages build. Explicit build requests are necessary because pushes made with `GITHUB_TOKEN` do not automatically trigger Pages builds. The publisher does not change Pages settings or deployment-environment protections.

The publisher has repository contents write, Pages write, and Actions read permissions. Pull requests never publish. No workflow writes source or generated files back to `main`.

`tools/publish-pages.mjs` waits for the matching Pages commit to finish, then retrieves the public `build.json` and application. Publication succeeds only when the served source revision and the application's SHA-256 match the tested artifact. The public URL and source/Pages commits are recorded in the workflow summary.

## Manual deployment or retry

Open **Actions > Test and deploy > Run workflow**, select `main`, and run it. A failed test, build, push, Pages build, or live integrity check fails the workflow rather than reporting a successful publication.

For a fork, first enable Pages from a `gh-pages` branch and select its root folder. The publishing tool reads the site's URL from GitHub rather than hard-coding an account name.

## Local verification

```sh
npm test
npm run build
npm start
```

The standalone build works under the `/AetherOptics/` project-site prefix. WebGPU availability depends on browser/device support; CPU/Canvas fallbacks remain available. Serving over HTTPS supplies a secure context but does not by itself establish GPU compatibility.
