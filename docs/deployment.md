# Deploy over Tailscale

Run Tarang and the static frontend directly on a device in the tailnet. The examples use the host name `rss-server`, Tarang on port 3000, and Tarangcat on port 8080. Replace the host name with the server's Tailscale IP or [MagicDNS name](https://tailscale.com/docs/features/magicdns).

## Build

Both the server and the browsing device must be connected to the tailnet. Tarang must listen on an address reachable through Tailscale, not only on loopback.

Install dependencies and build with Tarang's tailnet origin:

```sh
pnpm install --frozen-lockfile
TARANG_API_BASE=http://rss-server:3000 pnpm build
```

In PowerShell:

```powershell
pnpm install --frozen-lockfile
$env:TARANG_API_BASE = 'http://rss-server:3000'
pnpm build
```

Use the backend origin without a trailing slash or `/tarang/v1` suffix. `localhost` would refer to the browsing device. The API origin is compiled into the bundle; changing it requires a rebuild.

## Serve

From the repository root on the server, run:

```sh
node serve.mjs 8080
```

This serves `dist/` directly. Keep the process running with the host's service manager for unattended use. Open `http://rss-server:8080` from a tailnet device.

The bundled server listens on all interfaces. Use the host firewall to restrict ports 8080 and 3000 to Tailscale traffic, and the tailnet access policy to restrict clients. Tarangcat has no login flow. The browser connects directly to Tarang on port 3000, so its CORS policy must permit the frontend origin `http://rss-server:8080`.

Serve at the origin root: assets use absolute `/assets/`, `/fonts/`, and `/images/` paths. Hash routes such as `#!/settings` need no server-side rewrite.

## Verify and update

Open `http://rss-server:3000/tarang/v1/summary` from the browsing device and confirm that it returns JSON. Then open the frontend and confirm that the feed list loads. Add, edit, and delete a disposable feed to verify API writes. If the API loads directly but the feed list fails, inspect the browser console for CORS errors.

For updates, stop the static server, keep a copy of the previous `dist/`, rebuild with the same API origin, and restart the server. Reload the browser after deployment. Restore the previous `dist/` to roll back.
