import { appendFile, cp, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

// Publishes only an already-tested artifact. GitHub's managed Pages workflow
// performs deployment from the configured gh-pages branch and its environment.
const repository = process.env.GITHUB_REPOSITORY;
const sourceSha = process.env.GITHUB_SHA;
const token = process.env.GH_TOKEN;
if (!/^[\w.-]+\/[\w.-]+$/.test(repository ?? '') || !/^[a-f0-9]{40}$/.test(sourceSha ?? '') || !token || !process.argv[2]) {
  throw new Error('Run in GitHub Actions with GITHUB_REPOSITORY, GITHUB_SHA, GH_TOKEN and a tested artifact directory.');
}
const artifact = resolve(process.argv[2]);
const apiRoot = 'https://api.github.com';
const endpoint = `/repos/${repository}/pages`;
const hash = data => createHash('sha256').update(data).digest('hex');
const git = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
async function api(path, method = 'GET') {
  const response = await fetch(apiRoot + path, {
    method,
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
    signal: AbortSignal.timeout(30000)
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`GitHub ${method} ${path}: HTTP ${response.status}: ${body}`);
  return body ? JSON.parse(body) : null;
}
async function assertRegularTree(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === '.github' || entry.isSymbolicLink()) {
      throw new Error(`Unexpected entry in publication artifact: ${entry.name}`);
    }
    if (entry.isDirectory()) await assertRegularTree(join(directory, entry.name));
    else if (!entry.isFile()) throw new Error(`Unsupported artifact entry: ${entry.name}`);
  }
}
await assertRegularTree(artifact);
const html = await readFile(join(artifact, 'index.html'));
if (!html.toString().includes('Aether Optics')) throw new Error('Artifact does not contain Aether Optics.');
const manifest = { source_commit: sourceSha, index_sha256: hash(html) };
const site = await api(endpoint);
console.log('Pages configuration:', JSON.stringify({ source: site.source, build_type: site.build_type, html_url: site.html_url }));
if (site.source?.branch !== 'gh-pages' || site.source?.path !== '/' || site.build_type === 'workflow') {
  throw new Error('Expected Pages source gh-pages / (root). Restore that source in Settings > Pages before publishing.');
}
const publicUrl = new URL(site.html_url);
if (publicUrl.protocol !== 'https:') throw new Error('Expected an HTTPS Pages URL.');
const temporary = await mkdtemp(join(tmpdir(), 'aether-pages-'));
const checkout = join(temporary, 'worktree');
let publicationSha;
try {
  git(['fetch', 'origin', 'gh-pages']);
  git(['worktree', 'add', '--detach', checkout, 'FETCH_HEAD']);
  for (const entry of await readdir(checkout)) {
    if (entry !== '.git') await rm(join(checkout, entry), { recursive: true, force: true });
  }
  for (const entry of await readdir(artifact)) {
    await cp(join(artifact, entry), join(checkout, entry), { recursive: true });
  }
  await writeFile(join(checkout, '.nojekyll'), '');
  await writeFile(join(checkout, 'build.json'), JSON.stringify(manifest, null, 2) + '\n');
  git(['add', '--all'], checkout);
  if (git(['status', '--porcelain'], checkout)) {
    git(['-c', 'user.name=github-actions[bot]', '-c', 'user.email=41898282+github-actions[bot]@users.noreply.github.com',
      'commit', '-m', `Publish Aether Optics from ${sourceSha}`], checkout);
    git(['push', 'origin', 'HEAD:refs/heads/gh-pages'], checkout);
  }
  publicationSha = git(['rev-parse', 'HEAD'], checkout);
} finally {
  try { git(['worktree', 'remove', '--force', checkout]); } catch { /* Worktree may not have been created. */ }
  await rm(temporary, { recursive: true, force: true });
}
console.log(`Published ${publicationSha} to gh-pages.`);
// GITHUB_TOKEN pushes do not themselves trigger Pages builds. Request one
// explicitly, without changing any Pages settings or environment protections.
const requested = await api(`${endpoint}/builds`, 'POST');
console.log('Pages build requested:', JSON.stringify(requested));
let built = false;
for (let attempt = 0; attempt < 80; attempt++) {
  const latest = await api(`${endpoint}/builds/latest`);
  if (latest.commit === publicationSha && latest.status === 'errored') {
    throw new Error(`Pages build failed: ${JSON.stringify(latest.error)}`);
  }
  if (latest.commit === publicationSha && latest.status === 'built') { built = true; break; }
  await delay(3000);
}
if (!built) throw new Error(`Pages did not confirm publication of ${publicationSha}. Inspect the managed Pages build.`);
let verified = false;
let failure = 'No public response';
for (let attempt = 0; attempt < 40; attempt++) {
  try {
    const stampUrl = new URL('build.json', publicUrl);
    stampUrl.searchParams.set('revision', sourceSha);
    const stampResponse = await fetch(stampUrl, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
    if (!stampResponse.ok) throw new Error(`Manifest HTTP ${stampResponse.status}`);
    const stamp = await stampResponse.json();
    if (stamp.source_commit !== sourceSha || stamp.index_sha256 !== manifest.index_sha256) throw new Error('CDN still serves an older revision.');
    const indexUrl = new URL(publicUrl);
    indexUrl.searchParams.set('revision', sourceSha);
    const indexResponse = await fetch(indexUrl, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
    if (!indexResponse.ok) throw new Error(`Application HTTP ${indexResponse.status}`);
    if (hash(Buffer.from(await indexResponse.arrayBuffer())) !== manifest.index_sha256) throw new Error('Published index differs from tested artifact.');
    verified = true;
    break;
  } catch (error) { failure = error.message; }
  await delay(3000);
}
if (!verified) throw new Error(`Live publication verification failed: ${failure}`);
console.log(`Verified live Aether Optics: ${publicUrl.href}`);
console.log(`Verified index SHA-256: ${manifest.index_sha256}`);
if (process.env.GITHUB_STEP_SUMMARY) {
  await appendFile(process.env.GITHUB_STEP_SUMMARY,
    `### Aether Optics published\n\n[Open application](${publicUrl.href})\n\nSource: \`${sourceSha}\`\n\nPages commit: \`${publicationSha}\`\n\nThe public application matches the tested artifact byte-for-byte (SHA-256).\n`);
}
