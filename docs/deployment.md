# Deploy

Tarangcat requires a static web server and a running Tarang backend. Publish it at the origin root: the generated page uses absolute `/assets/`, `/fonts/`, and `/images/` paths. Deployment under a path prefix is not supported.

## Build for the target origin

Install dependencies with `pnpm install --frozen-lockfile`. For a same-origin deployment, unset `TARANG_API_BASE` and run `pnpm build`:

```sh
unset TARANG_API_BASE
pnpm build
```

In PowerShell:

```powershell
Remove-Item Env:TARANG_API_BASE -ErrorAction SilentlyContinue
pnpm build
```

For a separate backend origin, set `TARANG_API_BASE` to that origin before building, as in the [local tutorial](tutorial.md). Use an origin without a trailing slash or `/tarang/v1` suffix. The browser must be able to reach it; an HTTPS frontend requires an HTTPS backend. Configure the backend's CORS policy for the frontend origin.

`TARANG_API_BASE` is compiled into JavaScript. Changing a web server environment variable after deployment has no effect. Rebuild when the API origin changes.

## Serve behind a reverse proxy

Copy the complete `dist/` directory into a new release directory on the server. Configure the web server to serve that directory and proxy `/tarang/v1/` to Tarang. This Nginx server block assumes Tarang listens on the server's loopback port 3000 and static files are installed at `/srv/tarangcat/current`:

```nginx
server {
    listen 80;
    server_name rss.example.com;
    root /srv/tarangcat/current;
    index index.html;

    location /tarang/v1/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    location = /index.html {
        add_header Cache-Control "no-cache";
    }

    location / {
        try_files $uri $uri/ =404;
    }
}
```

Replace the hostname and paths with the deployment values. Validate the configuration with `nginx -t`, then reload Nginx. Configure HTTPS at the proxy or hosting ingress before use outside a trusted local network. The example HTTP block does not configure certificates.

Tarangcat sends no authentication credentials explicitly and contains no login flow. Protect both static files and API routes with the deployment's network boundary or access proxy. Protecting only the frontend leaves the API accessible.

Hash routes such as `#!/settings` are handled in the browser. No server-side route rewrite is needed. `pnpm serve` is a local verification server, not the production service.

## Verify and update

Open the deployed origin and confirm that JavaScript, CSS, fonts, and images return successfully. Confirm that `GET /tarang/v1/summary` returns JSON and the feed list renders. Add, edit, and delete a disposable feed to verify that API writes pass through the proxy.

For updates, build a complete new release and switch the static root to it atomically. Keep the previous release for rollback. Avoid caching `index.html` across releases; hashed files under `/assets/` can be cached long term. Keep old hashed assets available during the transition for browsers that have already loaded the previous page. Fonts and images have stable filenames and should be revalidated on updates.
