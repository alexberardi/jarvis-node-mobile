# Apple App Site Association (Universal Link for the Phase 3 Control)

The Control Center / Lock Screen control (`targets/jarvis-control/`) opens the
app via the https Universal Link `https://docs.jarvisautomation.dev/app/stt`
(and `/app/chat`). Apple does **not** support custom URL schemes from a Control,
so a Universal Link is required. For iOS to route that link into the app instead
of Safari, this AASA file must be served from `docs.jarvisautomation.dev`.

`apple-app-site-association` (this folder) is the canonical source. It must be
deployed to:

    https://docs.jarvisautomation.dev/.well-known/apple-app-site-association

## Serving requirements (all mandatory)

- Served over **HTTPS** with valid TLS.
- **No redirect** (no 30x — a redirect makes iOS fall back to Safari).
- `Content-Type: application/json` (Apple's fetcher is lenient, but set it).
- No auth / no Cloudflare Access in front of it.
- File name has **no extension**.

`appID` is `<TeamID>.<bundleId>` = `8H5GA7SX77.com.jarvis.nodemobile`.
`paths` is scoped to `/app/*` so it never shadows real documentation pages.

## Deploying on docs.jarvisautomation.dev (MkDocs → Cloudflare Pages)

`jarvis-docs` builds with `mkdocs build` (output `site/`) and deploys with
`wrangler pages deploy site`. MkDocs skips dotfiles, so the file must be injected
into `site/` at build time. Two options depending on how docs deploys:

### A) Manual `deploy.sh`
Add, after `mkdocs build` and before `wrangler pages deploy site`:

    mkdir -p site/.well-known
    cp /path/to/apple-app-site-association site/.well-known/apple-app-site-association
    printf '/.well-known/apple-app-site-association\n  Content-Type: application/json\n' > site/_headers

### B) Cloudflare Pages git-integration
Put the copy step in the Pages **build command**, e.g.
`mkdocs build && mkdir -p site/.well-known && cp ... site/.well-known/...`,
or commit a `_headers` + the file into a location the build copies into `site/`.

## Verify after deploy

    curl -sS -D- -o /dev/null https://docs.jarvisautomation.dev/.well-known/apple-app-site-association
    # expect: 200, content-type application/json, NO location/redirect header

AASA is device-cached at app install/update — reinstall the app to refresh
during QA.

## Apple Developer portal (one-time)

Enable the **Associated Domains** capability on App ID `com.jarvis.nodemobile`
(and create the widget-extension App ID `com.jarvis.nodemobile.controls`). With
EAS this is synced from `app.json` `ios.associatedDomains` + `ios.appleTeamId`
during an `eas build` / `eas credentials` run.
